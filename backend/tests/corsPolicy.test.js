import assert from 'node:assert/strict'
import test from 'node:test'

import { isCorsOriginAllowed } from '../src/security/corsPolicy.js'

const configuredOrigins = [
  'http://localhost:5173',
  'https://assets.example.test',
]

test('CORS hanya mengizinkan origin yang dikonfigurasi secara persis', () => {
  assert.equal(isCorsOriginAllowed('http://localhost:5173', configuredOrigins), true)
  assert.equal(isCorsOriginAllowed('https://assets.example.test', configuredOrigins), true)
  assert.equal(isCorsOriginAllowed('https://assets.example.test.evil.invalid', configuredOrigins), false)
})

test('CORS tidak mempercayai seluruh private network secara implisit', () => {
  assert.equal(isCorsOriginAllowed('http://192.168.1.20:5173', configuredOrigins), false)
  assert.equal(isCorsOriginAllowed('http://10.0.0.20:5173', configuredOrigins), false)
  assert.equal(isCorsOriginAllowed('http://172.16.0.20:5173', configuredOrigins), false)
})

test('request tanpa Origin tetap didukung tetapi wildcard ditolak', () => {
  assert.equal(isCorsOriginAllowed(undefined, configuredOrigins), true)
  assert.equal(isCorsOriginAllowed('https://any.example', ['*']), false)
})
