import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'm'.repeat(32)
process.env.DB_HOST = '127.0.0.1'
process.env.DB_PORT = '5432'
process.env.DB_USER = 'test_user'
process.env.DB_PASSWORD = 'test_password_not_used'
process.env.DB_NAME = 'test_database'
process.env.CORS_ORIGINS = 'http://localhost:5173'

const { pool } = await import('../src/config/database.js')
const { claimTicket, createTicket, reassignTicket, updateTicket } =
  await import('../src/controllers/ticketController.js')
const { addSseClient } = await import('../src/services/realtimeService.js')
const { createTicketIdentity } = await import('../src/services/ticketAccessService.js')

const reporter = {
  id: 1,
  nama: 'Reporter Atomic',
  role: 'user',
  permissions: { tickets: 'read_only' },
}
const admin = {
  id: 3,
  nama: 'Admin Atomic',
  role: 'admin',
  permissions: { tickets: 'full' },
}
const targetAdmin = {
  id: 4,
  nama: 'Target Admin',
  role: 'admin',
  permissions: { tickets: 'full' },
}
const superadmin = {
  id: 9,
  nama: 'Superadmin Observer',
  role: 'superadmin',
  permissions: {},
}
const validPngDataUrl = 'data:image/png;base64,iVBORw0KGgo='

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim()
}

function requestFor(actor, { id = 77, body = {} } = {}) {
  return {
    params: { id: String(id) },
    body,
    ticketIdentity: createTicketIdentity(actor),
  }
}

