// One-shot adoption: align an existing (legacy-named) schema with the canonical
// constraint/index/trigger names expected by runtimeSchema.js. All renames and
// additions run in a single transaction; rollback on any error. Data is untouched.
import { pool } from '../src/config/database.js'

const client = await pool.connect()
try {
  await client.query('BEGIN')

  const renameConstraint = async (table, oldName, newName, type) => {
    try {
      await client.query(`ALTER TABLE ${table} RENAME CONSTRAINT ${oldName} TO ${newName}`)
      console.log(`  ↻ ${table}: ${type} ${oldName} → ${newName}`)
    } catch (e) {
      // Constraint mungkin sudah punya nama kanonik (sudah pernah di-rename)
      if (/does not exist/i.test(e.message)) {
        console.log(`  · ${table}: ${newName} sudah ada, skip`)
      } else {
        throw e
      }
    }
  }

  const addConstraint = async (sql, label) => {
    try {
      await client.query(sql)
      console.log(`  + ${label}`)
    } catch (e) {
      if (/already exists/i.test(e.message)) {
        console.log(`  · ${label} sudah ada, skip`)
      } else {
        throw e
      }
    }
  }

  console.log('1) RENAME PK constraints ke nama kanonik')
  await renameConstraint('aset_ti', 'aset_ti_pkey', 'pk_aset_ti', 'PK')
  await renameConstraint('karyawan', 'karyawan_pkey', 'pk_karyawan', 'PK')
  await renameConstraint('users', 'users_pkey', 'pk_users', 'PK')
  await renameConstraint('tickets', 'tickets_pkey', 'pk_tickets', 'PK')
  await renameConstraint('ticket_queues', 'ticket_queues_pkey', 'pk_ticket_queues', 'PK')
  await renameConstraint('user_ticket_queues', 'user_ticket_queues_pkey', 'pk_user_ticket_queues', 'PK')
  await renameConstraint('komentar_tiket', 'komentar_tiket_pkey', 'pk_komentar_tiket', 'PK')
  await renameConstraint('ticket_casp_ratings', 'ticket_casp_ratings_pkey', 'pk_ticket_casp_ratings', 'PK')
  await renameConstraint('log_riwayat_tiket', 'log_riwayat_tiket_pkey', 'pk_log_riwayat_tiket', 'PK')
  await renameConstraint('log_riwayat_aset', 'log_riwayat_aset_pkey', 'pk_log_riwayat_aset', 'PK')
  await renameConstraint('log_audit_login', 'log_audit_login_pkey', 'pk_log_audit_login', 'PK')
  await renameConstraint('riwayat_pemakaian_aset', 'riwayat_pemakaian_aset_pkey', 'pk_riwayat_pemakaian_aset', 'PK')

  console.log('\n2) RENAME UNIQUE constraints ke nama kanonik')
  await renameConstraint('aset_ti', 'aset_ti_nomor_seri_key', 'uq_aset_ti_nomor_seri', 'UQ')
  await renameConstraint('aset_ti', 'aset_ti_label_aset_key', 'uq_aset_ti_label', 'UQ')
  await renameConstraint('karyawan', 'karyawan_nik_key', 'uq_karyawan_nik', 'UQ')
  await renameConstraint('tickets', 'tickets_nomor_tiket_key', 'uq_tickets_nomor', 'UQ')
  await renameConstraint('ticket_queues', 'ticket_queues_kode_key', 'uq_ticket_queues_kode', 'UQ')
  await renameConstraint('ticket_casp_ratings', 'ticket_casp_ratings_ticket_id_key', 'uq_ticket_casp_ratings_ticket', 'UQ')

  console.log('\n3) RENAME FK constraints ke nama kanonik')
  await renameConstraint('aset_ti', 'fk_aset_karyawan', 'fk_aset_ti_karyawan', 'FK')
  await renameConstraint('karyawan', 'fk_atasan_langsung', 'fk_karyawan_atasan', 'FK')
  await renameConstraint('tickets', 'fk_ticket_queue', 'fk_tickets_queue', 'FK')
  await renameConstraint('tickets', 'fk_ticket_pelapor_user', 'fk_tickets_reporter', 'FK')
  await renameConstraint('tickets', 'fk_ticket_assigned_user', 'fk_tickets_assignee', 'FK')
  await renameConstraint('tickets', 'fk_ticket_resolved_user', 'fk_tickets_resolver', 'FK')
  await renameConstraint('riwayat_pemakaian_aset', 'fk_riwayat_aset', 'fk_riwayat_pemakaian_aset_aset', 'FK')
  await renameConstraint('riwayat_pemakaian_aset', 'fk_riwayat_karyawan', 'fk_riwayat_pemakaian_aset_karyawan', 'FK')
  await renameConstraint('ticket_casp_ratings', 'fk_casp_ticket', 'fk_ticket_casp_ticket', 'FK')
  await renameConstraint('ticket_casp_ratings', 'fk_casp_reporter', 'fk_ticket_casp_reporter', 'FK')
  await renameConstraint('ticket_casp_ratings', 'fk_casp_assignee', 'fk_ticket_casp_assignee', 'FK')
  await renameConstraint('user_ticket_queues', 'fk_utq_user', 'fk_user_ticket_queues_user', 'FK')
  await renameConstraint('user_ticket_queues', 'fk_utq_queue', 'fk_user_ticket_queues_queue', 'FK')

  console.log('\n4) ADD missing CHECK constraints')
  // BACKFILL: normalisasi role legacy di komentar_tiket sebelum pasang CHECK.
  // Kebijakan: hanya 3 role kanonik (superadmin, admin, user).
  const b1 = await client.query(
    `UPDATE komentar_tiket SET role_pengguna = 'superadmin'
     WHERE LOWER(BTRIM(role_pengguna)) = 'super admin'`,
  )
  const b2 = await client.query(
    `UPDATE komentar_tiket SET role_pengguna = 'user'
     WHERE role_pengguna IS NOT NULL
       AND LOWER(BTRIM(role_pengguna)) NOT IN ('user', 'admin', 'superadmin', 'super admin')`,
  )
  console.log(`  ↻ 'super admin' → 'superadmin': ${b1.rowCount} baris`)
  console.log(`  ↻ role lain (teknisi, dll) → 'user': ${b2.rowCount} baris`)

  await addConstraint(
    `ALTER TABLE komentar_tiket ADD CONSTRAINT chk_komentar_tiket_role
     CHECK (LOWER(BTRIM(role_pengguna)) IN ('user', 'admin', 'superadmin'))`,
    'komentar_tiket.chk_komentar_tiket_role',
  )
  await addConstraint(
    `ALTER TABLE riwayat_pemakaian_aset ADD CONSTRAINT chk_riwayat_pemakaian_range
     CHECK (tanggal_selesai IS NULL OR tanggal_selesai >= tanggal_mulai)`,
    'riwayat_pemakaian_aset.chk_riwayat_pemakaian_range',
  )
  await addConstraint(
    `ALTER TABLE ticket_casp_ratings ADD CONSTRAINT chk_ticket_casp_rating
     CHECK (rating BETWEEN 1 AND 5)`,
    'ticket_casp_ratings.chk_ticket_casp_rating',
  )
  await addConstraint(
    `ALTER TABLE ticket_casp_ratings ADD CONSTRAINT chk_ticket_casp_different_actor
     CHECK (
       reporter_user_id IS NULL
       OR assignee_user_id IS NULL
       OR reporter_user_id <> assignee_user_id
     )`,
    'ticket_casp_ratings.chk_ticket_casp_different_actor',
  )
  await addConstraint(
    `ALTER TABLE tickets ADD CONSTRAINT chk_tickets_prioritas
     CHECK (prioritas IN ('Urgent (4h)', 'High (1day)', 'Medium (3d)', 'Low (7d)'))`,
    'tickets.chk_tickets_prioritas',
  )
  await addConstraint(
    `ALTER TABLE tickets ADD CONSTRAINT chk_tickets_status
     CHECK (status_tiket IN ('Open', 'In Progress', 'Pending', 'Resolved', 'Closed', 'Cancelled'))`,
    'tickets.chk_tickets_status',
  )
  await addConstraint(
    `ALTER TABLE users ADD CONSTRAINT chk_users_role
     CHECK (LOWER(BTRIM(role)) IN ('user', 'admin', 'superadmin', 'super admin'))`,
    'users.chk_users_role',
  )
  await addConstraint(
    `ALTER TABLE users ADD CONSTRAINT chk_users_permissions_object
     CHECK (jsonb_typeof(permissions) = 'object')`,
    'users.chk_users_permissions_object',
  )

  console.log('\n5) ADD missing FK constraints')
  await addConstraint(
    `ALTER TABLE komentar_tiket ADD CONSTRAINT fk_komentar_tiket_ticket
     FOREIGN KEY (id_tiket) REFERENCES tickets (id) ON DELETE CASCADE`,
    'komentar_tiket.fk_komentar_tiket_ticket',
  )

  console.log('\n6) ADD missing triggers (hard-delete protection)')
  // Function: CREATE OR REPLACE is idempotent
  await addConstraint(
    `CREATE OR REPLACE FUNCTION app_reject_hard_delete()
     RETURNS TRIGGER LANGUAGE plpgsql AS $$
     BEGIN
       RAISE EXCEPTION 'Hard delete is prohibited for %. Use the audited soft-delete path.', TG_TABLE_NAME
         USING ERRCODE = 'integrity_constraint_violation';
     END; $$`,
    'function app_reject_hard_delete()',
  )
  // Triggers: DROP IF EXISTS + CREATE untuk idempotensi (CREATE TRIGGER tidak punya IF NOT EXISTS)
  for (const tbl of ['users', 'aset_ti', 'tickets']) {
    const trgName = `trg_${tbl}_prevent_hard_delete`
    await client.query(`DROP TRIGGER IF EXISTS ${trgName} ON ${tbl}`)
    await client.query(`CREATE TRIGGER ${trgName}
      BEFORE DELETE ON ${tbl} FOR EACH ROW EXECUTE FUNCTION app_reject_hard_delete()`)
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
