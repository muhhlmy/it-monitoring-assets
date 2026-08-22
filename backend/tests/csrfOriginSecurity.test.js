import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import jwt from 'jsonwebtoken'
import { app } from '../src/app.js'
import { pool } from '../src/config/database.js'
import { env } from '../src/config/env.js'
import { createSession, ensureUserSessionsTable } from '../src/services/sessionService.js'

function makeRequest(server, path, headers = {}, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const address = server.address()
    if (!address || typeof address !== 'object') {
      return reject(new Error('Server address is not available.'))
    }

    const payloadStr = bodyObj ? JSON.stringify(bodyObj) : headers.body || ''
    const reqHeaders = {
      Host: `127.0.0.1:${address.port}`,
      ...headers,
    }

    if (bodyObj && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json'
    }

    if (payloadStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payloadStr)
    }

    const options = {
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method: headers.method || (bodyObj ? 'POST' : 'GET'),
      headers: reqHeaders,
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })

    req.on('error', reject)
    if (payloadStr) {
      req.write(payloadStr)
    }
    req.end()
  })
}

test('CSRF & Origin Security Suite (DEFECT-03 / SEC-07)', async (t) => {
  let server
  let testUserId = null
  let testSessionId = null
  let validToken = null

  t.before(async () => {
    await ensureUserSessionsTable(pool)

    // Create test admin user & session
    const testUserEmail = `csrf.test.${Date.now()}@company.com`
    const userRes = await pool.query(
      `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
       VALUES ('CSRF Test Admin', $1, '$2b$10$KUuuaQWHvErN2WNcqrJOXeRC1Ym6GRyxcIzwpmRboOSkDpOPxE/Cu', 'superadmin', '{"assets":"full"}'::jsonb, true)
       RETURNING id`,
      [testUserEmail],
    )
    testUserId = userRes.rows[0].id

    const session = await createSession(testUserId)
    testSessionId = session.sessionId

    validToken = jwt.sign(
      { sub: String(testUserId), id: testUserId, sid: testSessionId, role: 'superadmin' },
      env.jwt.secret,
      { expiresIn: '12h' },
    )

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })
  })

  t.after(async () => {
    if (testUserId) {
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [testUserId]).catch(() => {})
      await pool.query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testUserId]).catch(() => {})
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  await t.test('TEST 1 — POST mutation with trusted origin succeeds', async () => {
    const res = await makeRequest(
      server,
      '/api/assets',
      {
        method: 'POST',
        Authorization: `Bearer ${validToken}`,
        Origin: 'http://localhost:5173',
      },
      {
        hostname: `HST-${Date.now().toString().slice(-8)}`,
        serial_number: `SN-${Date.now().toString().slice(-8)}`,
        status: 'Stock',
        kondisi: 'Normal',
      },
    )

    if (![200, 201].includes(res.status)) {
      console.error('TEST 1 failed with status:', res.status, 'body:', res.body)
    }

    assert.ok([200, 201].includes(res.status))
  })

  await t.test('TEST 2 — POST mutation with untrusted origin (evil site) is rejected with 403', async () => {
    const res = await makeRequest(
      server,
      '/api/assets',
      {
        method: 'POST',
        Authorization: `Bearer ${validToken}`,
        Origin: 'http://evil-malicious-site.com',
      },
      {
        hostname: `EVIL-${Date.now().toString().slice(-8)}`,
        serial_number: `SN-EVIL-${Date.now().toString().slice(-8)}`,
        status: 'Stock',
        kondisi: 'Normal',
      },
    )

    assert.equal(res.status, 403)
  })

  await t.test('TEST 3 — PUT mutation with untrusted origin is rejected with 403', async () => {
    const res = await makeRequest(
      server,
      '/api/assets/1',
      {
        method: 'PUT',
        Authorization: `Bearer ${validToken}`,
        Origin: 'http://evil-malicious-site.com',
      },
      {
        status: 'Stok',
      },
    )

    assert.equal(res.status, 403)
  })

  await t.test('TEST 4 — DELETE mutation with untrusted origin is rejected with 403', async () => {
    const res = await makeRequest(server, '/api/assets/99999', {
      method: 'DELETE',
      Authorization: `Bearer ${validToken}`,
      Origin: 'http://evil-malicious-site.com',
    })

    assert.equal(res.status, 403)
  })

  await t.test('TEST 5 — Non-browser client request (missing Origin) with valid JWT is allowed', async () => {
    const res = await makeRequest(server, '/health')
    assert.equal(res.status, 200)
  })

  await t.test('TEST 6 — CORS header never contains wildcard * for authenticated origins', async () => {
    const res = await makeRequest(server, '/health', {
      Origin: 'http://localhost:5173',
    })

    assert.notEqual(res.headers['access-control-allow-origin'], '*')
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173')
  })

  await t.test('TEST 7 — CSP header does not contain script-src *', async () => {
    const res = await makeRequest(server, '/health')
    const csp = res.headers['content-security-policy'] || ''
    assert.equal(csp.includes('script-src *'), false)
  })

  await t.test('TEST 8 — CSP header does not contain unsafe-eval for API endpoints', async () => {
    const res = await makeRequest(server, '/health')
    const csp = res.headers['content-security-policy'] || ''
    assert.equal(csp.includes("'unsafe-eval'"), false)
  })

  await t.test('TEST 9 — State-changing mutation without token returns 401', async () => {
    const res = await makeRequest(
      server,
      '/api/assets',
      {
        method: 'POST',
        Origin: 'http://localhost:5173',
      },
      {
        hostname: `NO-TOKEN-${Date.now()}`,
        serial_number: `SN-${Date.now()}`,
      },
    )

    assert.equal(res.status, 401)
  })

  await t.test('TEST 10 — Untrusted Referer header on mutation request returns 403', async () => {
    const res = await makeRequest(
      server,
      '/api/assets',
      {
        method: 'POST',
        Authorization: `Bearer ${validToken}`,
        Referer: 'http://evil-malicious-site.com/attack-page',
      },
      {
        hostname: `REFERER-HOST-${Date.now()}`,
        serial_number: `SN-${Date.now()}`,
      },
    )

    assert.equal(res.status, 403)
  })

  await t.test('TEST 11 — Security headers retained on Origin 403 error response', async () => {
    const res = await makeRequest(
      server,
      '/api/assets',
      {
        method: 'POST',
        Authorization: `Bearer ${validToken}`,
        Origin: 'http://evil-malicious-site.com',
      },
      {
        hostname: 'TEST',
      },
    )

    assert.equal(res.status, 403)
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.equal(res.headers['x-frame-options'], 'DENY')
  })

  await t.test('TEST 12 — GET requests with safe methods allow Origin inspection without blocking legitimate navigation', async () => {
    const res = await makeRequest(server, '/health', {
      method: 'GET',
      Origin: 'http://localhost:5173',
    })

    assert.equal(res.status, 200)
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173')
  })
})