function responseStub() {
  return {
    statusCode: 200,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

function accessRow(overrides = {}) {
  return {
    id: 77,
    nomor_tiket: 'TKT-2026-000077',
    judul: 'Atomic ticket',
    kategori: 'IT',
    prioritas: 'Medium (3d)',
    status_tiket: 'Open',
    attachment: null,
    queue_id: 10,
    pelapor_user_id: reporter.id,
    assigned_to_user_id: admin.id,
    pelapor: reporter.nama,
    assigned_to: admin.nama,
    is_queue_member: true,
    ...overrides,
  }
}

test('ticket create/update reject non-raster, oversized, and actor-controlled attachment payloads before DB access', async (t) => {
  const originalQuery = pool.query
  const originalConnect = pool.connect
  let databaseCalls = 0
  pool.query = async () => {
    databaseCalls += 1
    throw new Error('database must not be reached')
  }
  pool.connect = async () => {
    databaseCalls += 1
    throw new Error('database must not be reached')
  }
  t.after(() => {
    pool.query = originalQuery
    pool.connect = originalConnect
  })

  const invalidRaster = 'data:text/html;base64,PHNjcmlwdD4='
  const mismatchedRaster = 'data:image/png;base64,R0lGODlh'
  const oversizedBytes = Buffer.alloc(5 * 1024 * 1024 + 1)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(oversizedBytes)
  const oversizedRaster = `data:image/png;base64,${oversizedBytes.toString('base64')}`

  for (const body of [
    { judul: 'Invalid MIME', queue_id: 10, attachment: invalidRaster },
    {
      judul: 'Mismatched magic bytes',
      queue_id: 10,
      attachment: mismatchedRaster,
    },
    { judul: 'Oversized', queue_id: 10, attachment: oversizedRaster },
    {
      judul: 'Forged actor',
      queue_id: 10,
      attachment: null,
      pelapor_user_id: superadmin.id,
    },
  ]) {
    await assert.rejects(
      createTicket(requestFor(reporter, { body }), responseStub()),
      (error) => error.statusCode === (body.attachment === oversizedRaster ? 413 : 400),
    )
  }

  for (const attachment of [invalidRaster, mismatchedRaster, oversizedRaster]) {
    await assert.rejects(
      updateTicket(requestFor(admin, { body: { attachment } }), responseStub()),
      (error) => error.statusCode === (attachment === oversizedRaster ? 413 : 400),
    )
  }

  assert.equal(databaseCalls, 0)
})

test('two ticket creates derive final numbers from identity IDs without COUNT-based allocation', async (t) => {
  const originalQuery = pool.query
  const originalConnect = pool.connect
  const ids = [41, 42]
  const sqlLog = []
  const temporaryNumbers = []
  const auditNumbers = []
  let connectionIndex = 0

  pool.query = async (sql) => {
    throw new Error(`unexpected pool query: ${normalizeSql(sql)}`)
  }
  pool.connect = async () => {
    const id = ids[connectionIndex]
    connectionIndex += 1
    let insertedTicket
    return {
      async query(rawSql, parameters = []) {
        const sql = normalizeSql(rawSql)
        sqlLog.push(sql)
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rowCount: 0, rows: [] }
        }
        if (sql.startsWith('SELECT id, kode, nama FROM ticket_queues')) {
          return {
            rowCount: 1,
            rows: [{ id: 10, kode: 'IT', nama: 'IT Support' }],
          }
        }
        if (sql.startsWith('INSERT INTO tickets')) {
          temporaryNumbers.push(parameters[0])
          insertedTicket = {
            id,
            nomor_tiket: parameters[0],
            judul: parameters[1],
            deskripsi: parameters[2],
            kategori: parameters[3],
            prioritas: parameters[4],
            status_tiket: parameters[5],
            attachment: parameters[8],
            queue_id: parameters[9],
            pelapor_user_id: parameters[10],
          }
          return { rowCount: 1, rows: [insertedTicket] }
        }
        if (sql.startsWith('UPDATE tickets SET nomor_tiket')) {
          assert.equal(parameters[1], id)
          assert.equal(parameters[2], insertedTicket.nomor_tiket)
          return {
            rowCount: 1,
            rows: [{ ...insertedTicket, nomor_tiket: parameters[0] }],
          }
        }
        if (sql.startsWith('INSERT INTO log_riwayat_tiket')) {
          auditNumbers.push(parameters[1])
          return { rowCount: 1, rows: [] }
        }
        throw new Error(`unexpected client query: ${sql}`)
      },
      release() {},
    }
  }
  t.after(() => {
    pool.query = originalQuery
    pool.connect = originalConnect
  })

  const responses = [responseStub(), responseStub()]
  await Promise.all([
    createTicket(
      requestFor(reporter, {
        body: {
          judul: 'First identity ticket',
          deskripsi: '',
          queue_id: 10,
          prioritas: 'Medium (3d)',
          attachment: validPngDataUrl,
        },
      }),
      responses[0],
    ),
    createTicket(
      requestFor(reporter, {
        body: {
          judul: 'Second identity ticket',
          queue_id: 10,
          attachment: null,
        },
      }),
      responses[1],
    ),
  ])

  const year = new Date().getFullYear()
  assert.deepEqual(
    responses.map((response) => response.body.nomor_tiket),
    [`TKT-${year}-000041`, `TKT-${year}-000042`],
  )
  assert.deepEqual(auditNumbers, [`TKT-${year}-000041`, `TKT-${year}-000042`])
  assert.equal(temporaryNumbers.length, 2)
  assert.notEqual(temporaryNumbers[0], temporaryNumbers[1])
  assert.ok(temporaryNumbers.every((number) => /^PENDING-[0-9a-f-]{36}$/i.test(number)))
  assert.equal(
    sqlLog.some((sql) => /COUNT\s*\(\s*\*\s*\)/i.test(sql)),
    false,
  )
  assert.equal(sqlLog.filter((sql) => sql === 'BEGIN').length, 2)
  assert.equal(sqlLog.filter((sql) => sql === 'COMMIT').length, 2)
})

