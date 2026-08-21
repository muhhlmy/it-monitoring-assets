import { pool } from '../src/config/database.js'
import { ensureUserSessionsTable } from '../src/services/sessionService.js'

async function run() {
  console.log('Running user_sessions table migration...')
  try {
    await ensureUserSessionsTable(pool)
    console.log('Successfully created user_sessions table and indexes.')
  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    await pool.end()
  }
}

run()
