import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import jwt from 'jsonwebtoken'
import { app } from '../src/app.js'
import { pool } from '../src/config/database.js'
import { env } from '../src/config/env.js'
import { createSession, ensureUserSessionsTable } from '../src/services/sessionService.js'
import { escapeCsvField } from '../src/controllers/exportController.js'

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

test('DEFECT-10 — Export API Implementation & Security Suite (EXP-02)', async (t) => {
  let server
  let superadminToken
  let normalUserToken
  let superadminId, normalUserId

  t.before(async () => {
    await ensureUserSessionsTable(pool).catch(() => {})

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })

    const ts = Date.now()

    // 1. Create Superadmin User in DB
    const resSA = await pool.query(
      `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
       VALUES ('Superadmin Test', $1, '$2b$10$e8w8X9nZgLp5oN4n44444eR8oOSkDpOPxE/Cu0000000000000000', 'superadmin', '{}'::jsonb, true)
       RETURNING id`,
      [`export_sa_${ts}@company.com`],
    )
    superadminId = resSA.rows[0].id

    const sessionSA = await createSession(superadminId)
    superadminToken = jwt.sign(
      {
        sub: String(superadminId),
        id: superadminId,
        sid: sessionSA.sessionId,
        email: `export_sa_${ts}@company.com`,
        role: 'superadmin',
        permissions: {},
      },
      env.jwt.secret,
      { expiresIn: '1h' },
    )

    // 2. Create Normal User in DB
    const resUser = await pool.query(
      `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
       VALUES ('Normal User Test', $1, '$2b$10$e8w8X9nZgLp5oN4n44444eR8oOSkDpOPxE/Cu0000000000000000', 'user', '{}'::jsonb, true)
       RETURNING id`,
      [`export_user_${ts}@company.com`],
    )
    normalUserId = resUser.rows[0].id

    const sessionUser = await createSession(normalUserId)
    normalUserToken = jwt.sign(
      {
        sub: String(normalUserId),
        id: normalUserId,
        sid: sessionUser.sessionId,
        email: `export_user_${ts}@company.com`,
        role: 'user',
        permissions: {},
      },
      env.jwt.secret,
      { expiresIn: '1h' },
    )
  })

  t.after(async () => {
    if (superadminId) {
      await pool.query('DELETE FROM users WHERE id = $1', [superadminId]).catch(() => {})
    }
    if (normalUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [normalUserId]).catch(() => {})
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  await t.test('TEST 1 — GET /api/export returns 200 JSON index capability manifest for superadmin', async () => {
    const res = await makeRequest(server, '/api/export', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(res.status, 200)
    assert.ok(res.headers['content-type'].includes('application/json'))
    const json = JSON.parse(res.body)
    assert.equal(json.success, true)
    assert.ok(Array.isArray(json.endpoints))
    assert.ok(json.endpoints.some((e) => e.path === '/api/export/assets'))
    assert.ok(json.endpoints.some((e) => e.path === '/api/export/users'))
    assert.ok(json.endpoints.some((e) => e.path === '/api/export/tickets'))
  })

  await t.test('TEST 2 — GET /api/export/assets returns 200 CSV attachment file', async () => {
    const res = await makeRequest(server, '/api/export/assets', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(res.status, 200)
    assert.ok(res.headers['content-type'].includes('text/csv'))
    assert.ok(res.headers['content-disposition'].includes('attachment; filename="export-assets-'))
    assert.ok(res.body.includes('ID Aset') || res.body.includes('Hostname'))
  })

  await t.test('TEST 3 — GET /api/export/users returns 200 CSV and strictly EXCLUDES passwords & secrets', async () => {
    const res = await makeRequest(server, '/api/export/users', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(res.status, 200)
    assert.ok(res.headers['content-type'].includes('text/csv'))
    assert.ok(res.headers['content-disposition'].includes('attachment; filename="export-users-'))
    const lowerBody = res.body.toLowerCase()
    assert.equal(lowerBody.includes('password'), false, 'User export must NOT contain password field')
    assert.equal(lowerBody.includes('hash'), false, 'User export must NOT contain hash field')
    assert.equal(lowerBody.includes('secret'), false, 'User export must NOT contain secret field')
  })

  await t.test('TEST 4 — GET /api/export/tickets returns 200 CSV attachment file', async () => {
    const res = await makeRequest(server, '/api/export/tickets', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(res.status, 200)
    assert.ok(res.headers['content-type'].includes('text/csv'))
    assert.ok(res.headers['content-disposition'].includes('attachment; filename="export-tickets-'))
  })

  await t.test('TEST 5 — Non-superadmin user GET /api/export/assets is denied with 403', async () => {
    const res = await makeRequest(server, '/api/export/assets', {
      Authorization: `Bearer ${normalUserToken}`,
    })
    assert.equal(res.status, 403)
  })

  await t.test('TEST 6 — Unauthenticated request GET /api/export/assets is denied with 401', async () => {
    const res = await makeRequest(server, '/api/export/assets', {})
    assert.equal(res.status, 401)
  })

  await t.test('TEST 7 — GET /api/export/assets?format=json returns 200 JSON attachment', async () => {
    const res = await makeRequest(server, '/api/export/assets?format=json', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(res.status, 200)
    assert.ok(res.headers['content-type'].includes('application/json'))
    assert.ok(res.headers['content-disposition'].includes('attachment; filename="export-assets-'))
    const json = JSON.parse(res.body)
    assert.equal(json.success, true)
    assert.equal(json.tableName, 'aset_ti')
  })

  await t.test('TEST 8 — Formula injection characters (=, +, -, @) are neutralized in CSV export', () => {
    assert.equal(escapeCsvField('=SUM(1+1)'), "'=SUM(1+1)")
    assert.equal(escapeCsvField('+123'), "'+123")
    assert.equal(escapeCsvField('-123'), "'-123")
    assert.equal(escapeCsvField('@cmd'), "'@cmd")
    assert.equal(escapeCsvField('Normal Text'), 'Normal Text')
  })

  await t.test('TEST 9 — Non-superadmin user POST /api/export/reset-database is denied with 403', async () => {
    const res = await makeRequest(
      server,
      '/api/export/reset-database',
      { Authorization: `Bearer ${normalUserToken}`, method: 'POST' },
      {},
    )
    assert.equal(res.status, 403)
  })
})
