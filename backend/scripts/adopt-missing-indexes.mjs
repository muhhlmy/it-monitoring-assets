// One-shot: create missing indexes and the uq_aset_ti_nomor_seri constraint
// that the adopt-canonical-constraints script could not rename (old name didn't exist).
import { pool } from '../src/config/database.js'

const client = await pool.connect()

try {
  await client.query('BEGIN')

  // 1) Add the missing UNIQUE constraint on aset_ti.nomor_seri
  console.log('1) Add uq_aset_ti_nomor_seri if missing')
  const existing = await client.query(
    `SELECT 1 FROM pg_constraint WHERE conname='uq_aset_ti_nomor_seri' AND connamespace='public'::regnamespace`
  )
  if (existing.rowCount === 0) {
    await client.query(`ALTER TABLE aset_ti ADD CONSTRAINT uq_aset_ti_nomor_seri UNIQUE (nomor_seri)`)
    console.log('  + uq_aset_ti_nomor_seri')
  } else {
    console.log('  · uq_aset_ti_nomor_seri sudah ada')
  }

  // 2) Create all required indexes (IF NOT EXISTS)
  console.log('\n2) Create missing indexes')

  const INDEXES = [
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_karyawan_email_normalized
       ON karyawan (LOWER(BTRIM(email_kantor)))
       WHERE email_kantor IS NOT NULL AND BTRIM(email_kantor) <> ''`,

    `CREATE INDEX IF NOT EXISTS idx_aset_ti_karyawan
       ON aset_ti (id_karyawan)`,

    `CREATE INDEX IF NOT EXISTS idx_log_riwayat_aset_asset_created
       ON log_riwayat_aset (id_aset, dibuat_pada DESC)`,

    `CREATE INDEX IF NOT EXISTS idx_log_audit_login_created
       ON log_audit_login (dibuat_pada DESC)`,

    `CREATE INDEX IF NOT EXISTS idx_riwayat_pemakaian_nik_started
       ON riwayat_pemakaian_aset (nik, tanggal_mulai DESC)`,

    `CREATE INDEX IF NOT EXISTS idx_riwayat_pemakaian_asset_started
       ON riwayat_pemakaian_aset (id_aset, tanggal_mulai DESC)`,

    `CREATE UNIQUE INDEX IF NOT EXISTS uq_riwayat_pemakaian_active_asset
       ON riwayat_pemakaian_aset (id_aset)
       WHERE id_aset IS NOT NULL AND tanggal_selesai IS NULL`,

    `CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_normalized
       ON users (LOWER(BTRIM(email)))`,

    `CREATE INDEX IF NOT EXISTS idx_users_active_role
       ON users (role, id)
       WHERE is_active = TRUE AND deleted_at IS NULL`,

    `CREATE INDEX IF NOT EXISTS idx_users_deleted_at
       ON users (deleted_at DESC)
       WHERE deleted_at IS NOT NULL`,

    `CREATE INDEX IF NOT EXISTS idx_aset_ti_active_listing
       ON aset_ti (status_aset, id_aset)
       WHERE deleted_at IS NULL`,

    `CREATE INDEX IF NOT EXISTS idx_aset_ti_deleted_at
       ON aset_ti (deleted_at DESC)
       WHERE deleted_at IS NOT NULL`,

    `CREATE INDEX IF NOT EXISTS idx_tickets_queue_status_created
       ON tickets (queue_id, status_tiket, dibuat_pada DESC)
       WHERE deleted_at IS NULL`,

    `CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status
       ON tickets (assigned_to_user_id, status_tiket)
       WHERE deleted_at IS NULL`,

    `CREATE INDEX IF NOT EXISTS idx_tickets_reporter_created
       ON tickets (pelapor_user_id, dibuat_pada DESC)
       WHERE deleted_at IS NULL`,

    `CREATE INDEX IF NOT EXISTS idx_tickets_resolved_at
       ON tickets (resolved_at DESC)
       WHERE deleted_at IS NULL AND status_tiket IN ('Resolved', 'Closed')`,

    `CREATE INDEX IF NOT EXISTS idx_tickets_deleted_at
       ON tickets (deleted_at DESC)
       WHERE deleted_at IS NOT NULL`,

    `CREATE INDEX IF NOT EXISTS idx_user_ticket_queues_queue_user
       ON user_ticket_queues (queue_id, user_id)`,

    `CREATE UNIQUE INDEX IF NOT EXISTS uq_user_ticket_queues_primary_user
       ON user_ticket_queues (user_id)
       WHERE is_primary = TRUE`,

    `CREATE INDEX IF NOT EXISTS idx_log_riwayat_tiket_ticket_id
       ON log_riwayat_tiket (id_tiket, id DESC)`,

    `CREATE INDEX IF NOT EXISTS idx_komentar_tiket_ticket_id
       ON komentar_tiket (id_tiket, id ASC)`,

    `CREATE INDEX IF NOT EXISTS idx_ticket_casp_assignee_submitted
       ON ticket_casp_ratings (assignee_user_id, submitted_at DESC)`,

    `CREATE INDEX IF NOT EXISTS idx_ticket_casp_reporter_submitted
       ON ticket_casp_ratings (reporter_user_id, submitted_at DESC)`,
  ]

  for (const sql of INDEXES) {
    const name = sql.match(/(?:IF NOT EXISTS\s+)(\S+)/i)?.[1] ?? '???'
    try {
      await client.query(sql)
      console.log(`  + ${name}`)
    } catch (e) {
      if (/already exists/i.test(e.message)) {
        console.log(`  · ${name} sudah ada`)
      } else {
        throw e
      }
    }
  }

  await client.query('COMMIT')
  console.log('\n🎉 Indexes dan constraint berhasil dibuat')
} catch (error) {
  await client.query('ROLLBACK')
  console.error('\n❌ ROLLBACK:', error.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
