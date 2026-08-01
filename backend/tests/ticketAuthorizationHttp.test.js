import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import jwt from 'jsonwebtoken'
import {
  canonicalAuthResult,
  canonicalAuthUser,
  isCanonicalAuthQuery,
} from './helpers/canonicalAuth.js'

const testJwtSecret = 't'.repeat(32)

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = testJwtSecret
process.env.DB_HOST = '127.0.0.1'
process.env.DB_PORT = '5432'
process.env.DB_USER = 'test_user'
process.env.DB_PASSWORD = 'test_password_not_used'
process.env.DB_NAME = 'test_database'
process.env.CORS_ORIGINS = 'http://localhost:5173'

const { app } = await import('../src/app.js')
const { pool } = await import('../src/config/database.js')
const { addSseClient } = await import('../src/services/realtimeService.js')

const actors = {
  reporterA: {
    id: 1,
    nama: 'Reporter A',
    role: 'user',
    permissions: { tickets: 'read_only' },
  },
  reporterB: {
    id: 2,
    nama: 'Reporter B',
    role: 'user',
    permissions: { tickets: 'read_only' },
  },
  adminA: {
    id: 3,
    nama: 'Admin Queue A',
    role: 'admin',
    permissions: { tickets: 'full' },
  },
  adminB: {
    id: 4,
    nama: 'Admin Queue B',
    role: 'admin',
    permissions: { tickets: 'full' },
  },
  assigneeA: {
    id: 5,
    nama: 'Assignee A',
    role: 'admin',
    permissions: { tickets: 'full' },
  },
  adminReadOnly: {
    id: 6,
    nama: 'Read Only Admin',
    role: 'admin',
    permissions: { tickets: 'read_only' },
  },
  unknown: {
    id: 8,
    nama: 'Unknown Role',
    role: 'teknisi',
    permissions: { tickets: 'full' },
  },
  superadmin: {
    id: 9,
    nama: 'Super Admin',
    role: 'superadmin',
    permissions: {},
  },
}

const tickets = new Map([
  [
    101,
    {
      id: 101,
      nomor_tiket: 'TCK-A-OPEN',
      judul: 'Ticket A Open',
      kategori: 'IT',
      prioritas: 'High (1day)',
      status_tiket: 'Open',
      queue_id: 10,
      pelapor_user_id: 1,
      assigned_to_user_id: 5,
      pelapor: 'Reporter A',
      assigned_to: 'Assignee A',
      attachment: 'data:image/png;base64,secret',
      dibuat_pada: '2026-07-30T00:00:00.000Z',
    },
  ],
  [
    102,
    {
      id: 102,
      nomor_tiket: 'TCK-B-OPEN',
      judul: 'Ticket B Open',
      kategori: 'HR',
      prioritas: 'Medium (3d)',
      status_tiket: 'Open',
      queue_id: 20,
      pelapor_user_id: 2,
      assigned_to_user_id: null,
      pelapor: 'Reporter B',
      assigned_to: null,
      attachment: null,
      dibuat_pada: '2026-07-29T00:00:00.000Z',
    },
  ],
  [
    103,
    {
      id: 103,
      nomor_tiket: 'TCK-LEGACY',
      judul: 'Legacy Ticket',
      kategori: 'IT',
      prioritas: 'Low (7d)',
      status_tiket: 'Open',
      queue_id: 10,
      pelapor_user_id: null,
      assigned_to_user_id: null,
      pelapor: 'Reporter A',
      assigned_to: null,
      attachment: null,
      dibuat_pada: '2026-07-28T00:00:00.000Z',
    },
  ],
  [
    104,
    {
      id: 104,
      nomor_tiket: 'TCK-A-RESOLVED',
      judul: 'Ticket A Resolved',
      kategori: 'IT',
      prioritas: 'Medium (3d)',
      status_tiket: 'Resolved',
      queue_id: 10,
      pelapor_user_id: 1,
      assigned_to_user_id: 5,
      pelapor: 'Reporter A',
      assigned_to: 'Assignee A',
      attachment: null,
      dibuat_pada: '2026-07-27T00:00:00.000Z',
    },
  ],
])

const memberships = new Map([
  [3, new Set([10])],
  [4, new Set([20])],
  [5, new Set()],
  [6, new Set([10])],
])

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim()
}

const issuedClaims = new Map()

