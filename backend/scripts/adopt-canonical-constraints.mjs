// One-shot adoption: align an existing (legacy-named) schema with the canonical
// constraint/index/trigger names expected by runtimeSchema.js. Dynamically
// discovers the current constraint names so it works after any reseed.
import { pool } from '../src/config/database.js'

const client = await pool.connect()

// Map: (table, constraintType, canonicalName) → list of candidate old names
// Old names discovered from default Postgres naming and previous schema versions.
const RENAMES = [
  // PKs
  ['aset_ti', 'pk_aset_ti', 'aset_ti_pkey'],
  ['karyawan', 'pk_karyawan', 'karyawan_pkey'],
  ['users', 'pk_users', 'users_pkey'],
  ['tickets', 'pk_tickets', 'tickets_pkey'],
  ['ticket_queues', 'pk_ticket_queues', 'ticket_queues_pkey'],
  ['user_ticket_queues', 'pk_user_ticket_queues', 'user_ticket_queues_pkey'],
  ['komentar_tiket', 'pk_komentar_tiket', 'komentar_tiket_pkey'],
  ['ticket_casp_ratings', 'pk_ticket_casp_ratings', 'ticket_casp_ratings_pkey'],
  ['log_riwayat_tiket', 'pk_log_riwayat_tiket', 'log_riwayat_tiket_pkey'],
  ['log_riwayat_aset', 'pk_log_riwayat_aset', 'log_riwayat_aset_pkey'],
  ['log_audit_login', 'pk_log_audit_login', 'log_audit_login_pkey'],
  ['riwayat_pemakaian_aset', 'pk_riwayat_pemakaian_aset', 'riwayat_pemakaian_aset_pkey'],
  // UNIQUE
  ['aset_ti', 'uq_aset_ti_nomor_seri', 'aset_ti_nomor_seri_key'],
  ['aset_ti', 'uq_aset_ti_label', 'aset_ti_label_aset_key'],
  ['karyawan', 'uq_karyawan_nik', 'karyawan_nik_key'],
  ['tickets', 'uq_tickets_nomor', 'tickets_nomor_tiket_key'],
  ['ticket_queues', 'uq_ticket_queues_kode', 'ticket_queues_kode_key'],
  ['ticket_casp_ratings', 'uq_ticket_casp_ratings_ticket', 'ticket_casp_ratings_ticket_id_key'],
  // FKs (all known legacy name variants per table/column)
  ['aset_ti', 'fk_aset_ti_karyawan', ['fk_aset_karyawan', 'aset_ti_id_karyawan_fkey']],
  ['aset_ti', 'fk_aset_ti_deleted_by', ['fk_aset_ti_deleted_by', 'aset_ti_deleted_by_user_id_fkey']],
  ['karyawan', 'fk_karyawan_atasan', ['fk_atasan_langsung', 'karyawan_id_atasan_langsung_fkey']],
  ['tickets', 'fk_tickets_queue', ['fk_ticket_queue', 'tickets_queue_id_fkey']],
  ['tickets', 'fk_tickets_reporter', ['fk_ticket_pelapor_user', 'tickets_pelapor_user_id_fkey']],
  ['tickets', 'fk_tickets_assignee', ['fk_ticket_assigned_user', 'tickets_assigned_to_user_id_fkey']],
  ['tickets', 'fk_tickets_resolver', ['fk_ticket_resolved_user', 'tickets_resolved_by_user_id_fkey']],
  ['tickets', 'fk_tickets_deleted_by', ['fk_tickets_deleted_by', 'tickets_deleted_by_user_id_fkey']],
  ['riwayat_pemakaian_aset', 'fk_riwayat_pemakaian_aset_aset', ['fk_riwayat_aset', 'riwayat_pemakaian_aset_id_aset_fkey']],
  ['riwayat_pemakaian_aset', 'fk_riwayat_pemakaian_aset_karyawan', ['fk_riwayat_karyawan', 'riwayat_pemakaian_aset_id_karyawan_fkey']],
  ['ticket_casp_ratings', 'fk_ticket_casp_ticket', ['fk_casp_ticket', 'ticket_casp_ratings_ticket_id_fkey']],
  ['ticket_casp_ratings', 'fk_ticket_casp_reporter', ['fk_casp_reporter', 'ticket_casp_ratings_reporter_user_id_fkey']],
  ['ticket_casp_ratings', 'fk_ticket_casp_assignee', ['fk_casp_assignee', 'ticket_casp_ratings_assignee_user_id_fkey']],
  ['user_ticket_queues', 'fk_user_ticket_queues_user', ['fk_utq_user', 'user_ticket_queues_user_id_fkey']],
  ['user_ticket_queues', 'fk_user_ticket_queues_queue', ['fk_utq_queue', 'user_ticket_queues_queue_id_fkey']],
  ['komentar_tiket', 'fk_komentar_tiket_ticket', ['komentar_tiket_id_tiket_fkey']],
  ['users', 'fk_users_deleted_by', ['users_deleted_by_user_id_fkey']],
]

