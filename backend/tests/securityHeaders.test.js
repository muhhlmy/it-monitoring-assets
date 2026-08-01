import assert from 'node:assert/strict'
import test from 'node:test'

import { setSecurityHeaders } from '../src/middleware/securityHeaders.js'

test('API memasang security headers yang tidak bergantung pada deployment proxy', () => {
  const headers = new Map()
  let nextCalled = false

  setSecurityHeaders(
    {},
    {
      setHeader(name, value) {
        headers.set(name, value)
      },
    },
    () => {
      nextCalled = true
    },
  )

  assert.equal(nextCalled, true)
  assert.equal(headers.get('Cache-Control'), 'no-store')
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(headers.get('X-Frame-Options'), 'DENY')
  assert.equal(headers.get('Referrer-Policy'), 'no-referrer')
  assert.match(headers.get('Content-Security-Policy'), /frame-ancestors 'none'/)
  assert.equal(headers.get('Permissions-Policy'), 'camera=(), geolocation=(), microphone=()')
  assert.equal(headers.has('Strict-Transport-Security'), false)
})
