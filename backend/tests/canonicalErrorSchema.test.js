import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { app } from '../src/app.js'

function makeRequest(server, path, options = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address()
    const reqOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }

    const req = http.request(reqOptions, (res) => {
      let resData = ''
      res.on('data', (chunk) => {
        resData += chunk
      })
      res.on('end', () => {
        let parsed = null
        try {
          parsed = JSON.parse(resData)
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: resData,
          json: parsed,
        })
      })
    })

    req.on('error', reject)
    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}

test('DEFECT-13 — Canonical API Error Response Schema & Request ID Suite (API-06)', async (t) => {
  let server

  t.before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })
  })

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  await t.test('TEST 1 — 401 Unauthorized returns canonical error schema with X-Request-ID', async () => {
    const res = await makeRequest(server, '/api/assets')
    assert.equal(res.status, 401)
    assert.ok(res.headers['x-request-id'])
    assert.ok(res.json)
    assert.ok(res.json.error)
    assert.equal(res.json.error.code, 'AUTHENTICATION_REQUIRED')
    assert.ok(typeof res.json.error.message === 'string')
    assert.equal(res.json.error.requestId, res.headers['x-request-id'])
  })

  await t.test('TEST 2 — Invalid JWT Bearer token returns canonical 401 error schema', async () => {
    const res = await makeRequest(server, '/api/assets', {
      headers: { Authorization: 'Bearer invalid.fake.token' },
    })
    assert.equal(res.status, 401)
    assert.ok(res.json)
    assert.ok(res.json.error)
    assert.equal(res.json.error.code, 'AUTHENTICATION_REQUIRED')
    assert.ok(res.json.error.requestId)
  })

  await t.test('TEST 3 — Unknown API route returns JSON 404 with RESOURCE_NOT_FOUND (not HTML)', async () => {
    const res = await makeRequest(server, '/api/does-not-exist-route-123')
    assert.equal(res.status, 404)
    assert.ok(res.headers['content-type'].includes('application/json'))
    assert.ok(res.json)
    assert.ok(res.json.error)
    assert.equal(res.json.error.code, 'RESOURCE_NOT_FOUND')
    assert.equal(res.json.error.message, 'Endpoint API tidak ditemukan.')
    assert.ok(res.json.error.requestId)
  })

  await t.test('TEST 4 — Malformed JSON body returns canonical 400 Bad Request schema', async () => {
    const res = await makeRequest(server, '/api/auth/login', {
      method: 'POST',
      body: '{ invalid json payload ',
    })
    assert.equal(res.status, 400)
    assert.ok(res.json)
    assert.ok(res.json.error)
    assert.equal(res.json.error.code, 'BAD_REQUEST')
    assert.equal(res.json.error.message, 'Format JSON tidak valid.')
  })

  await t.test('TEST 5 — Client-provided X-Request-ID is echoed back in response header and payload', async () => {
    const customReqId = 'test-request-id-12345678'
    const res = await makeRequest(server, '/api/assets', {
      headers: { 'X-Request-ID': customReqId },
    })
    assert.equal(res.status, 401)
    assert.equal(res.headers['x-request-id'], customReqId)
    assert.equal(res.json.error.requestId, customReqId)
  })

  await t.test('TEST 6 — Internal stack traces and DB details are strictly concealed from error responses', async () => {
    const res = await makeRequest(server, '/api/assets')
    assert.ok(res.json)
    assert.equal(res.json.error.stack, undefined)
    assert.equal(res.json.error.sql, undefined)
    assert.equal(res.json.error.detail, undefined)
  })
})
