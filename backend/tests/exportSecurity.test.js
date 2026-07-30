import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import jwt from 'jsonwebtoken'

const testJwtSecret = 'e'.repeat(32)

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

async function startServer(t) {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  })

  return server.address().port
}

function mockPoolQuery(t, implementation) {
  const originalQuery = pool.query
  pool.query = implementation
  t.after(() => {
    pool.query = originalQuery
  })
}

function createToken(role) {
  return jwt.sign(
    { id: 42, nama: `Test ${role}`, email: `${role.replaceAll(' ', '')}@example.test`, role },
    testJwtSecret,
    { expiresIn: '5m' }
  )
}

async function postExport(port, body, role = 'superadmin') {
  const headers = { 'Content-Type': 'application/json' }
  if (role) {
    headers.Authorization = `Bearer ${createToken(role)}`
  }

  const response = await fetch(`http://127.0.0.1:${port}/api/export/data`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  return { response, body: await response.json() }
}

async function getExportMetadata(port, role = 'superadmin') {
  const headers = {}
  if (role) {
    headers.Authorization = `Bearer ${createToken(role)}`
  }

  const response = await fetch(`http://127.0.0.1:${port}/api/export/tables`, { headers })
  return { response, body: await response.json() }
}

test('export endpoints enforce superadmin role aliases before any database query', async (t) => {
  let queryCount = 0
  mockPoolQuery(t, async () => {
    queryCount += 1
    return { rows: [] }
  })
  const port = await startServer(t)
  const validBody = { tableName: 'aset_ti', columns: ['id_aset'], limit: 1 }

  const unauthenticated = await postExport(port, validBody, null)
  assert.equal(unauthenticated.response.status, 401)
  const unauthenticatedMetadata = await getExportMetadata(port, null)
  assert.equal(unauthenticatedMetadata.response.status, 401)

  for (const role of ['user', 'admin']) {
    const denied = await postExport(port, validBody, role)
    assert.equal(denied.response.status, 403)
    const deniedMetadata = await getExportMetadata(port, role)
    assert.equal(deniedMetadata.response.status, 403)
  }

  assert.equal(queryCount, 0)

  for (const role of ['superadmin', 'super admin']) {
    const allowed = await postExport(port, validBody, role)
    assert.equal(allowed.response.status, 200)
    const allowedMetadata = await getExportMetadata(port, role)
    assert.equal(allowedMetadata.response.status, 200)
  }

  assert.equal(queryCount, 18)
})

test('invalid bodies, tables, columns, and limits return 400 without querying', async (t) => {
  let queryCount = 0
  mockPoolQuery(t, async () => {
    queryCount += 1
    return { rows: [] }
  })
  const port = await startServer(t)

  const invalidBodies = [
    {},
    { tableName: 'unknown', limit: 1 },
    { tableName: 'users; DROP TABLE users', limit: 1 },
    { tableName: 'users' },
    { tableName: 'users', limit: 'all' },
    { tableName: 'users', limit: '1' },
    { tableName: 'users', limit: 0 },
    { tableName: 'users', limit: -1 },
    { tableName: 'users', limit: 1.5 },
    { tableName: 'users', limit: 1001 },
    { tableName: 'users', columns: [], limit: 1 },
    { tableName: 'users', columns: 'id', limit: 1 },
    { tableName: 'users', columns: ['id', 'id'], limit: 1 },
    { tableName: 'users', columns: ['id', 'password'], limit: 1 },
    { tableName: 'users', columns: ['id', 1], limit: 1 }
  ]

  for (const invalidBody of invalidBodies) {
    const result = await postExport(port, invalidBody)
    assert.equal(result.response.status, 400, JSON.stringify(invalidBody))
    assert.equal(result.body.success, false)
  }

  const arrayBody = await postExport(port, [])
  assert.equal(arrayBody.response.status, 400)
  const nullBody = await postExport(port, null)
  assert.equal(nullBody.response.status, 400)
  const stringBody = await postExport(port, 'invalid')
  assert.equal(stringBody.response.status, 400)
  assert.equal(queryCount, 0)
})

test('date and text filters are strictly validated before querying', async (t) => {
  let queryCount = 0
  mockPoolQuery(t, async () => {
    queryCount += 1
    return { rows: [] }
  })
  const port = await startServer(t)
  const base = { tableName: 'tickets', columns: ['id'], limit: 10 }
  const invalidFilters = [
    { startDate: '30-07-2026' },
    { startDate: '2026-02-30' },
    { startDate: '0000-01-01' },
    { startDate: null },
    { endDate: 20260730 },
    { startDate: '2026-07-31', endDate: '2026-07-30' },
    { search: 42 },
    { search: 's'.repeat(201) },
    { status: false },
    { status: 's'.repeat(101) }
  ]

  for (const filters of invalidFilters) {
    const result = await postExport(port, { ...base, ...filters })
    assert.equal(result.response.status, 400, JSON.stringify(filters))
  }

  assert.equal(queryCount, 0)
})

test('ticket filters and limit are parameterized and identifiers come from allowlists', async (t) => {
  const calls = []
  mockPoolQuery(t, async (sql, params) => {
    calls.push({ sql, params })
    return {
      rows: [
        {
          id: 9,
          nomor_tiket: 'TCK-009',
          password: 'must-not-leak',
          token: 'must-not-leak'
        }
      ]
    }
  })
  const port = await startServer(t)
  const search = "printer%' OR 1=1 --"
  const status = "Open' OR 1=1 --"

  const result = await postExport(port, {
    tableName: 'tickets',
    columns: ['id', 'nomor_tiket'],
    startDate: '2026-07-01',
    endDate: '2026-07-30',
    search,
    status,
    limit: 1000
  })

  assert.equal(result.response.status, 200)
  assert.equal(calls.length, 1)
  assert.match(calls[0].sql, /^SELECT "id", "nomor_tiket" FROM "tickets"/)
  assert.match(calls[0].sql, /"dibuat_pada" >= \$1::date/)
  assert.match(calls[0].sql, /"dibuat_pada" < \(\$2::date \+ INTERVAL '1 day'\)/)
  assert.match(calls[0].sql, /"status_tiket"::text ILIKE \$4/)
  assert.match(calls[0].sql, /ORDER BY "id" DESC LIMIT \$5$/)
  assert.equal(calls[0].sql.includes(search), false)
  assert.equal(calls[0].sql.includes(status), false)
  assert.deepEqual(calls[0].params, [
    '2026-07-01',
    '2026-07-30',
    `%${search}%`,
    status,
    1000
  ])
  assert.deepEqual(result.body.data, [{ id: 9, nomor_tiket: 'TCK-009' }])
})

test('omitted columns use the complete safe schema and reproject unexpected row fields', async (t) => {
  let executedSql = ''
  let executedParams
  mockPoolQuery(t, async (sql, params) => {
    executedSql = sql
    executedParams = params
    return {
      rows: [
        {
          id: 1,
          nama: 'Safe User',
          email: 'safe@example.test',
          role: 'user',
          is_active: true,
          dibuat_pada: '2026-07-01',
          diperbarui_pada: '2026-07-02',
          password: 'plaintext-or-hash',
          permissions: { users: 'full' },
          reset_token: 'secret'
        }
      ]
    }
  })
  const port = await startServer(t)

  const result = await postExport(port, { tableName: 'users', limit: 25 })

  assert.equal(result.response.status, 200)
  assert.deepEqual(
    result.body.columns.map((column) => column.name),
    ['id', 'nama', 'email', 'role', 'is_active', 'dibuat_pada', 'diperbarui_pada']
  )
  assert.equal(executedSql.includes('password'), false)
  assert.equal(executedSql.includes('permissions'), false)
  assert.match(executedSql, /LIMIT \$1$/)
  assert.deepEqual(executedParams, [25])
  assert.deepEqual(Object.keys(result.body.data[0]), [
    'id',
    'nama',
    'email',
    'role',
    'is_active',
    'dibuat_pada',
    'diperbarui_pada'
  ])
  assert.equal(Object.hasOwn(result.body.data[0], 'password'), false)
  assert.equal(Object.hasOwn(result.body.data[0], 'permissions'), false)
  assert.equal(Object.hasOwn(result.body.data[0], 'reset_token'), false)
})

test('ticket metadata matches active PostgreSQL field, date, status, and order names', async (t) => {
  mockPoolQuery(t, async () => ({ rows: [{ count: 0 }] }))
  const port = await startServer(t)

  const response = await fetch(`http://127.0.0.1:${port}/api/export/tables`, {
    headers: { Authorization: `Bearer ${createToken('superadmin')}` }
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  const tickets = body.tables.find((table) => table.tableName === 'tickets')
  assert.ok(tickets)
  assert.equal(tickets.dateField, 'dibuat_pada')
  assert.equal(tickets.statusField, 'status_tiket')
  assert.equal(tickets.orderField, 'id')
  assert.deepEqual(
    tickets.columns.map((column) => column.name),
    [
      'id',
      'nomor_tiket',
      'judul',
      'deskripsi',
      'kategori',
      'status_tiket',
      'prioritas',
      'pelapor',
      'assigned_to',
      'dibuat_pada',
      'diperbarui_pada',
      'resolved_at'
    ]
  )
  for (const staleOrSensitiveField of [
    'ticket_number',
    'subject',
    'status',
    'reporter_email',
    'attachment',
    'password'
  ]) {
    assert.equal(
      tickets.columns.some((column) => column.name === staleOrSensitiveField),
      false
    )
  }
})

test('unexpected export failures return a generic 500 response', async (t) => {
  mockPoolQuery(t, async () => {
    throw new Error('internal database detail that must not be exposed')
  })
  const port = await startServer(t)

  const result = await postExport(port, {
    tableName: 'aset_ti',
    columns: ['id_aset'],
    limit: 1
  })

  assert.equal(result.response.status, 500)
  assert.deepEqual(result.body, {
    success: false,
    message: 'Terjadi kesalahan pada server.'
  })
  assert.equal(JSON.stringify(result.body).includes('internal database detail'), false)
})