// Constraint that must be ADDED (not renamed) if missing
const ADDS = [
  // CHECK
  [`ALTER TABLE komentar_tiket ADD CONSTRAINT chk_komentar_tiket_role CHECK (LOWER(BTRIM(role_pengguna)) IN ('user', 'admin', 'superadmin'))`, 'komentar_tiket.chk_komentar_tiket_role'],
  [`ALTER TABLE riwayat_pemakaian_aset ADD CONSTRAINT chk_riwayat_pemakaian_range CHECK (tanggal_selesai IS NULL OR tanggal_selesai >= tanggal_mulai)`, 'riwayat_pemakaian_aset.chk_riwayat_pemakaian_range'],
  [`ALTER TABLE ticket_casp_ratings ADD CONSTRAINT chk_ticket_casp_rating CHECK (rating BETWEEN 1 AND 5)`, 'ticket_casp_ratings.chk_ticket_casp_rating'],
  [`ALTER TABLE ticket_casp_ratings ADD CONSTRAINT chk_ticket_casp_different_actor CHECK (reporter_user_id IS NULL OR assignee_user_id IS NULL OR reporter_user_id <> assignee_user_id)`, 'ticket_casp_ratings.chk_ticket_casp_different_actor'],
  [`ALTER TABLE tickets ADD CONSTRAINT chk_tickets_prioritas CHECK (prioritas IN ('Urgent (4h)', 'High (1day)', 'Medium (3d)', 'Low (7d)'))`, 'tickets.chk_tickets_prioritas'],
  [`ALTER TABLE tickets ADD CONSTRAINT chk_tickets_status CHECK (status_tiket IN ('Open', 'In Progress', 'Pending', 'Resolved', 'Closed', 'Cancelled'))`, 'tickets.chk_tickets_status'],
  [`ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (LOWER(BTRIM(role)) IN ('user', 'admin', 'superadmin', 'super admin'))`, 'users.chk_users_role'],
  [`ALTER TABLE users ADD CONSTRAINT chk_users_permissions_object CHECK (jsonb_typeof(permissions) = 'object')`, 'users.chk_users_permissions_object'],
  // soft-delete CHECK (may already exist)
  [`ALTER TABLE aset_ti ADD CONSTRAINT chk_aset_ti_soft_delete_metadata CHECK ((deleted_at IS NULL AND deleted_by_user_id IS NULL AND deletion_reason IS NULL) OR (deleted_at IS NOT NULL AND BTRIM(COALESCE(deletion_reason, '')) <> ''))`, 'aset_ti.chk_aset_ti_soft_delete_metadata'],
  [`ALTER TABLE tickets ADD CONSTRAINT chk_tickets_soft_delete_metadata CHECK ((deleted_at IS NULL AND deleted_by_user_id IS NULL AND deletion_reason IS NULL) OR (deleted_at IS NOT NULL AND BTRIM(COALESCE(deletion_reason, '')) <> ''))`, 'tickets.chk_tickets_soft_delete_metadata'],
  [`ALTER TABLE users ADD CONSTRAINT chk_users_soft_delete_metadata CHECK ((deleted_at IS NULL AND deleted_by_user_id IS NULL AND deletion_reason IS NULL) OR (deleted_at IS NOT NULL AND is_active = FALSE AND BTRIM(COALESCE(deletion_reason, '')) <> ''))`, 'users.chk_users_soft_delete_metadata'],
  // FK that may not exist under any name
  [`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_aset_ti_deleted_by' AND connamespace='public'::regnamespace) THEN ALTER TABLE aset_ti ADD CONSTRAINT fk_aset_ti_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT; END IF; END $$`, 'aset_ti.fk_aset_ti_deleted_by'],
  [`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_tickets_deleted_by' AND connamespace='public'::regnamespace) THEN ALTER TABLE tickets ADD CONSTRAINT fk_tickets_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT; END IF; END $$`, 'tickets.fk_tickets_deleted_by'],
  [`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_users_deleted_by' AND connamespace='public'::regnamespace) THEN ALTER TABLE users ADD CONSTRAINT fk_users_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT; END IF; END $$`, 'users.fk_users_deleted_by'],
]

