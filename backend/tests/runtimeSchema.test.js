import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getRequiredRuntimeColumns,
  getRuntimeSchemaContract,
  verifyRuntimeSchema,
} from '../src/config/runtimeSchema.js'

function rowsFromColumns(columns) {
  const contract = getRuntimeSchemaContract()
  return columns.map((entry) => {
    const separator = entry.indexOf('.')
    const table_name = entry.slice(0, separator)
    const column_name = entry.slice(separator + 1)
    const spec = contract[table_name]?.[column_name]
    return {
      table_name,
      column_name,
      udt_name: spec?.type ?? 'varchar',
      is_nullable: spec?.nullable ? 'YES' : 'NO',
    }
  })
}

test('runtime schema preflight hanya membaca metadata dan menerima schema lengkap', async () => {
  const calls = []
  const queryable = {
    async query(sql) {
      calls.push(sql)
      if (sql.includes('information_schema.columns')) {
        return { rows: rowsFromColumns(getRequiredRuntimeColumns()) }
      }
      if (sql.includes('pg_constraint')) {
        return {
          rows: [
            { table_name: 'aset_ti', constraint_name: 'fk_aset_ti_karyawan', is_valid: true },
            { table_name: 'aset_ti', constraint_name: 'fk_aset_ti_deleted_by', is_valid: true },
            { table_name: 'aset_ti', constraint_name: 'pk_aset_ti', is_valid: true },
            { table_name: 'aset_ti', constraint_name: 'chk_aset_ti_soft_delete_metadata', is_valid: true },
            { table_name: 'aset_ti', constraint_name: 'uq_aset_ti_label', is_valid: true },
            { table_name: 'aset_ti', constraint_name: 'uq_aset_ti_nomor_seri', is_valid: true },
            { table_name: 'komentar_tiket', constraint_name: 'chk_komentar_tiket_role', is_valid: true },
            { table_name: 'komentar_tiket', constraint_name: 'fk_komentar_tiket_ticket', is_valid: true },
            { table_name: 'komentar_tiket', constraint_name: 'pk_komentar_tiket', is_valid: true },
            { table_name: 'karyawan', constraint_name: 'fk_karyawan_atasan', is_valid: true },
            { table_name: 'karyawan', constraint_name: 'pk_karyawan', is_valid: true },
            { table_name: 'karyawan', constraint_name: 'uq_karyawan_nik', is_valid: true },
            { table_name: 'riwayat_pemakaian_aset', constraint_name: 'chk_riwayat_pemakaian_range', is_valid: true },
            { table_name: 'riwayat_pemakaian_aset', constraint_name: 'fk_riwayat_pemakaian_aset_aset', is_valid: true },
            { table_name: 'riwayat_pemakaian_aset', constraint_name: 'fk_riwayat_pemakaian_aset_karyawan', is_valid: true },
            { table_name: 'ticket_casp_ratings', constraint_name: 'chk_ticket_casp_different_actor', is_valid: true },
            { table_name: 'ticket_casp_ratings', constraint_name: 'chk_ticket_casp_rating', is_valid: true },
            { table_name: 'ticket_casp_ratings', constraint_name: 'fk_ticket_casp_assignee', is_valid: true },
            { table_name: 'ticket_casp_ratings', constraint_name: 'fk_ticket_casp_reporter', is_valid: true },
            { table_name: 'ticket_casp_ratings', constraint_name: 'fk_ticket_casp_ticket', is_valid: true },
            { table_name: 'ticket_casp_ratings', constraint_name: 'uq_ticket_casp_ratings_ticket', is_valid: true },
            { table_name: 'ticket_queues', constraint_name: 'pk_ticket_queues', is_valid: true },
            { table_name: 'ticket_queues', constraint_name: 'uq_ticket_queues_kode', is_valid: true },
            { table_name: 'tickets', constraint_name: 'chk_tickets_prioritas', is_valid: true },
            { table_name: 'tickets', constraint_name: 'chk_tickets_soft_delete_metadata', is_valid: true },
            { table_name: 'tickets', constraint_name: 'chk_tickets_status', is_valid: true },
            { table_name: 'tickets', constraint_name: 'fk_tickets_assignee', is_valid: true },
            { table_name: 'tickets', constraint_name: 'fk_tickets_deleted_by', is_valid: true },
            { table_name: 'tickets', constraint_name: 'fk_tickets_queue', is_valid: true },
            { table_name: 'tickets', constraint_name: 'fk_tickets_reporter', is_valid: true },
            { table_name: 'tickets', constraint_name: 'fk_tickets_resolver', is_valid: true },
            { table_name: 'tickets', constraint_name: 'pk_tickets', is_valid: true },
            { table_name: 'tickets', constraint_name: 'uq_tickets_nomor', is_valid: true },
            { table_name: 'user_ticket_queues', constraint_name: 'fk_user_ticket_queues_queue', is_valid: true },
            { table_name: 'user_ticket_queues', constraint_name: 'fk_user_ticket_queues_user', is_valid: true },
            { table_name: 'user_ticket_queues', constraint_name: 'pk_user_ticket_queues', is_valid: true },
            { table_name: 'users', constraint_name: 'chk_users_permissions_object', is_valid: true },
            { table_name: 'users', constraint_name: 'chk_users_role', is_valid: true },
            { table_name: 'users', constraint_name: 'chk_users_soft_delete_metadata', is_valid: true },
            { table_name: 'users', constraint_name: 'fk_users_deleted_by', is_valid: true },
            { table_name: 'users', constraint_name: 'pk_users', is_valid: true },
          ],
        }
      }
      if (sql.includes('pg_indexes')) {
        return {
          rows: [
            { indexname: 'idx_aset_ti_active_listing' },
            { indexname: 'idx_aset_ti_deleted_at' },
            { indexname: 'idx_aset_ti_karyawan' },
            { indexname: 'idx_komentar_tiket_ticket_id' },
            { indexname: 'idx_log_audit_login_created' },
            { indexname: 'idx_log_riwayat_aset_asset_created' },
            { indexname: 'idx_log_riwayat_tiket_ticket_id' },
            { indexname: 'idx_riwayat_pemakaian_asset_started' },
            { indexname: 'idx_riwayat_pemakaian_nik_started' },
            { indexname: 'idx_ticket_casp_assignee_submitted' },
            { indexname: 'idx_ticket_casp_reporter_submitted' },
            { indexname: 'idx_tickets_assigned_status' },
            { indexname: 'idx_tickets_deleted_at' },
            { indexname: 'idx_tickets_queue_status_created' },
            { indexname: 'idx_tickets_reporter_created' },
            { indexname: 'idx_tickets_resolved_at' },
            { indexname: 'idx_user_ticket_queues_queue_user' },
            { indexname: 'idx_users_active_role' },
            { indexname: 'idx_users_deleted_at' },
            { indexname: 'uq_karyawan_email_normalized' },
            { indexname: 'uq_riwayat_pemakaian_active_asset' },
            { indexname: 'uq_user_ticket_queues_primary_user' },
            { indexname: 'uq_users_email_normalized' },
          ],
        }
      }
      if (sql.includes('pg_trigger')) {
        return {
          rows: [
            { table_name: 'users', trigger_name: 'trg_users_prevent_hard_delete', enabled: 'O', definition: 'BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION app_reject_hard_delete()' },
            { table_name: 'aset_ti', trigger_name: 'trg_aset_ti_prevent_hard_delete', enabled: 'O', definition: 'BEFORE DELETE ON aset_ti FOR EACH ROW EXECUTE FUNCTION app_reject_hard_delete()' },
            { table_name: 'tickets', trigger_name: 'trg_tickets_prevent_hard_delete', enabled: 'O', definition: 'BEFORE DELETE ON tickets FOR EACH ROW EXECUTE FUNCTION app_reject_hard_delete()' },
          ],
        }
      }
      if (sql.includes('pg_class')) {
        return {
          rows: [
            { relation_name: 'app_schema_migrations', relation_kind: 'r' },
            { relation_name: 'aset_ti', relation_kind: 'r' },
            { relation_name: 'komentar_tiket', relation_kind: 'r' },
            { relation_name: 'daftar_aset_ti_lengkap', relation_kind: 'v' },
            { relation_name: 'karyawan', relation_kind: 'r' },
            { relation_name: 'log_audit_login', relation_kind: 'r' },
            { relation_name: 'log_riwayat_aset', relation_kind: 'r' },
            { relation_name: 'log_riwayat_tiket', relation_kind: 'r' },
            { relation_name: 'riwayat_pemakaian_aset', relation_kind: 'r' },
            { relation_name: 'ticket_casp_ratings', relation_kind: 'r' },
            { relation_name: 'ticket_queues', relation_kind: 'r' },
            { relation_name: 'ticket_queues', relation_kind: 'r' },
            { relation_name: 'tickets', relation_kind: 'r' },
            { relation_name: 'user_ticket_queues', relation_kind: 'r' },
            { relation_name: 'users', relation_kind: 'r' },
          ],
        }
      }
      if (sql.includes('pg_constraint')) {
        return {
          rows: [
            { table_name: 'aset_ti', constraint_name: 'fk_aset_ti_karyawan', is_valid: true },
            { table_name: 'aset_ti', constraint_name: 'fk_aset_ti_deleted_by', is_valid: true },
            { table_name: 'aset_ti', constraint_name: 'pk_aset_ti', is_valid: true },
            { table_name: 'aset_ti', constraint_name: 'chk_aset_ti_soft_delete_metadata', is_valid: true },
            { table_name: 'aset_ti', constraint_name: 'uq_aset_ti_label', is_valid: true },
            { table_name: 'aset_ti', constraint_name: 'uq_aset_ti_nomor_seri', is_valid: true },
            { table_name: 'komentar_tiket', constraint_name: 'chk_komentar_tiket_role', is_valid: true },
            { table_name: 'komentar_tiket', constraint_name: 'fk_komentar_tiket_ticket', is_valid: true },
            { table_name: 'komentar_tiket', constraint_name: 'pk_komentar_tiket', is_valid: true },
            { table_name: 'karyawan', constraint_name: 'fk_karyawan_atasan', is_valid: true },
            { table_name: 'karyawan', constraint_name: 'pk_karyawan', is_valid: true },
            { table_name: 'karyawan', constraint_name: 'uq_karyawan_nik', is_valid: true },
            { table_name: 'riwayat_pemakaian_aset', constraint_name: 'chk_riwayat_pemakaian_range', is_valid: true },
            { table_name: 'riwayat_pemakaian_aset', constraint_name: 'fk_riwayat_pemakaian_aset_aset', is_valid: true },
            { table_name: 'riwayat_pemakaian_aset', constraint_name: 'fk_riwayat_pemakaian_aset_karyawan', is_valid: true },
            { table_name: 'ticket_casp_ratings', constraint_name: 'chk_ticket_casp_different_actor', is_valid: true },
            { table_name: 'ticket_casp_ratings', constraint_name: 'chk_ticket_casp_rating', is_valid: true },
            { table_name: 'ticket_casp_ratings', constraint_name: 'fk_ticket_casp_assignee', is_valid: true },
            { table_name: 'ticket_casp_ratings', constraint_name: 'fk_ticket_casp_reporter', is_valid: true },
            { table_name: 'ticket_casp_ratings', constraint_name: 'fk_ticket_casp_ticket', is_valid: true },
            { table_name: 'ticket_casp_ratings', constraint_name: 'uq_ticket_casp_ratings_ticket', is_valid: true },
            { table_name: 'ticket_queues', constraint_name: 'pk_ticket_queues', is_valid: true },
            { table_name: 'ticket_queues', constraint_name: 'uq_ticket_queues_kode', is_valid: true },
            { table_name: 'tickets', constraint_name: 'chk_tickets_prioritas', is_valid: true },
            { table_name: 'tickets', constraint_name: 'chk_tickets_soft_delete_metadata', is_valid: true },
            { table_name: 'tickets', constraint_name: 'chk_tickets_status', is_valid: true },
            { table_name: 'tickets', constraint_name: 'fk_tickets_assignee', is_valid: true },
            { table_name: 'tickets', constraint_name: 'fk_tickets_deleted_by', is_valid: true },
            { table_name: 'tickets', constraint_name: 'fk_tickets_queue', is_valid: true },
            { table_name: 'tickets', constraint_name: 'fk_tickets_reporter', is_valid: true },
            { table_name: 'tickets', constraint_name: 'fk_tickets_resolver', is_valid: true },
            { table_name: 'tickets', constraint_name: 'pk_tickets', is_valid: true },
            { table_name: 'tickets', constraint_name: 'uq_tickets_nomor', is_valid: true },
            { table_name: 'user_ticket_queues', constraint_name: 'fk_user_ticket_queues_queue', is_valid: true },
            { table_name: 'user_ticket_queues', constraint_name: 'fk_user_ticket_queues_user', is_valid: true },
            { table_name: 'user_ticket_queues', constraint_name: 'pk_user_ticket_queues', is_valid: true },
            { table_name: 'users', constraint_name: 'chk_users_permissions_object', is_valid: true },
            { table_name: 'users', constraint_name: 'chk_users_role', is_valid: true },
            { table_name: 'users', constraint_name: 'chk_users_soft_delete_metadata', is_valid: true },
            { table_name: 'users', constraint_name: 'fk_users_deleted_by', is_valid: true },
            { table_name: 'users', constraint_name: 'pk_users', is_valid: true },
          ],
        }
      }
      if (sql.includes('pg_indexes')) {
        return {
          rows: [
            { indexname: 'idx_aset_ti_active_listing' },
            { indexname: 'idx_aset_ti_deleted_at' },
            { indexname: 'idx_aset_ti_karyawan' },
            { indexname: 'idx_komentar_tiket_ticket_id' },
            { indexname: 'idx_log_audit_login_created' },
            { indexname: 'idx_log_riwayat_aset_asset_created' },
            { indexname: 'idx_log_riwayat_tiket_ticket_id' },
            { indexname: 'idx_riwayat_pemakaian_asset_started' },
            { indexname: 'idx_riwayat_pemakaian_nik_started' },
            { indexname: 'idx_ticket_casp_assignee_submitted' },
            { indexname: 'idx_ticket_casp_reporter_submitted' },
            { indexname: 'idx_tickets_assigned_status' },
            { indexname: 'idx_tickets_deleted_at' },
            { indexname: 'idx_tickets_queue_status_created' },
            { indexname: 'idx_tickets_reporter_created' },
            { indexname: 'idx_tickets_resolved_at' },
            { indexname: 'idx_user_ticket_queues_queue_user' },
            { indexname: 'idx_users_active_role' },
            { indexname: 'idx_users_deleted_at' },
            { indexname: 'uq_karyawan_email_normalized' },
            { indexname: 'uq_riwayat_pemakaian_active_asset' },
            { indexname: 'uq_user_ticket_queues_primary_user' },
            { indexname: 'uq_users_email_normalized' },
          ],
        }
      }
      if (sql.includes('pg_trigger')) {
        return {
          rows: [
            { table_name: 'users', trigger_name: 'trg_users_prevent_hard_delete', enabled: 'O', definition: 'BEFORE DELETE ... app_reject_hard_delete' },
            { table_name: 'aset_ti', trigger_name: 'trg_aset_ti_prevent_hard_delete', enabled: 'O', definition: 'BEFORE DELETE ... app_reject_hard_delete' },
            { table_name: 'tickets', trigger_name: 'trg_tickets_prevent_hard_delete', enabled: 'O', definition: 'BEFORE DELETE ... app_reject_hard_delete' },
          ],
        }
      }
      if (sql.includes('app_schema_migrations')) {
        return { rows: [{ version: 1 }] }
      }
      if (sql.includes('pg_roles')) {
        return { rowCount: 1, rows: [{ database_name: 'db', database_user: 'user', is_superuser: false, is_replica: false, transaction_read_only: false }] }
      }
      return { rows: [] }
    },
  }

  await verifyRuntimeSchema(queryable)

  assert.ok(calls.length >= 1)
  assert.match(calls[0], /SELECT\s+table_name,\s+column_name/i)
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
