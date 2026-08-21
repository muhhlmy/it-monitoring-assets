import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TABLE_SCHEMAS, validateExportMetadata } from '../src/controllers/exportController.js'

describe('Export Metadata Schema Validation Tests', () => {
  it('ticket_casp_ratings export schema contains required PostgreSQL columns', () => {
    const caspSchema = TABLE_SCHEMAS.ticket_casp_ratings
    assert.ok(caspSchema, 'ticket_casp_ratings schema harus ada')
    assert.equal(caspSchema.tableName, 'ticket_casp_ratings')
    assert.equal(caspSchema.dateField, 'submitted_at')
    assert.equal(caspSchema.orderField, 'id')

    const colNames = caspSchema.columns.map((c) => c.name)
    assert.ok(colNames.includes('id'), 'Harus menyertakan kolom id')
    assert.ok(colNames.includes('id_tiket'), 'Harus menyertakan kolom id_tiket (bukan ticket_id)')
    assert.ok(colNames.includes('reporter_user_id'), 'Harus menyertakan kolom reporter_user_id')
    assert.ok(colNames.includes('reporter_name'), 'Harus menyertakan kolom reporter_name')
    assert.ok(colNames.includes('assignee_user_id'), 'Harus menyertakan kolom assignee_user_id')
    assert.ok(colNames.includes('assignee_name'), 'Harus menyertakan kolom assignee_name')
    assert.ok(colNames.includes('rating_score'), 'Harus menyertakan kolom rating_score (bukan rating)')
    assert.ok(colNames.includes('feedback'), 'Harus menyertakan kolom feedback')
    assert.ok(colNames.includes('submitted_at'), 'Harus menyertakan kolom submitted_at')
  })

  it('validateExportMetadata succeeds with valid mock information_schema', async () => {
    const mockDb = {
      async query(sql) {
        if (sql.includes('information_schema.tables')) {
          return {
            rows: [
              { table_name: 'aset_ti' },
              { table_name: 'aset_ga' },
              { table_name: 'aset_ops' },
              { table_name: 'karyawan' },
              { table_name: 'tickets' },
              { table_name: 'users' },
              { table_name: 'log_riwayat_aset' },
              { table_name: 'log_audit_login' },
              { table_name: 'riwayat_pemakaian_aset' },
              { table_name: 'ticket_casp_ratings' },
            ]
          }
        }
        if (sql.includes('information_schema.columns')) {
          return {
            rows: [
              // aset_ti
              { table_name: 'aset_ti', column_name: 'id' },
              { table_name: 'aset_ti', column_name: 'hostname' },
              { table_name: 'aset_ti', column_name: 'serial_number' },
              { table_name: 'aset_ti', column_name: 'nik_pemegang_asset' },
              { table_name: 'aset_ti', column_name: 'nama_karyawan_pemegang_asset' },
              { table_name: 'aset_ti', column_name: 'departemen_pemegang_asset' },
              { table_name: 'aset_ti', column_name: 'lokasi_asset' },
              { table_name: 'aset_ti', column_name: 'tipe_perangkat' },
              { table_name: 'aset_ti', column_name: 'brand_merek' },
              { table_name: 'aset_ti', column_name: 'model' },
              { table_name: 'aset_ti', column_name: 'spesifikasi' },
              { table_name: 'aset_ti', column_name: 'status' },
              { table_name: 'aset_ti', column_name: 'kondisi' },
              { table_name: 'aset_ti', column_name: 'note_asset' },
              { table_name: 'aset_ti', column_name: 'created_at' },
              { table_name: 'aset_ti', column_name: 'updated_at' },
              // aset_ga
              { table_name: 'aset_ga', column_name: 'id' },
              { table_name: 'aset_ga', column_name: 'hostname' },
              { table_name: 'aset_ga', column_name: 'quantity' },
              { table_name: 'aset_ga', column_name: 'tipe_fasilitas' },
              { table_name: 'aset_ga', column_name: 'nama_asset' },
              { table_name: 'aset_ga', column_name: 'ukuran' },
              { table_name: 'aset_ga', column_name: 'detail' },
              { table_name: 'aset_ga', column_name: 'lokasi' },
              { table_name: 'aset_ga', column_name: 'lokasi_detail' },
              { table_name: 'aset_ga', column_name: 'kondisi' },
              { table_name: 'aset_ga', column_name: 'created_at' },
              { table_name: 'aset_ga', column_name: 'updated_at' },
              // aset_ops
              { table_name: 'aset_ops', column_name: 'id' },
              { table_name: 'aset_ops', column_name: 'hostname' },
              { table_name: 'aset_ops', column_name: 'nama_asset' },
              { table_name: 'aset_ops', column_name: 'kategori' },
              { table_name: 'aset_ops', column_name: 'lokasi' },
              { table_name: 'aset_ops', column_name: 'pic' },
              { table_name: 'aset_ops', column_name: 'tanggal_beli' },
              { table_name: 'aset_ops', column_name: 'total_asset_amount' },
              { table_name: 'aset_ops', column_name: 'kondisi' },
              { table_name: 'aset_ops', column_name: 'status' },
              { table_name: 'aset_ops', column_name: 'created_at' },
              { table_name: 'aset_ops', column_name: 'updated_at' },
              // karyawan
              { table_name: 'karyawan', column_name: 'id' },
              { table_name: 'karyawan', column_name: 'nik' },
              { table_name: 'karyawan', column_name: 'nama_karyawan' },
              { table_name: 'karyawan', column_name: 'email_kantor' },
              { table_name: 'karyawan', column_name: 'title' },
              { table_name: 'karyawan', column_name: 'job_level' },
              { table_name: 'karyawan', column_name: 'departemen' },
              { table_name: 'karyawan', column_name: 'directorate' },
              { table_name: 'karyawan', column_name: 'lokasi_kerja' },
              { table_name: 'karyawan', column_name: 'status' },
              { table_name: 'karyawan', column_name: 'employeement_status' },
              { table_name: 'karyawan', column_name: 'tanggal_mulai_bekerja' },
              { table_name: 'karyawan', column_name: 'nik_atasan_langsung' },
              { table_name: 'karyawan', column_name: 'created_at' },
              { table_name: 'karyawan', column_name: 'updated_at' },
              // tickets
              { table_name: 'tickets', column_name: 'id' },
              { table_name: 'tickets', column_name: 'nomor_tiket' },
              { table_name: 'tickets', column_name: 'judul' },
              { table_name: 'tickets', column_name: 'deskripsi' },
              { table_name: 'tickets', column_name: 'kategori' },
              { table_name: 'tickets', column_name: 'status_tiket' },
              { table_name: 'tickets', column_name: 'prioritas' },
              { table_name: 'tickets', column_name: 'pelapor_user_id' },
              { table_name: 'tickets', column_name: 'assigned_to_user_id' },
              { table_name: 'tickets', column_name: 'created_at' },
              { table_name: 'tickets', column_name: 'updated_at' },
              { table_name: 'tickets', column_name: 'resolved_at' },
              // users
              { table_name: 'users', column_name: 'id' },
              { table_name: 'users', column_name: 'nama' },
              { table_name: 'users', column_name: 'email' },
              { table_name: 'users', column_name: 'role' },
              { table_name: 'users', column_name: 'is_active' },
              { table_name: 'users', column_name: 'created_at' },
              { table_name: 'users', column_name: 'updated_at' },
              // log_riwayat_aset
              { table_name: 'log_riwayat_aset', column_name: 'id' },
              { table_name: 'log_riwayat_aset', column_name: 'id_aset' },
              { table_name: 'log_riwayat_aset', column_name: 'label_aset' },
              { table_name: 'log_riwayat_aset', column_name: 'aksi' },
              { table_name: 'log_riwayat_aset', column_name: 'perubahan' },
              { table_name: 'log_riwayat_aset', column_name: 'oleh_pengguna' },
              { table_name: 'log_riwayat_aset', column_name: 'dibuat_pada' },
              // log_audit_login
              { table_name: 'log_audit_login', column_name: 'id' },
              { table_name: 'log_audit_login', column_name: 'user_id' },
              { table_name: 'log_audit_login', column_name: 'email' },
              { table_name: 'log_audit_login', column_name: 'ip_address' },
              { table_name: 'log_audit_login', column_name: 'user_agent' },
              { table_name: 'log_audit_login', column_name: 'login_time' },
              // riwayat_pemakaian_aset
              { table_name: 'riwayat_pemakaian_aset', column_name: 'id' },
              { table_name: 'riwayat_pemakaian_aset', column_name: 'id_aset' },
              { table_name: 'riwayat_pemakaian_aset', column_name: 'nik_pemegang' },
              { table_name: 'riwayat_pemakaian_aset', column_name: 'tanggal_mulai' },
              { table_name: 'riwayat_pemakaian_aset', column_name: 'tanggal_selesai' },
              { table_name: 'riwayat_pemakaian_aset', column_name: 'catatan' },
              // ticket_casp_ratings
              { table_name: 'ticket_casp_ratings', column_name: 'id' },
              { table_name: 'ticket_casp_ratings', column_name: 'id_tiket' },
              { table_name: 'ticket_casp_ratings', column_name: 'reporter_user_id' },
              { table_name: 'ticket_casp_ratings', column_name: 'assignee_user_id' },
              { table_name: 'ticket_casp_ratings', column_name: 'rating_score' },
              { table_name: 'ticket_casp_ratings', column_name: 'feedback' },
              { table_name: 'ticket_casp_ratings', column_name: 'submitted_at' },
            ]
          }
        }
        return { rows: [] }
      }
    }

    const isValid = await validateExportMetadata(mockDb)
    assert.equal(isValid, true)
  })

  it('validateExportMetadata throws error when a column does not exist in schema', async () => {
    const mockDbMissingCol = {
      async query(sql) {
        if (sql.includes('information_schema.tables')) {
          return { rows: [{ table_name: 'ticket_casp_ratings' }] }
        }
        if (sql.includes('information_schema.columns')) {
          // missing 'rating_score'
          return {
            rows: [
              { table_name: 'ticket_casp_ratings', column_name: 'id' },
              { table_name: 'ticket_casp_ratings', column_name: 'id_tiket' },
            ]
          }
        }
        return { rows: [] }
      }
    }

    await assert.rejects(
      async () => {
        await validateExportMetadata(mockDbMissingCol)
      },
      /Export schema/
    )
  })
})
