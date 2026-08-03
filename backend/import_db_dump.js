import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './src/config/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function importDatabase() {
  console.log('🔄 Memulai impor/overwrite skema dan data database...')

  const dumpPath = path.join(__dirname, 'database_dump.sql')
  if (!fs.existsSync(dumpPath)) {
    throw new Error(`File dump tidak ditemukan di: ${dumpPath}`)
  }

  const sqlContent = fs.readFileSync(dumpPath, 'utf8')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sqlContent)
    await client.query('COMMIT')
    console.log('✅ Berhasil overwrite skema dan impor data database dari database_dump.sql!')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

importDatabase().catch((err) => {
  console.error('❌ Gagal melakukan impor database:', err.message)
  process.exit(1)
})
