import pg from 'pg'
import { env } from './env.js'

// Pool menyimpan beberapa koneksi agar bisa digunakan berulang kali.
export const pool = new pg.Pool({
  host: env.database.host,
  port: env.database.port,
  user: env.database.user,
  password: env.database.password,
  database: env.database.database,
  ssl: env.database.ssl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

function handlePoolError(error) {
  console.error('Koneksi PostgreSQL mengalami error:', error)
}

pool.on('error', handlePoolError)

export function query(sql, parameters) {
  return pool.query(sql, parameters)
}

// Transaction memastikan beberapa query dianggap sebagai satu proses.
// Jika salah satu query gagal, semua perubahan akan dibatalkan dengan ROLLBACK.
export async function withTransaction(callback) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const result = await callback(client)

    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
