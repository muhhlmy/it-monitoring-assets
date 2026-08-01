import assert from 'node:assert/strict'
import test from 'node:test'
import { createBoundedRateLimiter } from '../src/middleware/rateLimitMiddleware.js'

function evaluate(middleware, request) {
  let statusCode = 200
  let body = null
  let nextCalled = false
  const headers = new Map()
  const response = {
    setHeader(name, value) {
      headers.set(name, value)
    },
    status(value) {
      statusCode = value
      return this
    },
    json(value) {
      body = value
      return this
    },
  }

  middleware(request, response, () => {
    nextCalled = true
  })
  return { statusCode, body, nextCalled, headers }
}

test('bounded limiter memberi 429, retry metadata, dan pulih pada window berikutnya', () => {
  let currentTime = 1_000
  const limiter = createBoundedRateLimiter({
    windowMs: 5_000,
    max: 2,
    maxEntries: 3,
    now: () => currentTime,
    keyGenerator: (req) => [`ip:${req.ip}`, `account:${req.email}`],
  })

  assert.equal(evaluate(limiter, { ip: '1', email: 'a' }).nextCalled, true)
  assert.equal(evaluate(limiter, { ip: '2', email: 'a' }).nextCalled, true)
  const blocked = evaluate(limiter, { ip: '3', email: 'a' })
  assert.equal(blocked.statusCode, 429)
  assert.equal(blocked.nextCalled, false)
  assert.equal(blocked.headers.get('RateLimit-Remaining'), '0')
  assert.equal(blocked.headers.get('Retry-After'), '5')

  currentTime += 5_001
  assert.equal(evaluate(limiter, { ip: '3', email: 'a' }).nextCalled, true)
})

test('limiter memory tetap bounded saat key cardinality tinggi', () => {
  const limiter = createBoundedRateLimiter({
    windowMs: 60_000,
    max: 10,
    maxEntries: 2,
    now: () => 1_000,
    keyGenerator: (req) => req.key,
  })

  for (const key of ['a', 'b', 'c', 'd']) evaluate(limiter, { key })
  assert.equal(limiter.size(), 2)
  limiter.reset()
  assert.equal(limiter.size(), 0)
})

