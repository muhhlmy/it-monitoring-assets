import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import jwt from 'jsonwebtoken'
import { app } from '../src/app.js'
import { pool } from '../src/config/database.js'
import { env } from '../src/config/env.js'
import { createBoundedRateLimiter } from '../src/middleware/rateLimitMiddleware.js'
import { parseSearchQuery } from '../src/security/requestValidation.js'
import { createSession, ensureUserSessionsTable } from '../src/services/sessionService.js'

function makeRequest(server, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address()
    const reqOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method: headers.method || 'GET',
      headers: {
        Host: `127.0.0.1:${address.port}`,
        ...headers,
      },
    }

    const req = http.request(reqOptions, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        let json = null
        try {
          json = JSON.parse(body)
        } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body, json })
      })
    })

    req.on('error', reject)
    req.end()
  })
}

test('DEFECT-15 / DEFECT-16 — Rate Limiting & Abuse Protection Suite (SEC-07)', async (t) => {
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

  await t.test('TEST 1 — Rate limiter emits 429 canonical error schema when limit exceeded', async () => {
    const limiter = createBoundedRateLimiter({
      windowMs: 60_000,
      max: 2,
      keyGenerator: () => 'test-key-429',
    })

    const req = { headers: {}, path: '/api/test', requestId: 'req-429-id' }
    let resCode = null
    let resJson = null
    let retryAfter = null

    const res = {
      setHeader(k, v) {
        if (k === 'Retry-After') retryAfter = v
      },
      status(code) {
        resCode = code
        return {
          json(data) {
            resJson = data
          },
        }
      },
    }

    const next = () => {}

    limiter(req, res, next) // 1
    limiter(req, res, next) // 2
    limiter(req, res, next) // 3 -> BLOCKED

    assert.equal(resCode, 429)
    assert.ok(retryAfter)
    assert.ok(resJson.error)
    assert.equal(resJson.error.code, 'RATE_LIMITED')
    assert.equal(resJson.error.requestId, 'req-429-id')
  })

  await t.test('TEST 2 — SSE connections (Accept: text/event-stream) are exempted from rate limiting', async () => {
    const limiter = createBoundedRateLimiter({
      windowMs: 60_000,
      max: 1,
      keyGenerator: () => 'sse-key',
    })

    const reqSse = { headers: { accept: 'text/event-stream' }, path: '/api/tickets/events' }
    let nextCalled = false
    const next = () => {
      nextCalled = true
    }

    limiter(reqSse, {}, next)
    assert.equal(nextCalled, true, 'SSE request must bypass rate limiting')
  })

  await t.test('TEST 3 — Search query exceeding 100 characters throws 400 Bad Request error', async () => {
    const validQuery = 'laptop'
    assert.equal(parseSearchQuery(validQuery), 'laptop')

    const longQuery = 'a'.repeat(101)
    assert.throws(
      () => parseSearchQuery(longQuery),
      (err) => err.statusCode === 400 && err.message.includes('100 karakter'),
    )
  })

  await t.test('TEST 4 — Bounded LRU Map prunes oldest entries when capacity maxEntries reached', async () => {
    const limiter = createBoundedRateLimiter({
      windowMs: 60_000,
      max: 5,
      maxEntries: 2,
      keyGenerator: (req) => req.key,
    })

    const next = () => {}
    limiter({ key: 'k1' }, { setHeader: () => {} }, next)
    limiter({ key: 'k2' }, { setHeader: () => {} }, next)
    assert.equal(limiter.size(), 2)

    limiter({ key: 'k3' }, { setHeader: () => {} }, next)
    assert.ok(limiter.size() <= 2, 'Limiter map must not exceed maxEntries')
  })

  await t.test('TEST 5 — User A hitting limit does not block User B (User-Identity Key Isolation)', async () => {
    const limiter = createBoundedRateLimiter({
      windowMs: 60_000,
      max: 1,
      keyGenerator: (req) => `user:${req.userId}`,
    })

    let userAStatus = 200
    let userBStatus = 200

    const mockRes = (setUserStatus) => ({
      setHeader: () => {},
      status: (code) => {
        setUserStatus(code)
        return { json: () => {} }
      },
    })

    limiter({ userId: 'userA' }, mockRes((c) => (userAStatus = c)), () => {})
    limiter({ userId: 'userA' }, mockRes((c) => (userAStatus = c)), () => {}) // Blocked

    limiter({ userId: 'userB' }, mockRes((c) => (userBStatus = c)), () => {}) // Allowed

    assert.equal(userAStatus, 429)
    assert.equal(userBStatus, 200, 'User B must not be blocked when User A hits rate limit')
  })
})
