import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import jwt from 'jsonwebtoken'
import { app } from '../src/app.js'
import { pool } from '../src/config/database.js'
import { env } from '../src/config/env.js'
import { createSession, ensureUserSessionsTable } from '../src/services/sessionService.js'
import { sanitizeUserForStorage } from '../../frontend/src/utils/authStorage.js'

function makeRequest(server, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const address = server.address()
    const reqHeaders = { ...headers }
    let payload = null

    if (body !== null) {
      payload = typeof body === 'string' ? body : JSON.stringify(body)
      reqHeaders['Content-Type'] = 'application/json'
      reqHeaders['Content-Length'] = Buffer.byteLength(payload)
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method: headers.method || 'GET',
        headers: reqHeaders,
      },
      (res) => {
        let resData = ''
        res.on('data', (chunk) => {
          resData += chunk
        })
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: resData,
          })
        })
      },
    )

    req.on('error', reject)

    if (payload) {
      req.write(payload)
    }

    req.end()
  })
}

test('DEFECT-11 — Client-Side User Data Minimization & Security Suite (SEC-13)', async (t) => {
  let server
  let userToken
  let userId

  t.before(async () => {
    await ensureUserSessionsTable(pool).catch(() => {})

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })

    const ts = Date.now()

    // Create a regular user in PostgreSQL
    const resUser = await pool.query(
      `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
       VALUES ('Standard User', $1, '$2b$10$e8w8X9nZgLp5oN4n44444eR8oOSkDpOPxE/Cu0000000000000000', 'user', '{}'::jsonb, true)
       RETURNING id`,
      [`std_user_${ts}@company.com`],
    )
    userId = resUser.rows[0].id

    const session = await createSession(userId)
    userToken = jwt.sign(
      {
        sub: String(userId),
        id: userId,
        sid: session.sessionId,
        email: `std_user_${ts}@company.com`,
        role: 'user',
        permissions: {},
      },
      env.jwt.secret,
      { expiresIn: '1h' },
    )
  })

  t.after(async () => {
    if (userId) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {})
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  await t.test('TEST 1 — Role Tampering Defense: Client modifying role to superadmin is rejected by backend with 403', async () => {
    // Standard user token sends a request to superadmin-only export endpoint
    const res = await makeRequest(server, '/api/export/assets', {
      Authorization: `Bearer ${userToken}`,
    })
    assert.equal(res.status, 403, 'Backend must evaluate role from database/token, ignoring any client-side sessionStorage tampering')
  })

  await t.test('TEST 2 — Permission Tampering Defense: Client modifying permissions to full access is rejected by backend with 403', async () => {
    // Standard user token attempts admin-only employee management endpoint
    const res = await makeRequest(server, '/api/karyawan', {
      Authorization: `Bearer ${userToken}`,
    })
    assert.equal(res.status, 403, 'Backend must evaluate permissions from DB, ignoring client storage modifications')
  })

  await t.test('TEST 3 — Data Minimization: sanitizeUserForStorage strips passwords, hashes, secrets, and internal metadata', () => {
    const rawUserFromBackend = {
      id: 123,
      nama: 'John Doe',
      email: 'john@example.com',
      password: 'PlaintextPassword123!',
      password_hash: '$2b$10$e8w8X9nZgLp5oN4n44444eR8oOSkDpOPxE/Cu',
      jwt_secret: 'SuperSecretKey32CharsLongMustBe123',
      session_id: '00000000-0000-4000-a000-000000000001',
      role: 'user',
      permissions: { assets: 'read_only' },
      nik: 'NIK12345',
      departemen: 'IT',
      directorate: 'Technology',
      lokasi_kerja: 'Jakarta',
      title: 'Staff',
      internal_debug_flag: true,
      created_at: '2026-01-01T00:00:00.000Z',
    }

    const sanitized = sanitizeUserForStorage(rawUserFromBackend)

    assert.equal(sanitized.id, 123)
    assert.equal(sanitized.nama, 'John Doe')
    assert.equal(sanitized.email, 'john@example.com')
    assert.equal(sanitized.role, 'user')
    assert.deepEqual(sanitized.permissions, { assets: 'read_only' })
    assert.equal(sanitized.nik, 'NIK12345')

    // Verify sensitive fields are strictly excluded
    assert.equal(sanitized.password, undefined)
    assert.equal(sanitized.password_hash, undefined)
    assert.equal(sanitized.jwt_secret, undefined)
    assert.equal(sanitized.session_id, undefined)
    assert.equal(sanitized.internal_debug_flag, undefined)
    assert.equal(sanitized.created_at, undefined)
  })

  await t.test('TEST 4 — /api/auth/me returns authoritative profile directly from database', async () => {
    const res = await makeRequest(server, '/api/auth/me', {
      Authorization: `Bearer ${userToken}`,
    })
    assert.equal(res.status, 200)
    const json = JSON.parse(res.body)
    assert.equal(json.id, userId)
    assert.equal(json.role, 'user')
  })
})
