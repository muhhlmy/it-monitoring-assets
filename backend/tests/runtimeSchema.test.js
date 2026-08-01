import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getRequiredRuntimeColumns,
  verifyRuntimeSchema,
} from '../src/config/runtimeSchema.js'

function rowsFromColumns(columns) {
  return columns.map((entry) => {
    const separator = entry.indexOf('.')
    return {
      table_name: entry.slice(0, separator),
      column_name: entry.slice(separator + 1),
    }
  })
}

test('runtime schema preflight hanya membaca metadata dan menerima schema lengkap', async () => {
  const calls = []
  const queryable = {
    async query(sql) {
      calls.push(sql)
      return { rows: rowsFromColumns(getRequiredRuntimeColumns()) }
    },
  }

  await verifyRuntimeSchema(queryable)

  assert.equal(calls.length, 1)
  assert.match(calls[0], /SELECT table_name, column_name/)
  assert.doesNotMatch(calls[0], /\b(?:ALTER|CREATE|DROP|INSERT|UPDATE|DELETE)\b/i)
})

test('runtime schema preflight gagal sebelum traffic saat kolom wajib hilang', async () => {
  const columns = getRequiredRuntimeColumns().filter(
    (column) => column !== 'users.permissions' && column !== 'tickets.queue_id',
  )
  const queryable = {
    async query() {
      return { rows: rowsFromColumns(columns) }
    },
  }

  await assert.rejects(
    verifyRuntimeSchema(queryable),
    /Missing: .*tickets\.queue_id.*users\.permissions/,
  )
})
