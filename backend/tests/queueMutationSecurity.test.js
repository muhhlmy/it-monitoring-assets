import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import { isCanonicalAuthQuery } from './helpers/canonicalAuth.js'

const jwtSecret = 'v'.repeat(32)
process.env.DB_PASSWORD = 'test-password-not-used'
process.env.JWT_SECRET = jwtSecret
process.env.CORS_ORIGINS = 'http://localhost:5173'

const { app } = await import('../src/app.js')
const { pool } = await import('../src/config/database.js')

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim()
}

function superadminToken() {
  return jwt.sign({ id: 1, role: 'superadmin' }, jwtSecret, { expiresIn: '5m' })
}

async function startServer(t) {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(
    () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  )
  return server.address().port
}

test('queue mapping validates IDs, active queue, and writable admin target atomically', async (t) => {
  const originalQuery = pool.query
  const originalConnect = pool.connect
  const queryLog = []
  let queueActive = true
  let target = {
    id: 2,
    role: 'admin',
    permissions: { tickets: 'full' },
  }

  pool.query = async (sql, parameters = []) => {
    const normalized = normalizeSql(sql)
    queryLog.push({ sql: normalized, parameters })

    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) {
      return { rows: [], rowCount: 0 }
    }
    if (isCanonicalAuthQuery(normalized)) {
      return {
        rows: [
          {
            id: 1,
            nama: 'Superadmin Queue',
            email: 'superadmin-queue@example.test',
            role: 'superadmin',
            permissions: {},
            is_active: true,
            nik: '',
            jabatan: 'superadmin',
          },
        ],
        rowCount: 1,
      }
    }
    if (normalized.startsWith('SELECT id FROM ticket_queues')) {
      return {
        rows: queueActive ? [{ id: parameters[0] }] : [],
        rowCount: queueActive ? 1 : 0,
      }
    }
    if (normalized.startsWith('SELECT id, role, permissions FROM users')) {
      return { rows: target ? [{ ...target }] : [], rowCount: target ? 1 : 0 }
    }
    if (
      normalized.startsWith('UPDATE user_ticket_queues') ||
      normalized.startsWith('INSERT INTO user_ticket_queues') ||
      normalized.startsWith('DELETE FROM user_ticket_queues')
    ) {
      return {
        rows: normalized.startsWith('DELETE') ? [{ user_id: parameters[0] }] : [],
        rowCount: 1,
      }
    }
    throw new Error(`Unexpected queue mutation query: ${normalized}`)
  }
  pool.connect = async () => ({
    query: (...args) => pool.query(...args),
    release() {},
  })
  t.after(() => {
    pool.query = originalQuery
    pool.connect = originalConnect
  })

  const port = await startServer(t)
  const request = async (path, { method = 'POST', body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${superadminToken()}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { response, body: await response.json() }
  }

  for (const body of [
    { user_id: '2', is_primary: false },
    { user_id: 2, is_primary: 'false' },
    { user_id: 2, unknown: true },
  ]) {
    const before = queryLog.length
    const result = await request('/api/ticket-queues/7/admins', { body })
    assert.equal(result.response.status, 400)
    assert.equal(
      queryLog.slice(before).filter(({ sql }) => !isCanonicalAuthQuery(sql)).length,
      0,
    )
  }

  assert.equal(
    (await request('/api/ticket-queues/07/admins', { body: { user_id: 2 } })).response.status,
    400,
  )

  target = { id: 2, role: 'user', permissions: { tickets: 'full' } }
  let result = await request('/api/ticket-queues/7/admins', { body: { user_id: 2 } })
  assert.equal(result.response.status, 403)

  target = { id: 2, role: 'admin', permissions: { tickets: 'read_only' } }
  result = await request('/api/ticket-queues/7/admins', { body: { user_id: 2 } })
  assert.equal(result.response.status, 403)

  queueActive = false
  target = { id: 2, role: 'admin', permissions: { tickets: 'full' } }
  result = await request('/api/ticket-queues/7/admins', { body: { user_id: 2 } })
  assert.equal(result.response.status, 404)

  queueActive = true
  const transactionStart = queryLog.length
  result = await request('/api/ticket-queues/7/admins', {
    body: { user_id: 2, is_primary: true },
  })
  assert.equal(result.response.status, 201)
  const transactionQueries = queryLog.slice(transactionStart).map(({ sql }) => sql)
  assert.ok(transactionQueries.includes('BEGIN'))
  assert.ok(transactionQueries.some((sql) => sql.startsWith('SELECT id FROM ticket_queues')))
  assert.ok(transactionQueries.some((sql) => sql.startsWith('SELECT id, role, permissions FROM users')))
  assert.ok(transactionQueries.some((sql) => sql.startsWith('UPDATE user_ticket_queues')))
  assert.ok(transactionQueries.some((sql) => sql.startsWith('INSERT INTO user_ticket_queues')))
  assert.ok(transactionQueries.includes('COMMIT'))

  result = await request('/api/ticket-queues/7/admins/2', { method: 'DELETE' })
  assert.equal(result.response.status, 200)
  result = await request('/api/ticket-queues/7/admins/2junk', { method: 'DELETE' })
  assert.equal(result.response.status, 400)
})

