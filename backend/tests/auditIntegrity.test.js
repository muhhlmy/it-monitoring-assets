import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import jwt from 'jsonwebtoken'
import {
  canonicalAuthResult,
  canonicalAuthUser,
  isCanonicalAuthQuery,
} from './helpers/canonicalAuth.js'

const testJwtSecret = 'a'.repeat(32)

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = testJwtSecret
process.env.DB_HOST = '127.0.0.1'
process.env.DB_PORT = '5432'
process.env.DB_USER = 'test_user'
process.env.DB_PASSWORD = 'test_password_not_used'
process.env.DB_NAME = 'test_database'
process.env.CORS_ORIGINS = 'http://localhost:5173'
process.env.PASSWORD_LEGACY_MODE = 'verify-plaintext'

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

const roleIds = new Map([
  ['user', 1],
  ['admin', 2],
  ['superadmin', 3],
  ['super admin', 4],
])

function createToken(role = 'superadmin') {
  return jwt.sign(
    {
      id: roleIds.get(role),
      nama: `Test ${role}`,
      email: `${role.replaceAll(' ', '')}@example.test`,
      role
    },
    testJwtSecret,
    { expiresIn: '5m' }
  )
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim()
}

test('GET /api/logs/audit is readable only by superadmin aliases', async (t) => {
  const originalQuery = pool.query
  let domainQueryCount = 0

  pool.query = async (sql, parameters = []) => {
    if (isCanonicalAuthQuery(sql)) {
      const role = [...roleIds].find(([, id]) => id === parameters[0])?.[0]
      return canonicalAuthResult(canonicalAuthUser({ id: parameters[0], role }))
    }
    domainQueryCount += 1
    return { rows: [] }
  }
  t.after(() => {
    pool.query = originalQuery
  })

  const port = await startServer(t)
  const requestAudit = (role) => {
    const headers = role
      ? { Authorization: `Bearer ${createToken(role)}` }
      : {}
    return fetch(`http://127.0.0.1:${port}/api/logs/audit`, { headers })
  }

  const unauthenticated = await requestAudit(null)
  assert.equal(unauthenticated.status, 401)

  for (const role of ['user', 'admin']) {
    const denied = await requestAudit(role)
    assert.equal(denied.status, 403)
  }
  assert.equal(domainQueryCount, 0)

  for (const role of ['superadmin', 'super admin']) {
    const allowed = await requestAudit(role)
    assert.equal(allowed.status, 200)
    assert.deepEqual(await allowed.json(), [])
  }
  assert.equal(domainQueryCount, 2)
})

