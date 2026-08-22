import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { app } from '../src/app.js'
import { isCorsOriginAllowed } from '../src/security/corsPolicy.js'

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

test('DEFECT-09 — Explicit CORS Policy & Preflight Security Suite (SEC-08)', async (t) => {
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

  await t.test('TEST 1 — Trusted origin receives exact Access-Control-Allow-Origin', async () => {
    const res = await makeRequest(server, '/health', {
      Origin: 'http://localhost:5173',
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173')
  })

  await t.test('TEST 2 — Evil origin receives NO Access-Control-Allow-Origin header', async () => {
    const res = await makeRequest(server, '/health', {
      Origin: 'http://evil-attacker.com',
    })
    assert.equal(res.headers['access-control-allow-origin'], undefined)
  })

  await t.test('TEST 3 — Random origin is denied CORS headers', async () => {
    const res = await makeRequest(server, '/health', {
      Origin: 'https://random-untrusted-site.org',
    })
    assert.equal(res.headers['access-control-allow-origin'], undefined)
  })

  await t.test('TEST 4 — Requests without Origin header (cURL / Postman / Server) proceed normally', async () => {
    const res = await makeRequest(server, '/health', {})
    assert.equal(res.status, 200)
  })

  await t.test('TEST 5 — OPTIONS preflight for trusted origin returns 204 with CORS headers', async () => {
    const res = await makeRequest(server, '/api/assets', {
      method: 'OPTIONS',
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Authorization, Content-Type',
    })
    assert.equal(res.status, 204)
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173')
    assert.ok(res.headers['access-control-allow-methods'])
    assert.ok(res.headers['access-control-allow-methods'].includes('POST'))
  })

  await t.test('TEST 6 — OPTIONS preflight for evil origin returns NO Access-Control-Allow-Origin header', async () => {
    const res = await makeRequest(server, '/api/assets', {
      method: 'OPTIONS',
      Origin: 'http://evil-attacker.com',
      'Access-Control-Request-Method': 'POST',
    })
    assert.equal(res.headers['access-control-allow-origin'], undefined)
  })

  await t.test('TEST 7 — Preflight permits Authorization header for trusted origin', async () => {
    const res = await makeRequest(server, '/api/assets', {
      method: 'OPTIONS',
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    })
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173')
    assert.ok(
      res.headers['access-control-allow-headers'] &&
        res.headers['access-control-allow-headers'].toLowerCase().includes('authorization'),
    )
  })

  await t.test('TEST 8 — Preflight permits Content-Type header for trusted origin', async () => {
    const res = await makeRequest(server, '/api/assets', {
      method: 'OPTIONS',
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    })
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173')
    assert.ok(
      res.headers['access-control-allow-headers'] &&
        res.headers['access-control-allow-headers'].toLowerCase().includes('content-type'),
    )
  })

  await t.test('TEST 9 — Access-Control-Allow-Credentials is NOT emitted for Bearer JWT API', async () => {
    const res = await makeRequest(server, '/health', {
      Origin: 'http://localhost:5173',
    })
    assert.equal(res.headers['access-control-allow-credentials'], undefined)
  })

  await t.test('TEST 10 — Vary: Origin header is set on responses', async () => {
    const res = await makeRequest(server, '/health', {
      Origin: 'http://localhost:5173',
    })
    assert.ok(res.headers['vary'] && res.headers['vary'].includes('Origin'))
  })

  await t.test('TEST 11 — Multiple allowed origins are evaluated accurately', () => {
    const origins = ['https://app.example.com', 'https://admin.example.com']
    assert.equal(isCorsOriginAllowed('https://app.example.com', origins), true)
    assert.equal(isCorsOriginAllowed('https://admin.example.com', origins), true)
    assert.equal(isCorsOriginAllowed('https://evil.example.com', origins), false)
  })

  await t.test('TEST 12 — Scheme/Protocol mismatch (http vs https) is strictly rejected', () => {
    const origins = ['https://app.example.com']
    assert.equal(isCorsOriginAllowed('http://app.example.com', origins), false)
    assert.equal(isCorsOriginAllowed('https://app.example.com', origins), true)
  })
})