function createToken(actor, roleOverride) {
  const claims = {
    ...actor,
    role: roleOverride ?? actor.role,
    email: `${actor.id}@example.test`,
  }
  issuedClaims.set(actor.id, claims)
  return jwt.sign(claims, testJwtSecret, { expiresIn: '5m' })
}

function authorizationHeaders(actor, extra = {}) {
  if (!actor) return extra
  return {
    Authorization: `Bearer ${createToken(actor)}`,
    ...extra,
  }
}

async function startServer(t) {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  )
  return server.address().port
}

test('ticket HTTP surfaces enforce the canonical resource matrix and actor integrity', async (t) => {
  const originalQuery = pool.query
  const originalConnect = pool.connect
  const queryLog = []
  const mutations = []
  const commentInserts = []
  const transactionEvents = []
  const caspStored = new Set()
  let caspDetailReads = 0
  let ticketAttachmentReads = 0
  let commentAttachmentReads = 0

  function ticketContext(ticketId, actorId) {
    const ticket = tickets.get(Number(ticketId))
    if (!ticket) return { rowCount: 0, rows: [] }
    return {
      rowCount: 1,
      rows: [
        {
          id: ticket.id,
          nomor_tiket: ticket.nomor_tiket,
          status_tiket: ticket.status_tiket,
          queue_id: ticket.queue_id,
          pelapor_user_id: ticket.pelapor_user_id,
          assigned_to_user_id: ticket.assigned_to_user_id,
          pelapor: ticket.pelapor,
          assigned_to: ticket.assigned_to,
          is_queue_member: memberships.get(Number(actorId))?.has(ticket.queue_id) === true,
        },
      ],
    }
  }

  function isBootstrapQuery(sql) {
    return (
      sql.startsWith('CREATE TABLE IF NOT EXISTS tickets') ||
      sql.startsWith('ALTER TABLE tickets ADD COLUMN') ||
      sql.startsWith('CREATE TABLE IF NOT EXISTS ticket_queues') ||
      sql.startsWith('INSERT INTO ticket_queues') ||
      sql.startsWith('CREATE TABLE IF NOT EXISTS user_ticket_queues') ||
      sql.startsWith('ALTER TABLE tickets ADD COLUMN IF NOT EXISTS queue_id') ||
      sql.startsWith('DO $$') ||
      sql.startsWith('CREATE INDEX IF NOT EXISTS idx_tickets_queue_status') ||
      sql.startsWith('UPDATE tickets t SET queue_id') ||
      (sql.startsWith('UPDATE tickets t SET pelapor_user_id') && sql.includes('FROM users u')) ||
      (sql.startsWith('UPDATE tickets t SET assigned_to_user_id') && sql.includes('FROM users u'))
    )
  }

  async function handleQuery(rawSql, parameters = [], source = 'pool') {
    const sql = normalizeSql(rawSql)

    if (isCanonicalAuthQuery(sql)) {
      const claims = issuedClaims.get(Number(parameters[0]))
      return canonicalAuthResult(
        claims ? canonicalAuthUser({ ...claims, id: Number(parameters[0]) }) : null,
      )
    }

    queryLog.push({ sql, parameters: [...parameters], source })

    if (isBootstrapQuery(sql) || sql === 'SELECT COUNT(*)::int AS count FROM tickets') {
      throw new Error(`HTTP request must not run schema, seed, or backfill SQL: ${sql}`)
    }

    if (
      sql.startsWith('SELECT t.id, t.nomor_tiket, t.status_tiket') &&
      sql.includes('AS is_queue_member')
    ) {
      return ticketContext(parameters[0], parameters[1])
    }

    if (sql.includes('COALESCE(comm_count.total_komentar')) {
      const { attachment: _attachment, ...ticket } = tickets.get(101)
      return {
        rowCount: 1,
        rows: [{ ...ticket, has_attachment: true, total_komentar: 1 }],
      }
    }
    if (sql.includes('COUNT(*)::int AS "totalTickets"')) {
      return {
        rowCount: 1,
        rows: [
          {
            totalTickets: 1,
            openTickets: 1,
            pendingTickets: 0,
            closedTickets: 0,
            unassignedTickets: 0,
          },
        ],
      }
    }
    if (sql.includes('ORDER BY t.id DESC LIMIT 5')) {
      return { rowCount: 0, rows: [] }
    }
    if (sql.includes('COUNT(*)::int AS "totalRatings"')) {
      return {
        rowCount: 1,
        rows: [
          {
            totalRatings: 0,
            averageRating: 0,
            r1: 0,
            r2: 0,
            r3: 0,
            r4: 0,
            r5: 0,
          },
        ],
      }
    }
    if (sql.includes("TO_CHAR(cr.submitted_at, 'Mon YYYY')")) {
      return { rowCount: 0, rows: [] }
    }

    if (sql.startsWith('SELECT * FROM log_riwayat_tiket')) {
      return {
        rowCount: 1,
        rows: [{ id: 1, id_tiket: parameters[0], aksi: 'PEMBUATAN' }],
      }
    }
    if (sql.startsWith('SELECT id, id_tiket, nama_pengguna, role_pengguna')) {
      return {
        rowCount: 1,
        rows: [
          {
            id: 1,
            id_tiket: parameters[0],
            nama_pengguna: 'Reporter A',
            role_pengguna: 'user',
            pesan: 'Existing',
            dibuat_pada: '2026-07-30T00:00:00.000Z',
            has_attachment: true,
          },
        ],
      }
    }
    if (sql === 'SELECT attachment FROM tickets WHERE id = $1') {
      ticketAttachmentReads += 1
      const ticket = tickets.get(Number(parameters[0]))
      return ticket ? { rowCount: 1, rows: [{ attachment: ticket.attachment }] } : { rowCount: 0, rows: [] }
    }
    if (sql.startsWith('SELECT attachment FROM komentar_tiket')) {
      commentAttachmentReads += 1
      return Number(parameters[0]) === 101 && Number(parameters[1]) === 1
        ? { rowCount: 1, rows: [{ attachment: 'data:image/png;base64,comment-secret' }] }
        : { rowCount: 0, rows: [] }
    }
    if (sql.startsWith('SELECT rating, feedback, submitted_at')) {
      caspDetailReads += 1
      return {
        rowCount: 1,
        rows: [
          {
            rating: 5,
            feedback: 'Private feedback',
            submitted_at: '2026-07-30T00:00:00.000Z',
            reporter_name_snapshot: 'Reporter A',
            assignee_name_snapshot: 'Assignee A',
          },
        ],
      }
    }

    if (sql.startsWith('SELECT id, nomor_tiket, judul, kategori')) {
      const ticket = tickets.get(Number(parameters[0]))
      return ticket ? { rowCount: 1, rows: [ticket] } : { rowCount: 0, rows: [] }
    }
    if (sql.startsWith('UPDATE tickets t SET judul')) {
      mutations.push({ sql, parameters: [...parameters] })
      const ticket = tickets.get(Number(parameters[7]))
      return {
        rowCount: ticket ? 1 : 0,
        rows: ticket
          ? [
              {
                ...ticket,
                judul: parameters[0] ?? ticket.judul,
                status_tiket: parameters[4] ?? ticket.status_tiket,
                resolved_at: parameters[12]
                  ? '2026-07-30T12:00:00.000Z'
                  : (ticket.resolved_at ?? null),
                resolved_by_user_id: parameters[12]
                  ? parameters[9]
                  : (ticket.resolved_by_user_id ?? null),
              },
            ]
          : [],
      }
    }
    if (sql.startsWith('UPDATE tickets SET resolved_at')) {
      mutations.push({ sql, parameters: [...parameters] })
      return { rowCount: 1, rows: [] }
    }
    if (
      sql.startsWith('UPDATE tickets t SET assigned_to_user_id') &&
      sql.includes("status_tiket = 'In Progress'")
    ) {
      mutations.push({ sql, parameters: [...parameters] })
      const ticket = tickets.get(Number(parameters[2]))
      return ticket
        ? {
            rowCount: 1,
            rows: [
              {
                ...ticket,
                assigned_to_user_id: parameters[0],
                assigned_to: parameters[1],
                status_tiket: 'In Progress',
              },
            ],
          }
        : { rowCount: 0, rows: [] }
    }
    if (
      sql.startsWith('SELECT u.id, u.nama, u.role, u.permissions, EXISTS') &&
      sql.includes('FROM users u')
    ) {
      const target = Object.values(actors).find(
        (candidate) => candidate.id === Number(parameters[0]),
      )
      if (!target) return { rowCount: 0, rows: [] }
      return {
        rowCount: 1,
        rows: [
          {
            id: target.id,
            nama: target.nama,
            role: target.role,
            permissions: target.permissions,
            is_queue_member: memberships.get(target.id)?.has(Number(parameters[1])) === true,
          },
        ],
      }
    }
    if (
      sql.startsWith('UPDATE tickets AS t SET assigned_to_user_id') &&
      sql.includes('assigned_to_user_id IS NOT DISTINCT FROM')
    ) {
      mutations.push({ sql, parameters: [...parameters] })
      const ticket = tickets.get(Number(parameters[2]))
      const expectedAssignee = parameters[3]
      const expectedQueue = parameters[4]
      if (
        !ticket ||
        ticket.assigned_to_user_id !== expectedAssignee ||
        ticket.queue_id !== expectedQueue ||
        ['closed', 'resolved', 'cancelled'].includes(ticket.status_tiket.toLowerCase())
      ) {
        return { rowCount: 0, rows: [] }
      }
      return {
        rowCount: 1,
        rows: [
          {
            ...ticket,
            assigned_to_user_id: parameters[0],
            assigned_to: parameters[1],
          },
        ],
      }
    }
    if (sql.startsWith('DELETE FROM tickets WHERE id')) {
      mutations.push({ sql, parameters: [...parameters] })
      return tickets.has(Number(parameters[0]))
        ? { rowCount: 1, rows: [{ id: Number(parameters[0]) }] }
        : { rowCount: 0, rows: [] }
    }
    if (sql.startsWith('INSERT INTO log_riwayat_tiket')) {
      mutations.push({ sql, parameters: [...parameters] })
      return { rowCount: 1, rows: [] }
    }

    throw new Error(`Unexpected ${source} query: ${sql}`)
  }

  pool.query = (sql, parameters) => handleQuery(sql, parameters, 'pool')
  pool.connect = async () => ({
    query: async (rawSql, parameters = []) => {
      const sql = normalizeSql(rawSql)
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        transactionEvents.push(sql)
        return { rowCount: 0, rows: [] }
      }
      if (
        sql.startsWith('SELECT t.id, t.nomor_tiket, t.status_tiket') &&
        sql.includes('AS is_queue_member')
      ) {
        queryLog.push({ sql, parameters: [...parameters], source: 'client' })
        return ticketContext(parameters[0], parameters[1])
      }
      if (sql.startsWith('INSERT INTO komentar_tiket')) {
        const insert = { sql, parameters: [...parameters] }
        commentInserts.push(insert)
        mutations.push(insert)
        return {
          rowCount: 1,
          rows: [
            {
              id: 501 + commentInserts.length,
              id_tiket: parameters[0],
              nama_pengguna: parameters[1],
              role_pengguna: parameters[2],
              pesan: parameters[3],
              attachment: parameters[4],
            },
          ],
        }
      }
      if (sql.startsWith('INSERT INTO log_riwayat_tiket')) {
        mutations.push({ sql, parameters: [...parameters] })
        return { rowCount: 1, rows: [] }
      }
      if (sql.startsWith('SELECT id FROM ticket_casp_ratings')) {
        return caspStored.has(Number(parameters[0]))
          ? { rowCount: 1, rows: [{ id: 1 }] }
          : { rowCount: 0, rows: [] }
      }
      if (sql.startsWith('INSERT INTO ticket_casp_ratings')) {
        caspStored.add(Number(parameters[0]))
        mutations.push({ sql, parameters: [...parameters] })
        return {
          rowCount: 1,
          rows: [
            {
              rating: parameters[5],
              feedback: parameters[6],
              submitted_at: '2026-07-30T00:00:00.000Z',
            },
          ],
        }
      }
      return handleQuery(rawSql, parameters, 'client')
    },
    release() {},
  })

  t.after(() => {
    pool.query = originalQuery
    pool.connect = originalConnect
  })

  const port = await startServer(t)
  const url = (path) => `http://127.0.0.1:${port}${path}`
  const request = async (path, { actor, method = 'GET', body } = {}) => {
    const headers = authorizationHeaders(
      actor,
      body === undefined ? {} : { 'Content-Type': 'application/json' },
    )
    return fetch(url(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  // An authorized request must go directly to domain queries without runtime bootstrap SQL.
  const initialList = await request('/api/tickets', {
    actor: actors.superadmin,
  })
  assert.equal(initialList.status, 200)
  const initialListBody = await initialList.json()
  assert.equal(initialListBody[0].has_attachment, true)
  assert.equal(Object.hasOwn(initialListBody[0], 'attachment'), false)
  const listQuery = queryLog.find(({ sql }) => sql.includes('COALESCE(comm_count.total_komentar'))
  assert.ok(listQuery)
  assert.doesNotMatch(listQuery.sql, /\bt\.\*/)
  assert.doesNotMatch(listQuery.sql, /BTRIM\s*\(/)
  assert.match(listQuery.sql, /AS has_attachment/)
  assert.equal(
    queryLog.some(({ sql }) => isBootstrapQuery(sql)),
    false,
  )

  const protectedRequests = [
    ['/api/tickets/101/history', 'GET'],
    ['/api/tickets/101/comments', 'GET'],
    ['/api/tickets/101/attachment', 'GET'],
    ['/api/tickets/101/comments/1/attachment', 'GET'],
    ['/api/tickets/104/casp', 'GET'],
    ['/api/tickets/101', 'PUT'],
    ['/api/tickets/101', 'DELETE'],
  ]
  for (const [path, method] of protectedRequests) {
    const response = await request(path, {
      method,
      body: method === 'PUT' ? { judul: 'Denied' } : undefined,
    })
    assert.equal(response.status, 401, `${method} ${path}`)
  }
  assert.equal(
    (
      await request('/api/tickets/102/claim', {
        method: 'POST',
        body: {},
      })
    ).status,
    401,
  )
  assert.equal(
    (
      await request('/api/tickets/101/reassign', {
        method: 'POST',
        body: { target_user_id: actors.adminA.id },
      })
    ).status,
    401,
  )
  assert.equal(
    (
      await request('/api/tickets/101/comments', {
        method: 'POST',
        body: { pesan: 'No token' },
      })
    ).status,
    401,
  )
  assert.equal(
    (
      await request('/api/tickets/104/casp', {
        method: 'POST',
        body: { rating: 5 },
      })
    ).status,
    401,
  )

  const beforeUnknown = queryLog.length
  for (const [path, method] of protectedRequests) {
    const response = await request(path, {
      actor: actors.unknown,
      method,
      body: method === 'PUT' ? { judul: 'Denied' } : undefined,
    })
    assert.equal(response.status, 401, `${method} ${path}`)
  }
  assert.equal(queryLog.length, beforeUnknown, 'unknown role must fail before controller queries')

  for (const path of ['/api/tickets/101/history', '/api/tickets/101/comments']) {
    assert.equal((await request(path, { actor: actors.reporterA })).status, 200)
    assert.equal((await request(path, { actor: actors.reporterB })).status, 403)
    assert.equal((await request(path, { actor: actors.adminA })).status, 200)
    assert.equal((await request(path, { actor: actors.adminB })).status, 403)
    assert.equal((await request(path, { actor: actors.assigneeA })).status, 200)
    assert.equal((await request(path, { actor: actors.superadmin })).status, 200)
  }

  const commentsList = await request('/api/tickets/101/comments', {
    actor: actors.reporterA,
  })
  assert.equal(commentsList.status, 200)
  const commentsListBody = await commentsList.json()
  assert.equal(commentsListBody[0].has_attachment, true)
  assert.equal(Object.hasOwn(commentsListBody[0], 'attachment'), false)
  const commentsListQuery = queryLog.find(({ sql }) =>
    sql.startsWith('SELECT id, id_tiket, nama_pengguna, role_pengguna'),
  )
  assert.ok(commentsListQuery)
  assert.doesNotMatch(commentsListQuery.sql, /SELECT \*/)
  assert.doesNotMatch(commentsListQuery.sql, /BTRIM\s*\(/)

  const attachmentReadsBeforeDenied = ticketAttachmentReads + commentAttachmentReads
  assert.equal(
    (await request('/api/tickets/101/attachment', { actor: actors.reporterB })).status,
    403,
  )
  assert.equal(
    (
      await request('/api/tickets/101/comments/1/attachment', {
        actor: actors.adminB,
      })
    ).status,
    403,
  )
  assert.equal(
    ticketAttachmentReads + commentAttachmentReads,
    attachmentReadsBeforeDenied,
    'denied attachment reads must not query inline payloads',
  )

  const ticketAttachment = await request('/api/tickets/101/attachment', {
    actor: actors.reporterA,
  })
  assert.equal(ticketAttachment.status, 200)
  assert.equal((await ticketAttachment.json()).attachment, tickets.get(101).attachment)

  const commentAttachment = await request('/api/tickets/101/comments/1/attachment', {
    actor: actors.adminA,
  })
  assert.equal(commentAttachment.status, 200)
  assert.equal(
    (await commentAttachment.json()).attachment,
    'data:image/png;base64,comment-secret',
  )
  assert.equal(
    (
      await request('/api/tickets/101/comments/999/attachment', {
        actor: actors.reporterA,
      })
    ).status,
    404,
  )
  assert.equal(
    (await request('/api/tickets/not-a-number/attachment', { actor: actors.reporterA })).status,
    400,
  )
  assert.equal(
    (await request('/api/tickets/102/attachment', { actor: actors.reporterB })).status,
    404,
  )
  assert.equal(
    (
      await request('/api/tickets/101/comments/not-a-number/attachment', {
        actor: actors.reporterA,
      })
    ).status,
    400,
  )

  assert.equal(
    (await request('/api/tickets/103/history', { actor: actors.reporterA })).status,
    403,
    'legacy display-name ownership must be denied',
  )
  assert.equal((await request('/api/tickets/103/history', { actor: actors.adminA })).status, 200)
  assert.equal(
    (await request('/api/tickets/103/history', { actor: actors.superadmin })).status,
    200,
  )

  const ownerCasp = await request('/api/tickets/104/casp', {
    actor: actors.reporterA,
  })
  assert.equal(ownerCasp.status, 200)
  assert.equal((await ownerCasp.json()).rating.feedback, 'Private feedback')

  const caspReadsBeforeDenied = caspDetailReads
  assert.equal((await request('/api/tickets/104/casp', { actor: actors.reporterB })).status, 403)
  assert.equal((await request('/api/tickets/104/casp', { actor: actors.adminB })).status, 403)
  assert.equal(caspDetailReads, caspReadsBeforeDenied, 'denied CASP reads must not query ratings')
  assert.equal((await request('/api/tickets/104/casp', { actor: actors.adminA })).status, 200)
  assert.equal((await request('/api/tickets/104/casp', { actor: actors.assigneeA })).status, 403)
  assert.equal((await request('/api/tickets/104/casp', { actor: actors.superadmin })).status, 200)

  const mutationsBeforeDeniedUpdate = mutations.length
  assert.equal(
    (
      await request('/api/tickets/101', {
        actor: actors.reporterA,
        method: 'PUT',
        body: { judul: 'Denied reporter update' },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/tickets/101', {
        actor: actors.adminB,
        method: 'PUT',
        body: { judul: 'Denied other queue update' },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/tickets/101', {
        actor: actors.adminReadOnly,
        method: 'PUT',
        body: { judul: 'Denied read-only update' },
      })
    ).status,
    403,
  )
  assert.equal(mutations.length, mutationsBeforeDeniedUpdate)

  for (const invalidBody of [
    {},
    { status_tiket: 'Escalated' },
    { status_tiket: 1 },
    { assigned_to_user_id: actors.superadmin.id },
    { queue_id: '10' },
  ]) {
    assert.equal(
      (
        await request('/api/tickets/101', {
          actor: actors.adminA,
          method: 'PUT',
          body: invalidBody,
        })
      ).status,
      400,
    )
  }
  assert.equal(mutations.length, mutationsBeforeDeniedUpdate)

  const detailUpdate = await request('/api/tickets/101', {
    actor: actors.adminA,
    method: 'PUT',
    body: { judul: 'Admin A update' },
  })
  assert.equal(detailUpdate.status, 200)
  const detailUpdateBody = await detailUpdate.json()
  assert.equal(detailUpdateBody.has_attachment, true)
  assert.equal(Object.hasOwn(detailUpdateBody, 'attachment'), false)
  const detailUpdateMutation = mutations.find((entry) =>
    entry.sql.startsWith('UPDATE tickets t SET judul'),
  )
  assert.match(detailUpdateMutation.sql, /kategori = CASE WHEN \$11 = TRUE/)
  assert.match(detailUpdateMutation.sql, /attachment = CASE WHEN \$12 = TRUE/)
  assert.match(detailUpdateMutation.sql, /queue_id = CASE WHEN \$11 = TRUE/)
  assert.equal(detailUpdateMutation.parameters[10], false)
  assert.equal(detailUpdateMutation.parameters[11], false)
  assert.match(detailUpdateMutation.sql, /resolved_at = CASE WHEN \$13 = TRUE/)

  const resolvedUpdate = await request('/api/tickets/101', {
    actor: actors.adminA,
    method: 'PUT',
    body: { status_tiket: 'Resolved' },
  })
  assert.equal(resolvedUpdate.status, 200)
  assert.deepEqual(
    (({ status_tiket, resolved_at, resolved_by_user_id }) => ({
      status_tiket,
      resolved_at,
      resolved_by_user_id,
    }))(await resolvedUpdate.json()),
    {
      status_tiket: 'Resolved',
      resolved_at: '2026-07-30T12:00:00.000Z',
      resolved_by_user_id: actors.adminA.id,
    },
  )
  assert.equal(
    (
      await request('/api/tickets/101', {
        actor: actors.superadmin,
        method: 'PUT',
        body: { judul: 'Superadmin update' },
      })
    ).status,
    200,
  )

  const deletesBeforeDenied = mutations.filter((entry) =>
    entry.sql.startsWith('DELETE FROM tickets'),
  ).length
  assert.equal(
    (
      await request('/api/tickets/101', {
        actor: actors.adminA,
        method: 'DELETE',
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/tickets/101', {
        actor: actors.reporterA,
        method: 'DELETE',
      })
    ).status,
    403,
  )
  assert.equal(
    mutations.filter((entry) => entry.sql.startsWith('DELETE FROM tickets')).length,
    deletesBeforeDenied,
  )
  assert.equal(
    (
      await request('/api/tickets/101', {
        actor: actors.superadmin,
        method: 'DELETE',
      })
    ).status,
    200,
  )

  const claimMutationsBeforeDenied = mutations.length
  assert.equal(
    (
      await request('/api/tickets/102/claim', {
        actor: actors.adminA,
        method: 'POST',
        body: {},
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/tickets/102/claim', {
        actor: actors.adminReadOnly,
        method: 'POST',
        body: {},
      })
    ).status,
    403,
  )
  assert.equal(mutations.length, claimMutationsBeforeDenied)
  assert.equal(
    (
      await request('/api/tickets/102/claim', {
        actor: actors.adminB,
        method: 'POST',
        body: {},
      })
    ).status,
    200,
  )

  const reassignMutationsBeforeDenied = mutations.length
  assert.equal(
    (
      await request('/api/tickets/101/reassign', {
        actor: actors.adminA,
        method: 'POST',
        body: { target_user_id: actors.adminA.id },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/tickets/101/reassign', {
        actor: actors.adminB,
        method: 'POST',
        body: { target_user_id: actors.adminB.id },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/tickets/101/reassign', {
        actor: actors.assigneeA,
        method: 'POST',
        body: { target_user_id: actors.adminReadOnly.id },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/tickets/101/reassign', {
        actor: actors.assigneeA,
        method: 'POST',
        body: { target_user_id: actors.superadmin.id },
      })
    ).status,
    403,
  )
  assert.equal(mutations.length, reassignMutationsBeforeDenied)
  assert.equal(
    (
      await request('/api/tickets/101/reassign', {
        actor: actors.assigneeA,
        method: 'POST',
        body: { target_user_id: actors.adminA.id },
      })
    ).status,
    200,
  )
  const reassignMutation = mutations.find((entry) =>
    entry.sql.startsWith('UPDATE tickets AS t SET assigned_to_user_id'),
  )
  assert.match(reassignMutation.sql, /t\.queue_id IS NOT DISTINCT FROM \$5/)
  assert.match(reassignMutation.sql, /status_tiket.*NOT IN/)
  assert.match(reassignMutation.sql, /FROM users target_user/)
  assert.match(reassignMutation.sql, /user_ticket_queues target_scope/)
  assert.match(reassignMutation.sql, /target_user\.permissions/)
  assert.equal(reassignMutation.parameters[4], 10)
  assert.equal(reassignMutation.parameters[5], false)

  const commentsBeforeSpoof = commentInserts.length
  assert.equal(
    (
      await request('/api/tickets/101/comments', {
        actor: actors.reporterA,
        method: 'POST',
        body: {
          pesan: 'Forged actor',
          nama_pengguna: 'Forged Superadmin',
          role_pengguna: 'superadmin',
        },
      })
    ).status,
    400,
  )
  assert.equal(commentInserts.length, commentsBeforeSpoof)

  const validComment = await request('/api/tickets/101/comments', {
    actor: actors.reporterA,
    method: 'POST',
    body: {
      pesan: 'Komentar canonical',
      attachment:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    },
  })
  assert.equal(validComment.status, 201)
  const validCommentBody = await validComment.json()
  assert.equal(validCommentBody.has_attachment, true)
  assert.equal(Object.hasOwn(validCommentBody, 'attachment'), false)
  assert.deepEqual(commentInserts.at(-1).parameters.slice(0, 4), [
    101,
    actors.reporterA.nama,
    'user',
    'Komentar canonical',
  ])

  const commentsBeforeDenied = commentInserts.length
  const deniedCommentEvents = []
  const removeDeniedCommentClient = addSseClient(
    {
      on() {},
      write(chunk) {
        deniedCommentEvents.push(chunk)
        return true
      },
    },
    actors.reporterA,
  )
  assert.equal(
    (
      await request('/api/tickets/101/comments', {
        actor: actors.reporterB,
        method: 'POST',
        body: { pesan: 'Unrelated' },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/tickets/101/comments', {
        actor: actors.adminB,
        method: 'POST',
        body: { pesan: 'Other queue' },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/tickets/104/comments', {
        actor: actors.reporterA,
        method: 'POST',
        body: { pesan: 'Resolved comment' },
      })
    ).status,
    403,
  )
  assert.equal(commentInserts.length, commentsBeforeDenied)
  assert.equal(deniedCommentEvents.length, 0)
  removeDeniedCommentClient()

  assert.equal(
    (
      await request('/api/tickets/101/comments', {
        actor: actors.adminA,
        method: 'POST',
        body: { pesan: 'Authorized queue admin' },
      })
    ).status,
    201,
  )
  assert.equal(
    (
      await request('/api/tickets/101/comments', {
        actor: actors.reporterA,
        method: 'POST',
        body: { pesan: '' },
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await request('/api/tickets/101/comments', {
        actor: actors.reporterA,
        method: 'POST',
        body: { pesan: 'x'.repeat(4001) },
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await request('/api/tickets/101/comments', {
        actor: actors.reporterA,
        method: 'POST',
        body: {
          pesan: 'Invalid attachment',
          attachment: 'data:text/html;base64,PHNjcmlwdD4=',
        },
      })
    ).status,
    400,
  )

  const submitCasp = await request('/api/tickets/104/casp', {
    actor: actors.reporterA,
    method: 'POST',
    body: { rating: 5, feedback: 'Resolved well' },
  })
  assert.equal(submitCasp.status, 201)
  assert.equal(
    (
      await request('/api/tickets/104/casp', {
        actor: actors.reporterA,
        method: 'POST',
        body: { rating: 5 },
      })
    ).status,
    409,
  )
  assert.equal(
    (
      await request('/api/tickets/104/casp', {
        actor: actors.assigneeA,
        method: 'POST',
        body: { rating: 5 },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/tickets/104/casp', {
        actor: actors.reporterB,
        method: 'POST',
        body: { rating: 5 },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/tickets/104/casp', {
        actor: actors.reporterA,
        method: 'POST',
        body: { rating: '5' },
      })
    ).status,
    400,
  )
  assert.ok(transactionEvents.includes('COMMIT'))
  assert.ok(transactionEvents.includes('ROLLBACK'))

  const aggregateStart = queryLog.length
  assert.equal((await request('/api/tickets/stats', { actor: actors.reporterA })).status, 200)
  assert.equal((await request('/api/tickets/stats', { actor: actors.adminA })).status, 200)
  assert.equal((await request('/api/tickets/stats', { actor: actors.superadmin })).status, 200)
  assert.equal((await request('/api/tickets/casp/stats', { actor: actors.adminA })).status, 200)
  assert.equal((await request('/api/tickets/casp/trend', { actor: actors.adminA })).status, 200)

  const aggregateQueries = queryLog.slice(aggregateStart)
  const reporterStats = aggregateQueries.find(
    (entry) => entry.sql.includes('COUNT(*)::int AS "totalTickets"') && entry.parameters[0] === 1,
  )
  assert.match(reporterStats.sql, /t\.pelapor_user_id = \$1/)

  const adminAggregateQueries = aggregateQueries.filter(
    (entry) =>
      entry.parameters[0] === 3 &&
      (entry.sql.includes('COUNT(*)::int AS "totalTickets"') ||
        entry.sql.includes('COUNT(*)::int AS "totalRatings"') ||
        entry.sql.includes("TO_CHAR(cr.submitted_at, 'Mon YYYY')")),
  )
  assert.ok(adminAggregateQueries.length >= 3)
  for (const entry of adminAggregateQueries) {
    assert.match(entry.sql, /user_ticket_queues/)
    assert.doesNotMatch(entry.sql, /assigned_to_user_id = \$1 OR/)
  }
})
