import test from 'node:test'
import assert from 'node:assert/strict'
import nodemailer from 'nodemailer'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 't'.repeat(32)
process.env.DB_HOST = '127.0.0.1'
process.env.DB_PORT = '5432'
process.env.DB_USER = 'test_user'
process.env.DB_PASSWORD = 'test_password_not_used'
process.env.DB_NAME = 'test_database'
process.env.CORS_ORIGINS = 'http://localhost:5173'
process.env.EMAIL_ENABLED = 'true'
process.env.SMTP_HOST = 'smtp.test'
process.env.SMTP_PORT = '587'
process.env.SMTP_USER = 'user'
process.env.SMTP_PASS = 'pass'
process.env.SMTP_SECURE = 'false'

// Capture every email the service tries to send by stubbing the transporter.
const sentEmails = []
const fakeTransporter = {
  async sendMail(message) {
    sentEmails.push(message)
    return { messageId: `test-${sentEmails.length}` }
  },
}
nodemailer.createTransport = () => fakeTransporter

await import('../src/config/database.js')
const { handleTicketEventNotification } = await import(
  '../src/services/emailNotificationService.js'
)

function dbWith(rows) {
  return {
    async query(sql, params) {
      if (sql.includes('FROM users WHERE id = $1')) {
        const row = rows.find((u) => Number(u.id) === Number(params[0]))
        return { rows: row ? [row] : [] }
      }
      if (sql.includes('FROM users WHERE LOWER(TRIM(nama))')) {
        const name = String(params[0]).toLowerCase().trim()
        const row = rows.find((u) => String(u.nama).toLowerCase().trim() === name)
        return { rows: row ? [row] : [] }
      }
      if (sql.includes('user_ticket_queues')) return { rows: [] }
      return { rows: [] }
    },
  }
}

// BIGINT ids come back as strings from node-postgres (e.g. "10", "5").
const reporter = { id: '10', nama: 'Budi User', email: 'budi@x.com', role: 'user' }
const assigneeAdmin = { id: '5', nama: 'Admin IT', email: 'admin@x.com', role: 'admin' }
const otherAdmin = { id: '88', nama: 'Other Admin', email: 'other@x.com', role: 'admin' }

const queryable = dbWith([reporter, assigneeAdmin, otherAdmin])

const baseTicket = {
  id: 101,
  nomor_tiket: 'TKT-2026-0001',
  judul: 'Printer rusak',
  status_tiket: 'In Progress',
  prioritas: 'High',
  pelapor_user_id: '10',
  assigned_to_user_id: '5',
  pelapor: 'Budi User',
  queue_id: 7,
}

function recipients(emails) {
  return emails.map((e) => e.to)
}

test('TICKET_UPDATED: only the reporter (User) is notified - no email to assignee/admin', async () => {
  await handleTicketEventNotification('TICKET_UPDATED', baseTicket, {
    queryable,
    actorUserId: 5,
    changes: [`Status: 'Open' -> 'In Progress'`],
  })

  const sent = sentEmails.map((e) => e.to)
  assert(sent.includes('budi@x.com'), 'reporter (the User) must be notified')
  assert(!sent.includes('admin@x.com'), 'assignee/admin must NOT receive a notification')
  assert.equal(sent.length, 1, 'only the reporter should receive one email')
})

test('TICKET_UPDATED: user editing own ticket sends no email at all (nothing to notify)', async () => {
  await handleTicketEventNotification('TICKET_UPDATED', baseTicket, {
    queryable,
    actorUserId: 10,
    changes: [`Status: 'Open' -> 'Pending'`],
  })

  const sent = recipients(sentEmails.slice(1))
  assert.equal(sent.length, 0, 'no self-email and no assignee email when only the reporter acts')
})

test('TICKET_UPDATED: admin assigned to ticket changes it - only reporter is emailed', async () => {
  // Actor (99) is the assignee of the ticket and changes the status.
  await handleTicketEventNotification(
    'TICKET_UPDATED',
    { ...baseTicket, assigned_to_user_id: '99' },
    { queryable, actorUserId: 99, changes: [`Status: 'Open' -> 'In Progress'`] },
  )

  const sent = recipients(sentEmails.slice(1))
  assert(sent.includes('budi@x.com'), 'reporter must still be notified')
  assert(!sent.includes('other@x.com'), 'actor/assignee must not be emailed')
  assert.equal(sent.length, 1)
})

test('TICKET_UPDATED: never emails an admin/superadmin, even if they are the reporter', async () => {
  // Reporter is another admin (88); an admin (5) changes the status.
  await handleTicketEventNotification(
    'TICKET_UPDATED',
    { ...baseTicket, pelapor_user_id: '88', pelapor: 'Other Admin' },
    { queryable, actorUserId: 5, changes: [`Status: 'Open' -> 'In Progress'`] },
  )

  const sent = recipients(sentEmails.slice(2))
  assert.equal(sent.length, 0, 'no status-change email should be sent to an admin/superadmin')
})