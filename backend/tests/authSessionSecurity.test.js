import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import jwt from 'jsonwebtoken'

import {
  canonicalAuthResult,
  canonicalAuthUser,
  isCanonicalAuthQuery,
  normalizeTestSql,
} from './helpers/canonicalAuth.js'

const testJwtSecret = 's'.repeat(32)

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

function createToken(claims = {}, options = {}) {
  return jwt.sign(
    {
      id: 7,
      nama: 'Untrusted Token Name',
      email: 'untrusted-token@example.test',
      role: 'superadmin',
      permissions: { tickets: 'full', export: 'full' },
      nik: 'FORGED-NIK',
      ...claims,
    },
    testJwtSecret,
    { expiresIn: '5m', ...options },
  )
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

test('protected routes require strict Bearer syntax and a live canonical user', async (t) => {
  const liveUsers = new Map()
  const authCalls = []
  const domainCalls = []
  const originalQuery = pool.query

  pool.query = async (sql, parameters = []) => {
    const normalized = normalizeTestSql(sql)
    if (isCanonicalAuthQuery(normalized)) {
      authCalls.push({ sql: normalized, parameters })
      const user = liveUsers.get(Number(parameters[0]))
      return canonicalAuthResult(user?.is_active === true ? user : null)
    }

    domainCalls.push({ sql: normalized, parameters })
    if (normalized.includes('FROM users u') && normalized.includes('WHERE u.id = $1')) {
      const user = liveUsers.get(Number(parameters[0]))
      return canonicalAuthResult(user || null)
    }
    if (normalized.includes('FROM daftar_aset_ti_lengkap WHERE nik = $1')) {
      return { rowCount: 0, rows: [] }
    }
    if (normalized.startsWith('SELECT nik FROM karyawan')) {
      return { rowCount: 0, rows: [] }
    }

    throw new Error(`Unexpected domain query: ${normalized}`)
  }
  t.after(() => {
    pool.query = originalQuery
  })

  const port = await startServer(t)
  const url = (path) => `http://127.0.0.1:${port}${path}`
  const validToken = createToken()

  await t.test('query tokens and malformed Authorization values fail before querying', async () => {
    const authBefore = authCalls.length
    const requests = [
      fetch(`${url('/api/auth/me')}?token=${encodeURIComponent(validToken)}`),
      fetch(url('/api/auth/me'), { headers: { Authorization: `Basic ${validToken}` } }),
      fetch(url('/api/auth/me'), { headers: { Authorization: 'Bearer' } }),
      fetch(url('/api/auth/me'), {
        headers: { Authorization: `Bearer  ${validToken}` },
      }),
      fetch(url('/api/auth/me'), {
        headers: { Authorization: `Bearer ${validToken} trailing` },
      }),
    ]

    for (const response of await Promise.all(requests)) {
      assert.equal(response.status, 401)
    }
    assert.equal(authCalls.length, authBefore)
  })

  await t.test('expired, timeless, and malformed user-ID claims fail before querying', async () => {
    const authBefore = authCalls.length
    const tokens = [
      createToken({}, { expiresIn: -1 }),
      jwt.sign({ id: 7, role: 'user' }, testJwtSecret),
      createToken({ id: 'not-a-number' }),
    ]

    for (const token of tokens) {
      const response = await fetch(url('/api/auth/me'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      assert.equal(response.status, 401)
    }
    assert.equal(authCalls.length, authBefore)
  })

  await t.test('unknown, inactive, and non-canonical database roles fail closed', async () => {
    liveUsers.delete(7)
    let response = await fetch(url('/api/auth/me'), {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(response.status, 401)

    liveUsers.set(
      7,
      canonicalAuthUser({ id: 7, role: 'user', permissions: {}, }),
    )
    liveUsers.get(7).is_active = false
    response = await fetch(url('/api/auth/me'), {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(response.status, 401)

    liveUsers.set(
      7,
      canonicalAuthUser({ id: 7, role: 'auditor', permissions: { tickets: 'full' } }),
    )
    response = await fetch(url('/api/auth/me'), {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(response.status, 401)
  })

  await t.test('database role and permission override forged JWT snapshots', async () => {
    liveUsers.set(
      7,
      canonicalAuthUser({
        id: 7,
        nama: 'Canonical Reporter',
        email: 'canonical.reporter@example.test',
        role: 'user',
        permissions: { tickets: 'none', my_assets: 'read_only', export: 'none' },
        nik: 'EMP-LIVE-7',
        jabatan: 'Reporter',
      }),
    )

    const logResponse = await fetch(url('/api/logs/audit'), {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(logResponse.status, 403)

    const ticketResponse = await fetch(url('/api/tickets'), {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(ticketResponse.status, 403)

    const assetResponse = await fetch(url('/api/assets/my'), {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(assetResponse.status, 200)
    assert.deepEqual(await assetResponse.json(), [])
    assert.deepEqual(domainCalls.at(-1).parameters, ['EMP-LIVE-7'])
  })

  await t.test('/auth/me returns the currently active database profile', async () => {
    const response = await fetch(url('/api/auth/me'), {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.nama, 'Canonical Reporter')
    assert.equal(body.email, 'canonical.reporter@example.test')
    assert.equal(body.role, 'user')
    assert.deepEqual(body.permissions, {
      dashboard: 'none',
      assets: 'none',
      my_assets: 'read_only',
      tickets: 'none',
      submissions: 'none',
      users: 'none',
      logs: 'none',
      karyawan: 'none',
      export: 'none',
    })
    assert.equal(Object.hasOwn(body, 'password'), false)
  })
})
