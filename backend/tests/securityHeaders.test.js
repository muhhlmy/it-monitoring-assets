import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { app } from '../src/app.js'

function makeRequest(server, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address()
    if (!address || typeof address !== 'object') {
      return reject(new Error('Server address is not available.'))
    }

    const options = {
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method: headers.method || 'GET',
      headers: {
        Host: `127.0.0.1:${address.port}`,
        ...headers,
      },
    }

    const req = http.request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })

    req.on('error', reject)
    if (headers.body) {
      req.write(headers.body)
    }
    req.end()
  })
}

test('HTTP Security Headers & CORS Policy Suite (DEFECT-02 / DEFECT-15 / SEC-07)', async (t) => {
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

  await t.test('TEST 1 — X-Content-Type-Options === nosniff', async () => {
    const res = await makeRequest(server, '/health')
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
  })

  await t.test('TEST 2 — X-Frame-Options === DENY', async () => {
    const res = await makeRequest(server, '/health')
    assert.equal(res.headers['x-frame-options'], 'DENY')
  })

  await t.test('TEST 3 — Referrer-Policy === strict-origin-when-cross-origin', async () => {
    const res = await makeRequest(server, '/health')
    assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin')
  })

  await t.test('TEST 4 — Permissions-Policy restriction catalog', async () => {
    const res = await makeRequest(server, '/health')
    assert.equal(res.headers['permissions-policy'], 'camera=(), geolocation=(), microphone=(), payment=(), usb=()')
  })

  await t.test('TEST 5 — Cross-Origin-Opener-Policy === same-origin', async () => {
    const res = await makeRequest(server, '/health')
    assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin')
  })

  await t.test('TEST 6 — Cross-Origin-Resource-Policy === same-origin', async () => {
    const res = await makeRequest(server, '/health')
    assert.equal(res.headers['cross-origin-resource-policy'], 'same-origin')
  })

  await t.test('TEST 7 — Content-Security-Policy is strict and contains NO unsafe-eval or wildcard script-src', async () => {
    const res = await makeRequest(server, '/health')
    const csp = res.headers['content-security-policy']
    assert.ok(typeof csp === 'string' && csp.length > 0)
    assert.ok(csp.includes("default-src 'self'"))
    assert.ok(csp.includes("script-src 'self'"))
    assert.ok(!csp.includes("script-src 'unsafe-inline'"), 'CSP script-src must not contain unsafe-inline')
    assert.ok(!csp.includes('unsafe-eval'), 'CSP must not contain unsafe-eval')
    assert.ok(!csp.includes('script-src *'), 'CSP script-src must not be wildcard *')
    assert.ok(csp.includes("frame-ancestors 'none'"))
    assert.ok(csp.includes("object-src 'none'"))
  })

  await t.test('TEST 8 — X-XSS-Protection === 1; mode=block', async () => {
    const res = await makeRequest(server, '/health')
    assert.equal(res.headers['x-xss-protection'], '1; mode=block')
  })

  await t.test('TEST 9 — Strict-Transport-Security (HSTS) included on HTTPS requests', async () => {
    const res = await makeRequest(server, '/health', {
      'x-forwarded-proto': 'https',
    })
    assert.equal(res.headers['strict-transport-security'], 'max-age=31536000; includeSubDomains')
  })

  await t.test('TEST 10 — Strict-Transport-Security (HSTS) omitted on HTTP dev requests', async () => {
    const res = await makeRequest(server, '/health')
    assert.equal(res.headers['strict-transport-security'], undefined)
  })

  await t.test('TEST 11 — Security headers present on 401 Unauthorized API responses', async () => {
    const res = await makeRequest(server, '/api/auth/me')
    assert.equal(res.status, 401)
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.equal(res.headers['x-frame-options'], 'DENY')
    assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin')
    assert.ok(res.headers['content-security-policy'])
  })

  await t.test('TEST 12 — Security headers present on 404 Not Found API responses', async () => {
    const res = await makeRequest(server, '/api/non-existent-endpoint')
    assert.equal(res.status, 404)
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.equal(res.headers['x-frame-options'], 'DENY')
    assert.equal(res.headers['x-xss-protection'], '1; mode=block')
  })

  await t.test('TEST 13 — CORS allows configured frontend origin', async () => {
    const res = await makeRequest(server, '/health', {
      Origin: 'http://localhost:5173',
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173')
  })

  await t.test('TEST 14 — CORS rejects disallowed origin without Access-Control-Allow-Origin header', async () => {
    const res = await makeRequest(server, '/health', {
      Origin: 'http://evil-malicious-site.com',
    })
    assert.equal(res.headers['access-control-allow-origin'], undefined)
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.equal(res.headers['x-frame-options'], 'DENY')
  })

  await t.test('TEST 15 — OPTIONS preflight request handling', async () => {
    const res = await makeRequest(server, '/api/assets', {
      method: 'OPTIONS',
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
    })
    assert.ok(res.status === 204 || res.status === 200)
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.equal(res.headers['x-frame-options'], 'DENY')
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173')
  })
})