test('POST /api/logs/audit is unavailable and performs no domain query', async (t) => {
  const originalQuery = pool.query
  let domainQueryCount = 0

  pool.query = async (sql, parameters = []) => {
    if (isCanonicalAuthQuery(sql)) {
      return canonicalAuthResult(
        canonicalAuthUser({ id: parameters[0], role: 'superadmin' }),
      )
    }
    domainQueryCount += 1
    throw new Error('Database query must not run for the removed endpoint.')
  }
  t.after(() => {
    pool.query = originalQuery
  })

  const port = await startServer(t)
  const response = await fetch(`http://127.0.0.1:${port}/api/logs/audit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${createToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nama_pengguna: 'Forged Administrator',
      email: 'forged@example.test',
      aktifitas: 'LOGIN',
      ip_address: '203.0.113.10',
      browser: 'Forged Browser'
    })
  })
  const body = await response.json()

  assert.equal(response.status, 404)
  assert.deepEqual(body, { message: 'Endpoint tidak ditemukan.' })
  assert.equal(domainQueryCount, 0)
})

test('successful login writes one canonical LOGIN audit from request metadata', async (t) => {
  const originalQuery = pool.query
  const auditWrites = []
  const canonicalUser = {
    id: 42,
    nama: 'Canonical User',
    email: 'canonical.user@example.test',
    password: 'server-side-password',
    role: 'admin',
    permissions: { dashboard: true },
    is_active: true,
    nik: 'EMP-0042',
    jabatan: 'Administrator'
  }

  pool.query = async (sql, parameters = []) => {
    const normalizedSql = normalizeSql(sql)

    if (normalizedSql.startsWith('ALTER TABLE users ADD COLUMN')) {
      throw new Error('Login HTTP request must not alter the users schema.')
    }

    if (normalizedSql.includes('FROM users u')) {
      return { rowCount: 1, rows: [canonicalUser] }
    }

    if (normalizedSql.startsWith('INSERT INTO log_audit_login')) {
      auditWrites.push(parameters)
      return { rowCount: 1, rows: [] }
    }

    throw new Error(`Unexpected query: ${normalizedSql}`)
  }
  t.after(() => {
    pool.query = originalQuery
  })

  const port = await startServer(t)
  const spoofedIp = '203.0.113.77'
  const userAgent = 'Audit-Integrity-Test/1.0'
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': userAgent
    },
    body: JSON.stringify({
      email: 'submitted-alias@example.test',
      password: canonicalUser.password,
      nama: 'Forged Name',
      nama_pengguna: 'Forged Actor',
      ip_address: spoofedIp,
      browser: 'Forged Browser'
    })
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(auditWrites.length, 1)
  assert.deepEqual(auditWrites[0].slice(0, 3), [
    canonicalUser.nama,
    canonicalUser.email,
    'LOGIN'
  ])
  assert.notEqual(auditWrites[0][3], spoofedIp)
  assert.equal(auditWrites[0][3], '127.0.0.1')
  assert.equal(auditWrites[0][4], userAgent)
  assert.equal(auditWrites[0].includes(canonicalUser.password), false)

  assert.equal(JSON.stringify(body).includes(canonicalUser.password), false)
  assert.equal(Object.hasOwn(body.user, 'password'), false)

  const tokenPayload = jwt.verify(body.token, testJwtSecret)
  assert.equal(tokenPayload.nama, canonicalUser.nama)
  assert.equal(tokenPayload.email, canonicalUser.email)
  assert.equal(Object.hasOwn(tokenPayload, 'password'), false)
  assert.equal(JSON.stringify(tokenPayload).includes(canonicalUser.password), false)
})

test('wrong password writes one generic GAGAL_LOGIN audit with canonical actor', async (t) => {
  const originalQuery = pool.query
  const auditWrites = []
  const canonicalUser = {
    id: 84,
    nama: 'Canonical Failed User',
    email: 'failed.user@example.test',
    password: 'correct-password-stored-on-server',
    role: 'user',
    permissions: null,
    is_active: true,
    nik: '',
    jabatan: 'user'
  }

  pool.query = async (sql, parameters = []) => {
    const normalizedSql = normalizeSql(sql)

    if (normalizedSql.startsWith('ALTER TABLE users ADD COLUMN')) {
      throw new Error('Login HTTP request must not alter the users schema.')
    }

    if (normalizedSql.includes('FROM users u')) {
      return { rowCount: 1, rows: [canonicalUser] }
    }

    if (normalizedSql.startsWith('INSERT INTO log_audit_login')) {
      auditWrites.push(parameters)
      return { rowCount: 1, rows: [] }
    }

    throw new Error(`Unexpected query: ${normalizedSql}`)
  }
  t.after(() => {
    pool.query = originalQuery
  })

  const submittedPassword = 'attacker-supplied-wrong-password'
  const spoofedIp = '198.51.100.44'
  const userAgent = 'Failed-Audit-Test/1.0'
  const port = await startServer(t)
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': userAgent
    },
    body: JSON.stringify({
      email: 'spoofed.actor@example.test',
      password: submittedPassword,
      nama_pengguna: 'Spoofed Failed Actor',
      ip_address: spoofedIp,
      browser: 'Spoofed Failed Browser'
    })
  })
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.deepEqual(body, { message: 'Email atau password salah.' })
  assert.equal(auditWrites.length, 1)
  assert.deepEqual(auditWrites[0].slice(0, 3), [
    canonicalUser.nama,
    canonicalUser.email,
    'GAGAL_LOGIN'
  ])
  assert.notEqual(auditWrites[0][3], spoofedIp)
  assert.equal(auditWrites[0][3], '127.0.0.1')
  assert.equal(auditWrites[0][4], userAgent)
  assert.equal(auditWrites[0].includes(submittedPassword), false)
  assert.equal(auditWrites[0].includes(canonicalUser.password), false)
  assert.equal(JSON.stringify(body).includes(submittedPassword), false)
  assert.equal(JSON.stringify(body).includes(canonicalUser.password), false)
})

test('unknown-account login failure uses a server-owned unknown actor', async (t) => {
  const originalQuery = pool.query
  const auditWrites = []

  pool.query = async (sql, parameters = []) => {
    const normalizedSql = normalizeSql(sql)

    if (normalizedSql.startsWith('ALTER TABLE users ADD COLUMN')) {
      throw new Error('Login HTTP request must not alter the users schema.')
    }

    if (normalizedSql.includes('FROM users u')) {
      return { rowCount: 0, rows: [] }
    }

    if (normalizedSql.startsWith('INSERT INTO log_audit_login')) {
      auditWrites.push(parameters)
      return { rowCount: 1, rows: [] }
    }

    throw new Error(`Unexpected query: ${normalizedSql}`)
  }
  t.after(() => {
    pool.query = originalQuery
  })

  const submittedCredential = 'x'.repeat(31)
  const submittedEmail = 'forged.unknown@example.test'
  const spoofedIp = '192.0.2.55'
  const userAgent = 'Unknown-Actor-Test/1.0'
  const port = await startServer(t)
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': userAgent
    },
    body: JSON.stringify({
      email: submittedEmail,
      password: submittedCredential,
      nama_pengguna: 'Spoofed Unknown Actor',
      ip_address: spoofedIp,
      browser: 'Spoofed Unknown Browser'
    })
  })
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.deepEqual(body, { message: 'Email atau password salah.' })
  assert.equal(auditWrites.length, 1)
  assert.deepEqual(auditWrites[0].slice(0, 3), [
    'Tidak Diketahui',
    'Tidak Diketahui',
    'GAGAL_LOGIN'
  ])
  assert.equal(auditWrites[0].includes(submittedEmail), false)
  assert.equal(auditWrites[0].includes(submittedCredential), false)
  assert.notEqual(auditWrites[0][3], spoofedIp)
  assert.equal(auditWrites[0][3], '127.0.0.1')
  assert.equal(auditWrites[0][4], userAgent)
  assert.equal(JSON.stringify(body).includes(submittedEmail), false)
  assert.equal(JSON.stringify(body).includes(submittedCredential), false)
})
