import assert from 'node:assert/strict'
import test from 'node:test'

import { requireJsonRequest } from '../src/middleware/jsonRequestMiddleware.js'

function invoke({ method, contentType }) {
  let nextCalled = false
  const response = { statusCode: null, body: null }
  const res = {
    status(statusCode) {
      response.statusCode = statusCode
      return this
    },
    json(body) {
      response.body = body
      return this
    },
  }

  requireJsonRequest(
    { method, headers: contentType ? { 'content-type': contentType } : {} },
    res,
    () => {
      nextCalled = true
    },
  )
  return { ...response, nextCalled }
}

test('mutation body hanya menerima application/json', () => {
  assert.equal(invoke({ method: 'POST', contentType: 'application/json' }).nextCalled, true)
  assert.equal(
    invoke({ method: 'PUT', contentType: 'application/json; charset=utf-8' }).nextCalled,
    true,
  )

  for (const contentType of [undefined, 'text/plain', 'application/x-www-form-urlencoded']) {
    const result = invoke({ method: 'POST', contentType })
    assert.equal(result.nextCalled, false)
    assert.equal(result.statusCode, 415)
  }

  assert.equal(
    invoke({ method: 'POST', contentType: 'application/json; unexpected=true' }).statusCode,
    415,
  )
})

test('request tanpa mutation body tidak dipaksa memiliki Content-Type', () => {
  assert.equal(invoke({ method: 'GET' }).nextCalled, true)
  assert.equal(invoke({ method: 'DELETE' }).nextCalled, true)
  assert.equal(invoke({ method: 'OPTIONS' }).nextCalled, true)
})
