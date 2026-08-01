import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const seedSql = readFileSync(new URL('../Seed.sql', import.meta.url), 'utf8')
const seedUsersSource = readFileSync(
  new URL('../src/config/seedUsers.js', import.meta.url),
  'utf8',
)

test('seed tidak menyimpan atau membuat credential user dari repository', () => {
  assert.doesNotMatch(seedSql, /INSERT\s+INTO\s+users\b/i)
  assert.doesNotMatch(seedUsersSource, /\b(?:admin|user)123\b/i)
  assert.doesNotMatch(seedUsersSource, /bcrypt\.hash|INSERT\s+INTO\s+users/i)
  assert.match(seedUsersSource, /User seed dinonaktifkan/)
})
