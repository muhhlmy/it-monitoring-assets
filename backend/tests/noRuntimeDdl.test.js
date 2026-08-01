import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

const controllerDirectory = new URL('../src/controllers/', import.meta.url)
const forbiddenSql =
  /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|VIEW|TYPE|CONSTRAINT)\b|\bDO\s+\$\$/i

test('controller request path tidak memiliki DDL atau anonymous migration block', () => {
  const offenders = []

  for (const filename of readdirSync(controllerDirectory)) {
    if (!filename.endsWith('.js')) continue

    const source = readFileSync(new URL(filename, controllerDirectory), 'utf8')
    if (forbiddenSql.test(source)) offenders.push(filename)
  }

  assert.deepEqual(offenders, [])
})
