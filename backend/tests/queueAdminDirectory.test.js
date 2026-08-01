import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import jwt from 'jsonwebtoken'
import {
  canonicalAuthResult,
  canonicalAuthUser,
  isCanonicalAuthQuery,
} from './helpers/canonicalAuth.js'

const testJwtSecret = 'q'.repeat(32)

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

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim()
}

const issuedClaims = new Map()

function createToken({ id, role, permissions }) {
  issuedClaims.set(id, { id, role, permissions })
  return jwt.sign(
    {
      id,
      nama: `Test ${role}`,
      email: `${id}@example.test`,
      role,
      ...(permissions === undefined ? {} : { permissions }),
    },
    testJwtSecret,
    { expiresIn: '5m' },
  )
}

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

async function getQueueAdmins(port, queueId, claims = null) {
  const headers = {}
  if (claims) {
    headers.Authorization = `Bearer ${createToken(claims)}`
  }

  const response = await fetch(
    `http://127.0.0.1:${port}/api/ticket-queues/${encodeURIComponent(queueId)}/admins`,
    { headers },
  )

  return { response, body: await response.json() }
}

test('queue admin directory is queue-scoped, deny-by-default, and returns only id and nama', async (t) => {
  const originalQuery = pool.query
  const calls = []

  function isRuntimeSchemaOrBackfill(sql) {
    return (
      /^(?:CREATE|ALTER|DROP|TRUNCATE|DO\s+\$\$)\b/.test(sql) ||
      sql.startsWith('INSERT INTO ticket_queues (kode, nama, deskripsi) VALUES') ||
      sql.startsWith('UPDATE tickets t SET queue_id = q.id FROM ticket_queues q') ||
      sql.startsWith('UPDATE tickets t SET pelapor_user_id = u.id FROM users u') ||
      sql.startsWith('UPDATE tickets t SET assigned_to_user_id = u.id FROM users u')
    )
  }

  pool.query = async (sql, params = []) => {
    assert.equal(typeof sql, 'string', 'pool.query must receive SQL text')
    const normalizedSql = normalizeSql(sql)

    if (isCanonicalAuthQuery(normalizedSql)) {
      const claims = issuedClaims.get(params[0])
      return canonicalAuthResult(
        claims
          ? canonicalAuthUser({
              ...claims,
              permissions: claims.permissions || {},
            })
          : null,
      )
    }

    assert.equal(
      isRuntimeSchemaOrBackfill(normalizedSql),
      false,
      `HTTP request must not run schema, seed, or backfill SQL: ${normalizedSql}`,
    )

    if (
      normalizedSql.startsWith('SELECT q.id, EXISTS (') &&
      normalizedSql.includes('AS is_queue_member') &&
      normalizedSql.includes('FROM ticket_queues q')
    ) {
      assert.equal(params.length, 2)
      const [queueId, userId] = params
      calls.push({ kind: 'queue-access', sql: normalizedSql, params })

      if (queueId === 9999) {
        return { rowCount: 0, rows: [] }
      }

      return {
        rowCount: 1,
        rows: [{ id: queueId, is_queue_member: queueId === 7 && userId === 12 }],
      }
    }

    if (
      normalizedSql.startsWith('SELECT DISTINCT u.id, u.nama FROM users u') &&
      normalizedSql.includes('LEFT JOIN user_ticket_queues')
    ) {
      calls.push({ kind: 'directory', sql: normalizedSql, params })
      const includeSuperadmin = params[1] === true
      return {
        rowCount: includeSuperadmin ? 2 : 1,
        rows: [
          {
            id: 12,
            nama: 'Admin Queue',
            email: 'admin@example.test',
            password: 'must-not-leak',
            permissions: { tickets: 'full' },
            is_primary: true,
          },
          {
            id: 13,
            nama: 'Super Admin',
            email: 'superadmin@example.test',
            password: 'must-not-leak',
            permissions: { users: 'full' },
            is_primary: false,
          },
        ].slice(0, includeSuperadmin ? 2 : 1),
      }
    }

    throw new Error(`Unexpected pool.query call: ${normalizedSql}`)
  }

  t.after(() => {
    pool.query = originalQuery
  })

  const port = await startServer(t)

  await t.test('requires authentication before querying', async () => {
    const before = calls.length
    const result = await getQueueAdmins(port, 7)

    assert.equal(result.response.status, 401)
    assert.equal(calls.length, before)
  })

  await t.test('denies explicit none ticket permission before querying', async () => {
    const before = calls.length
    const result = await getQueueAdmins(port, 7, {
      id: 10,
      role: 'admin',
      permissions: { tickets: 'none' },
    })

    assert.equal(result.response.status, 403)
    assert.equal(calls.length, before)
  })

  await t.test('denies unknown ticket roles before querying', async () => {
    const before = calls.length
    const result = await getQueueAdmins(port, 7, {
      id: 11,
      role: 'auditor',
      permissions: { tickets: 'full' },
    })

    assert.equal(result.response.status, 401)
    assert.equal(calls.length, before)
  })

  await t.test('denies reporter/user roles before querying', async () => {
    const before = calls.length
    const result = await getQueueAdmins(port, 7, {
      id: 9,
      role: 'user',
      permissions: { tickets: 'read_only' },
    })

    assert.equal(result.response.status, 403)
    assert.equal(calls.length, before)
  })

  await t.test('rejects an invalid queue ID before querying', async () => {
    const before = calls.length
    const result = await getQueueAdmins(port, 'not-a-number', {
      id: 12,
      role: 'admin',
      permissions: { tickets: 'read_only' },
    })

    assert.equal(result.response.status, 400)
    assert.equal(calls.length, before)
  })

  await t.test('denies an admin from another queue without loading the directory', async () => {
    const result = await getQueueAdmins(port, 7, {
      id: 11,
      role: 'admin',
      permissions: { tickets: 'full' },
    })

    assert.equal(result.response.status, 403)
    assert.deepEqual(
      calls.filter((call) => call.kind === 'queue-access').at(-1).params,
      [7, 11],
    )
    assert.equal(calls.some((call) => call.kind === 'directory'), false)
  })

  const expectedAdminDirectory = [
    { id: 12, nama: 'Admin Queue' },
  ]
  const expectedSuperadminDirectory = [
    { id: 12, nama: 'Admin Queue' },
    { id: 13, nama: 'Super Admin' },
  ]

  await t.test('denies a mapped read-only admin before loading the directory', async () => {
    const directoryCallsBefore = calls.filter((call) => call.kind === 'directory').length
    const result = await getQueueAdmins(port, 7, {
      id: 12,
      role: 'admin',
      permissions: { tickets: 'read_only' },
    })

    assert.equal(result.response.status, 403)
    assert.equal(
      calls.filter((call) => call.kind === 'directory').length,
      directoryCallsBefore,
    )
  })

  await t.test('allows an admin mapped to the requested queue', async () => {
    const result = await getQueueAdmins(port, 7, {
      id: 12,
      role: 'admin',
      permissions: { tickets: 'full' },
    })

    assert.equal(result.response.status, 200)
    assert.deepEqual(result.body, expectedAdminDirectory)
  })

  for (const [id, role] of [
    [13, 'superadmin'],
    [14, 'super admin'],
  ]) {
    await t.test(`allows the ${role} role alias`, async () => {
      const result = await getQueueAdmins(port, 7, { id, role })

      assert.equal(result.response.status, 200)
      assert.deepEqual(result.body, expectedSuperadminDirectory)
    })
  }

  await t.test('returns 404 for a nonexistent active queue without loading the directory', async () => {
    const directoryCallsBefore = calls.filter((call) => call.kind === 'directory').length
    const result = await getQueueAdmins(port, 9999, {
      id: 13,
      role: 'superadmin',
    })

    assert.equal(result.response.status, 404)
    assert.equal(
      calls.filter((call) => call.kind === 'directory').length,
      directoryCallsBefore,
    )
  })

  const directoryCalls = calls.filter((call) => call.kind === 'directory')
  assert.equal(directoryCalls.length, 3)
  assert.deepEqual(directoryCalls.map((call) => call.params), [
    [7, false],
    [7, true],
    [7, true],
  ])
  for (const call of directoryCalls) {
    assert.equal(call.sql.includes('u.email'), false)
    assert.equal(call.sql.includes('u.password'), false)
    assert.equal(call.sql.includes('utq.is_primary'), false)
    assert.match(
      call.sql,
      /LOWER\(TRIM\(u\.permissions ->> 'tickets'\)\) = 'full'/,
    )
    assert.match(call.sql, /u\.permissions -> 'tickets' = 'true'::jsonb/)
    assert.match(call.sql, /\$2 = TRUE/)
  }
})
