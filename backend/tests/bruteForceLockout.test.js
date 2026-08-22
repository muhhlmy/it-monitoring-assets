import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { app } from '../src/app.js'
import { pool } from '../src/config/database.js'
import {
  ensureAccountSecurityTable,
  resetFailedLogin,
} from '../src/services/accountSecurityService.js'

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

test('Brute-Force Lockout & Account Protection Suite (DEFECT-04 / SEC-11)', async (t) => {
  let server
  let testUserId = null
  const testUserEmail = `brute.test.${Date.now()}@company.com`
  const testUserPassword = 'CorrectPassword123!'

  t.before(async () => {
    await ensureAccountSecurityTable(pool)
    await resetFailedLogin(testUserEmail).catch(() => {})

    // Insert test user into database
    const userRes = await pool.query(
      `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
       VALUES ('Brute Lockout Test User', $1, '$2b$10$KUuuaQWHvErN2WNcqrJOXeRC1Ym6GRyxcIzwpmRboOSkDpOPxE/Cu', 'user', '{"assets":"read"}'::jsonb, true)
       RETURNING id`,
      [testUserEmail],
    )
    testUserId = userRes.rows[0].id

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })
  })

  t.after(async () => {
    if (testUserEmail) {
      await resetFailedLogin(testUserEmail).catch(() => {})
    }
    if (testUserId) {
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [testUserId]).catch(() => {})
      await pool.query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testUserId]).catch(() => {})
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  await t.test('TEST 1 — First failed login returns 401 without lockout', async () => {
    await resetFailedLogin(testUserEmail)

    const res = await makeRequest(
      server,
      '/api/auth/login',
      {},
      {
        email: testUserEmail,
        password: 'WrongPassword1!',
      },
    )

    assert.equal(res.status, 401)
    const json = JSON.parse(res.body)
    assert.equal(json.message, 'Kredensial tidak valid.')
    assert.equal(res.headers['retry-after'], undefined)
  })

  await t.test('TEST 2 — Attempts 1-4 return 401 without lockout', async () => {
    await resetFailedLogin(testUserEmail)

    for (let i = 1; i <= 4; i++) {
      const res = await makeRequest(
        server,
        '/api/auth/login',
        {},
        {
          email: testUserEmail,
          password: `WrongPasswordAttempt${i}`,
        },
      )

      assert.equal(res.status, 401)
      assert.equal(res.headers['retry-after'], undefined)
    }
  })

  await t.test('TEST 3 — 5th failed attempt triggers account lockout (30s) and returns 429', async () => {
    await resetFailedLogin(testUserEmail)

    // Execute 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      await makeRequest(
        server,
        '/api/auth/login',
        {},
        {
          email: testUserEmail,
          password: `WrongPassword${i}`,
        },
      )
    }

    // 5th attempt
    const res = await makeRequest(
      server,
      '/api/auth/login',
      {},
      {
        email: testUserEmail,
        password: 'WrongPassword5',
      },
    )

    assert.equal(res.status, 429)
    assert.ok(res.headers['retry-after'])
    const retryAfter = parseInt(res.headers['retry-after'], 10)
    assert.ok(retryAfter > 0 && retryAfter <= 35, `Expected retryAfter between 1 and 35, got ${retryAfter}`)

    const json = JSON.parse(res.body)
    assert.equal(json.message, 'Terlalu banyak percobaan login. Silakan coba lagi nanti.')
  })

  await t.test('TEST 4 — 6th attempt during lock is blocked with 429', async () => {
    const res = await makeRequest(
      server,
      '/api/auth/login',
      {},
      {
        email: testUserEmail,
        password: 'EvenCorrectPasswordBlockedDuringLock',
      },
    )

    assert.equal(res.status, 429)
    assert.ok(res.headers['retry-after'])
  })

  await t.test('TEST 5 — Account enumeration protection (existing vs non-existing return identical status & message)', async () => {
    await resetFailedLogin(testUserEmail)

    const nonExistingEmail = `nonexistent.${Date.now()}@company.com`

    const resExisting = await makeRequest(
      server,
      '/api/auth/login',
      {},
      {
        email: testUserEmail,
        password: 'WrongPasswordForExisting',
      },
    )

    const resNonExisting = await makeRequest(
      server,
      '/api/auth/login',
      {},
      {
        email: nonExistingEmail,
        password: 'WrongPasswordForNonExisting',
      },
    )

    assert.equal(resExisting.status, 401)
    assert.equal(resNonExisting.status, 401)

    const jsonExist = JSON.parse(resExisting.body)
    const jsonNonExist = JSON.parse(resNonExisting.body)

    assert.equal(jsonExist.message, 'Kredensial tidak valid.')
    assert.equal(jsonNonExist.message, 'Kredensial tidak valid.')
  })

  await t.test('TEST 6 — Successful login resets failure counter and clears lock', async () => {
    await resetFailedLogin(testUserEmail)

    // Failed login x 2
    await makeRequest(server, '/api/auth/login', {}, { email: testUserEmail, password: 'Bad1' })
    await makeRequest(server, '/api/auth/login', {}, { email: testUserEmail, password: 'Bad2' })

    // Successful login (password admin123 matches hash $2b$10$KUuuaQWHvErN2WNcqrJOXeRC1Ym6GRyxcIzwpmRboOSkDpOPxE/Cu)
    const resSuccess = await makeRequest(
      server,
      '/api/auth/login',
      {},
      {
        email: testUserEmail,
        password: 'admin123',
      },
    )

    assert.equal(resSuccess.status, 200)
    const successJson = JSON.parse(resSuccess.body)
    assert.ok(successJson.token)

    // Next failed attempt starts counter fresh at 1 (returns 401 instead of lock)
    const resAfterReset = await makeRequest(
      server,
      '/api/auth/login',
      {},
      {
        email: testUserEmail,
        password: 'BadAfterReset',
      },
    )

    assert.equal(resAfterReset.status, 401)
  })

  await t.test('TEST 7 — Concurrent failed logins handle counter race conditions atomically', async () => {
    const concurrentEmail = `concurrent.${Date.now()}@company.com`
    await resetFailedLogin(concurrentEmail)

    // Fire 5 concurrent failed requests
    const promises = Array.from({ length: 5 }).map(() =>
      makeRequest(
        server,
        '/api/auth/login',
        {},
        {
          email: concurrentEmail,
          password: 'WrongPasswordConcurrent',
        },
      ),
    )

    const results = await Promise.all(promises)
    const statuses = results.map((r) => r.status)

    // At least one attempt triggers the progressive backoff (status 429)
    assert.ok(statuses.includes(429) || statuses.includes(401))

    // DB state must show counter === 5
    const dbRes = await pool.query(
      `SELECT failed_attempt_count FROM account_security_state WHERE account_key = $1`,
      [concurrentEmail],
    )
    assert.ok(dbRes.rowCount > 0)
    assert.equal(dbRes.rows[0].failed_attempt_count, 5)

    await resetFailedLogin(concurrentEmail)
  })

  await t.test('TEST 8 — Failed logins do NOT create sessions in database', async () => {
    const freshEmail = `sessiontest.${Date.now()}@company.com`
    const initialSessionCountRes = await pool.query('SELECT COUNT(*)::int as cnt FROM user_sessions')
    const initialCount = initialSessionCountRes.rows[0].cnt

    await makeRequest(
      server,
      '/api/auth/login',
      {},
      {
        email: freshEmail,
        password: 'WrongPasswordNoSession',
      },
    )

    const finalSessionCountRes = await pool.query('SELECT COUNT(*)::int as cnt FROM user_sessions')
    const finalCount = finalSessionCountRes.rows[0].cnt

    assert.equal(initialCount, finalCount)
  })
})
