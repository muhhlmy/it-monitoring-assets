import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import jwt from 'jsonwebtoken'

const testJwtSecret = 'j'.repeat(32)

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = testJwtSecret
process.env.DB_HOST = '127.0.0.1'
process.env.DB_PORT = '5432'
process.env.DB_USER = 'test_user'
process.env.DB_PASSWORD = 'test_password_not_used'
process.env.DB_NAME = 'test_database'
process.env.CORS_ORIGINS = 'http://localhost:5173'

const { app } = await import('../src/app.js')
const { pool } = await import('../src/config/database.js')

async function startServer(t) {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  })

  return server.address().port
}

function createToken() {
  return jwt.sign(
    { id: 1, nama: 'Test Admin', role: 'superadmin' },
    testJwtSecret,
    { expiresIn: '5m' }
  )
}

test('GET /api/export/full-db returns 404 without querying the database', async (t) => {
  const originalQuery = pool.query
  let queryCount = 0

  pool.query = async () => {
    queryCount += 1
    throw new Error('Database query must not run for the removed endpoint.')
  }
  t.after(() => {
    pool.query = originalQuery
  })

  const port = await startServer(t)
  const token = createToken()

  const response = await fetch(`http://127.0.0.1:${port}/api/export/full-db`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const body = await response.json()

  assert.equal(response.status, 404)
  assert.deepEqual(body, { message: 'Endpoint tidak ditemukan.' })
  assert.equal(queryCount, 0)
})

test('POST /api/export/data remains available for custom exports', async (t) => {
  const originalQuery = pool.query

  pool.query = async () => ({
    rows: [{ id_aset: 7, label_aset: 'LAPTOP-007' }]
  })
  t.after(() => {
    pool.query = originalQuery
  })

  const port = await startServer(t)
  const token = createToken()

  const response = await fetch(`http://127.0.0.1:${port}/api/export/data`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tableName: 'aset_ti',
      columns: ['id_aset', 'label_aset'],
      limit: 1
    })
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.success, true)
  assert.equal(body.tableName, 'aset_ti')
  assert.deepEqual(body.data, [{ id_aset: 7, label_aset: 'LAPTOP-007' }])
})
