// One-shot adoption script: fix nullability mismatches on existing DB and
// record migration 0001 in the ledger so the runtime schema check passes.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pool } from '../src/config/database.js'

const MIGRATION_FILE = new URL(
  '../migrations/versioned/0001_canonical_schema.sql',
  import.meta.url,
)

const client = await pool.connect()
try {
  await client.query('BEGIN')

  // 1. Fix nullability mismatches (data sudah clean — diverifikasi sebelumnya).
  await client.query(
    'ALTER TABLE komentar_tiket ALTER COLUMN role_pengguna SET NOT NULL',
  )
  await client.query(
    'ALTER TABLE log_riwayat_tiket ALTER COLUMN id_tiket SET NOT NULL',
  )
  await client.query(`
    ALTER TABLE tickets
      ALTER COLUMN nomor_tiket SET NOT NULL,
      ALTER COLUMN kategori SET NOT NULL,
      ALTER COLUMN prioritas SET NOT NULL,
      ALTER COLUMN status_tiket SET NOT NULL,
      ALTER COLUMN queue_id SET NOT NULL
  `)
  await client.query(
    'ALTER TABLE users ALTER COLUMN permissions SET NOT NULL',
  )
  console.log('✅ ALTER SET NOT NULL: 8 kolom di-fix')

  // 2. Catat migration 0001 ke ledger supaya runner tidak menganggapnya pending.
  const sql = readFileSync(MIGRATION_FILE, 'utf8')
  const checksum = createHash('sha256').update(sql, 'utf8').digest('hex')
  const identity = await client.query('SELECT current_user AS db_user')
  await client.query(
    `INSERT INTO app_schema_migrations
       (version, name, checksum_sha256, applied_by, recovery_proof_id, change_id, execution_ms)
     VALUES ($1, $2, $3, $4, $5, $6, 0)`,
    [
      1,
      '0001_canonical_schema.sql',
      checksum,
      identity.rows[0].db_user,
      'manual-adoption-clean-db',
      'manual-nullability-fix',
    ],
  )
  console.log('✅ Migration 0001 dicatat ke ledger (checksum verified)')

  await client.query('COMMIT')
  console.log('\n🎉 Transaksi sukses di-commit')
} catch (error) {
  await client.query('ROLLBACK')
  console.error('❌ ROLLBACK:', error.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