try {
  await client.query('BEGIN')

  // Build set of existing constraint names for existence checks
  const existingRes = await client.query("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace")
  const existing = new Set(existingRes.rows.map(r => r.conname))

  const renameIfExists = async (table, canonicalName, oldNames) => {
    const candidates = Array.isArray(oldNames) ? oldNames : [oldNames]
    if (existing.has(canonicalName)) { console.log(`  · ${table}.${canonicalName} sudah ada`); return }
    for (const oldName of candidates) {
      if (existing.has(oldName)) {
        await client.query(`ALTER TABLE ${table} RENAME CONSTRAINT ${oldName} TO ${canonicalName}`)
        existing.delete(oldName)
        existing.add(canonicalName)
        console.log(`  ↻ ${table}: ${oldName} → ${canonicalName}`)
        return
      }
    }
    console.log(`  ⚠ ${table}.${canonicalName}: tidak ditemukan (skip rename)`)
  }

  console.log('1) RENAME constraints ke nama kanonik')
  for (const [table, canonical, oldNames] of RENAMES) {
    await renameIfExists(table, canonical, oldNames)
  }

  console.log('\n2) ADD missing CHECK / FK constraints')
  for (const [sql, label] of ADDS) {
    if (existing.has(label.split('.').slice(-1)[0])) { console.log(`  · ${label} sudah ada`); continue }
    try {
      await client.query(sql)
      console.log(`  + ${label}`)
    } catch(e) {
      if (/already exists/i.test(e.message)) console.log(`  · ${label} sudah ada`)
      else throw e
    }
  }

  console.log('\n3) ADD missing triggers (hard-delete protection)')
  await client.query(`CREATE OR REPLACE FUNCTION app_reject_hard_delete() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Hard delete is prohibited for %. Use the audited soft-delete path.', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation'; END; $$`)
  for (const tbl of ['users', 'aset_ti', 'tickets']) {
    const trgName = `trg_${tbl}_prevent_hard_delete`
    await client.query(`DROP TRIGGER IF EXISTS ${trgName} ON ${tbl}`)
    await client.query(`CREATE TRIGGER ${trgName} BEFORE DELETE ON ${tbl} FOR EACH ROW EXECUTE FUNCTION app_reject_hard_delete()`)
    console.log(`  + trigger ${trgName}`)
  }

  await client.query('COMMIT')
  console.log('\n🎉 Adoption sukses di-commit')
} catch (error) {
  await client.query('ROLLBACK')
  console.error('\n❌ ROLLBACK:', error.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