test('ticket mutations roll back and emit no realtime event when audit insertion fails', async (t) => {
  const originalQuery = pool.query
  const originalConnect = pool.connect

  t.after(() => {
    pool.query = originalQuery
    pool.connect = originalConnect
  })

  const scenarios = [
    {
      name: 'create',
      accessTicket: accessRow(),
      invoke: () =>
        createTicket(
          requestFor(reporter, {
            body: {
              judul: 'Create rollback',
              queue_id: 10,
              attachment: validPngDataUrl,
            },
          }),
          responseStub(),
        ),
    },
    {
      name: 'update',
      accessTicket: accessRow(),
      invoke: () =>
        updateTicket(requestFor(admin, { body: { judul: 'Update rollback' } }), responseStub()),
    },
    {
      name: 'claim',
      accessTicket: accessRow({ assigned_to_user_id: null, assigned_to: null }),
      invoke: () => claimTicket(requestFor(admin), responseStub()),
    },
    {
      name: 'reassign',
      accessTicket: accessRow(),
      invoke: () =>
        reassignTicket(
          requestFor(admin, { body: { target_user_id: targetAdmin.id } }),
          responseStub(),
        ),
    },
  ]

  for (const scenario of scenarios) {
    const auditFailure = new Error(`${scenario.name} audit unavailable`)
    const transactionEvents = []
    const clientQueries = []
    const pushedEvents = []
    let releaseCount = 0

    pool.query = async (rawSql, parameters = []) => {
      const sql = normalizeSql(rawSql)
      if (
        sql.startsWith('SELECT t.id, t.nomor_tiket, t.status_tiket') &&
        sql.includes('AS is_queue_member')
      ) {
        return { rowCount: 1, rows: [scenario.accessTicket] }
      }
      if (sql.startsWith('SELECT u.id, u.nama, u.role, u.permissions')) {
        return {
          rowCount: 1,
          rows: [{ ...targetAdmin, is_queue_member: true }],
        }
      }
      throw new Error(`unexpected pool query for ${scenario.name}: ${sql} ${parameters}`)
    }

    pool.connect = async () => {
      let insertedTicket
      return {
        async query(rawSql, parameters = []) {
          const sql = normalizeSql(rawSql)
          clientQueries.push(sql)
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            transactionEvents.push(sql)
            return { rowCount: 0, rows: [] }
          }
          if (sql.startsWith('SELECT id, kode, nama FROM ticket_queues')) {
            return {
              rowCount: 1,
              rows: [{ id: 10, kode: 'IT', nama: 'IT Support' }],
            }
          }
          if (
            sql.startsWith('SELECT t.id, t.nomor_tiket, t.status_tiket') &&
            sql.includes('AS is_queue_member')
          ) {
            return { rowCount: 1, rows: [scenario.accessTicket] }
          }
          if (sql.startsWith('INSERT INTO tickets')) {
            insertedTicket = {
              ...scenario.accessTicket,
              id: 78,
              nomor_tiket: parameters[0],
              judul: parameters[1],
              assigned_to_user_id: null,
            }
            return { rowCount: 1, rows: [insertedTicket] }
          }
          if (sql.startsWith('UPDATE tickets SET nomor_tiket')) {
            return {
              rowCount: 1,
              rows: [{ ...insertedTicket, nomor_tiket: parameters[0] }],
            }
          }
          if (sql.startsWith('SELECT id, nomor_tiket, judul, kategori')) {
            return { rowCount: 1, rows: [scenario.accessTicket] }
          }
          if (sql.startsWith('UPDATE tickets t SET judul')) {
            return {
              rowCount: 1,
              rows: [{ ...scenario.accessTicket, judul: parameters[0] }],
            }
          }
          if (
            sql.startsWith('UPDATE tickets t SET assigned_to_user_id') &&
            sql.includes("status_tiket = 'In Progress'")
          ) {
            return {
              rowCount: 1,
              rows: [
                {
                  ...scenario.accessTicket,
                  assigned_to_user_id: parameters[0],
                  assigned_to: parameters[1],
                  status_tiket: 'In Progress',
                },
              ],
            }
          }
          if (sql.startsWith('UPDATE tickets AS t SET assigned_to_user_id')) {
            return {
              rowCount: 1,
              rows: [
                {
                  ...scenario.accessTicket,
                  assigned_to_user_id: parameters[0],
                  assigned_to: parameters[1],
                },
              ],
            }
          }
          if (sql.startsWith('INSERT INTO log_riwayat_tiket')) throw auditFailure
          throw new Error(`unexpected client query for ${scenario.name}: ${sql}`)
        },
        release() {
          releaseCount += 1
        },
      }
    }

    const removeObserver = addSseClient(
      {
        on() {},
        write(chunk) {
          pushedEvents.push(chunk)
          return true
        },
      },
      superadmin,
    )
    try {
      await assert.rejects(scenario.invoke(), (error) => error === auditFailure)
    } finally {
      removeObserver()
    }

    assert.deepEqual(transactionEvents, ['BEGIN', 'ROLLBACK'], scenario.name)
    assert.equal(releaseCount, 1, scenario.name)
    assert.equal(pushedEvents.length, 0, scenario.name)
    assert.ok(
      clientQueries.some((sql) => sql.startsWith('INSERT INTO log_riwayat_tiket')),
      `${scenario.name} must attempt its audit insert on the transaction client`,
    )
  }
})
