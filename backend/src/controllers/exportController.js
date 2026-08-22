import { pool } from '../config/database.js'
import { normalizeLocation } from '../utils/locationNormalizer.js'

const MAX_EXPORT_ROWS = 1000
const MAX_SEARCH_LENGTH = 200
const MAX_STATUS_LENGTH = 100

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function quoteAllowedIdentifier(identifier) {
  // Semua pemanggil hanya memberikan identifier dari TABLE_SCHEMAS.
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error('Invalid server-side export identifier.')
  }

  return `"${identifier}"`
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  // PostgreSQL tidak memiliki tahun nol pada input tanggal Gregorian.
  if (value.startsWith('0000-')) {
    return false
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function validateOptionalDate(value, fieldLabel) {
  // String kosong adalah representasi "tanpa filter" yang dipakai frontend.
  if (value === undefined || value === '') {
    return undefined
  }

  if (!isValidDateOnly(value)) {
    throw createHttpError(400, `${fieldLabel} harus berupa tanggal YYYY-MM-DD yang valid.`)
  }

  return value
}

function validateOptionalText(value, fieldLabel, maxLength) {
  if (value === undefined) {
    return ''
  }

  if (typeof value !== 'string') {
    throw createHttpError(400, `${fieldLabel} harus berupa string.`)
  }

  const normalized = value.trim()
  if (normalized.length > maxLength) {
    throw createHttpError(400, `${fieldLabel} maksimal ${maxLength} karakter.`)
  }

  return normalized
}

// Metadata skema tabel yang dapat diekspor
export const TABLE_SCHEMAS = {
  aset_ti: {
    tableName: 'aset_ti',
    label: 'Aset IT (Inventaris)',
    description: 'Data seluruh aset/perangkat IT beserta penugasan karyawan dan statusnya',
    icon: 'devices',
    dateField: 'created_at',
    statusField: 'status',
    orderField: 'id',
    softDeleteField: 'deleted_at',
    columns: [
      { name: 'id', label: 'ID Aset', type: 'number', defaultSelected: true },
      { name: 'hostname', label: 'Hostname', type: 'string', defaultSelected: true },
      { name: 'serial_number', label: 'Serial Number', type: 'string', defaultSelected: true },
      { name: 'nik_pemegang_asset', label: 'NIK Pemegang', type: 'string', defaultSelected: true },
      { name: 'nama_karyawan_pemegang_asset', label: 'Nama Pemegang', type: 'string', defaultSelected: true },
      { name: 'departemen_pemegang_asset', label: 'Departemen', type: 'string', defaultSelected: true },
      { name: 'lokasi_asset', label: 'Lokasi Asset', type: 'string', defaultSelected: true },
      { name: 'tipe_perangkat', label: 'Tipe Perangkat', type: 'string', defaultSelected: true },
      { name: 'brand_merek', label: 'Brand/Merek', type: 'string', defaultSelected: true },
      { name: 'model', label: 'Model', type: 'string', defaultSelected: true },
      { name: 'spesifikasi', label: 'Spesifikasi', type: 'string', defaultSelected: true },
      { name: 'status', label: 'Status Asset', type: 'string', defaultSelected: true },
      { name: 'kondisi', label: 'Kondisi Asset', type: 'string', defaultSelected: true },
      { name: 'note_asset', label: 'Catatan', type: 'string', defaultSelected: false },
      { name: 'created_at', label: 'Dibuat Pada', type: 'date', defaultSelected: true },
      { name: 'updated_at', label: 'Diperbarui Pada', type: 'date', defaultSelected: false }
    ]
  },
  aset_ga: {
    tableName: 'aset_ga',
    label: 'Aset GA (General Affair)',
    description: 'Inventaris aset GA, fasilitas kantor, quantity, dan lokasi detail',
    icon: 'domain',
    dateField: 'created_at',
    orderField: 'id',
    softDeleteField: 'deleted_at',
    columns: [
      { name: 'id', label: 'ID Aset GA', type: 'number', defaultSelected: true },
      { name: 'hostname', label: 'Hostname', type: 'string', defaultSelected: true },
      { name: 'quantity', label: 'Quantity', type: 'number', defaultSelected: true },
      { name: 'tipe_fasilitas', label: 'Tipe Fasilitas', type: 'string', defaultSelected: true },
      { name: 'nama_asset', label: 'Nama Asset', type: 'string', defaultSelected: true },
      { name: 'ukuran', label: 'Ukuran', type: 'string', defaultSelected: true },
      { name: 'detail', label: 'Detail', type: 'string', defaultSelected: true },
      { name: 'lokasi', label: 'Lokasi', type: 'string', defaultSelected: true },
      { name: 'lokasi_detail', label: 'Lokasi Detail', type: 'string', defaultSelected: true },
      { name: 'kondisi', label: 'Kondisi Asset', type: 'string', defaultSelected: true },
      { name: 'created_at', label: 'Dibuat Pada', type: 'date', defaultSelected: true },
      { name: 'updated_at', label: 'Diperbarui Pada', type: 'date', defaultSelected: false }
    ]
  },
  aset_ops: {
    tableName: 'aset_ops',
    label: 'Aset OPS (Operasional)',
    description: 'Inventaris aset operasional, Kategori, PIC, Tanggal Beli, dan Amount',
    icon: 'precision_manufacturing',
    dateField: 'created_at',
    statusField: 'status',
    orderField: 'id',
    softDeleteField: 'deleted_at',
    columns: [
      { name: 'id', label: 'ID Aset OPS', type: 'number', defaultSelected: true },
      { name: 'hostname', label: 'Hostname', type: 'string', defaultSelected: true },
      { name: 'nama_asset', label: 'Nama Asset', type: 'string', defaultSelected: true },
      { name: 'kategori', label: 'Kategori', type: 'string', defaultSelected: true },
      { name: 'lokasi', label: 'Lokasi', type: 'string', defaultSelected: true },
      { name: 'pic', label: 'PIC', type: 'string', defaultSelected: true },
      { name: 'tanggal_beli', label: 'Tanggal Beli', type: 'date', defaultSelected: true },
      { name: 'total_asset_amount', label: 'Total Asset Amount', type: 'number', defaultSelected: true },
      { name: 'kondisi', label: 'Kondisi Asset', type: 'string', defaultSelected: true },
      { name: 'status', label: 'Status Asset', type: 'string', defaultSelected: true },
      { name: 'created_at', label: 'Dibuat Pada', type: 'date', defaultSelected: true },
      { name: 'updated_at', label: 'Diperbarui Pada', type: 'date', defaultSelected: false }
    ]
  },
  karyawan: {
    tableName: 'karyawan',
    label: 'Data Karyawan',
    description: 'Data profil karyawan, NIK, jabatan, departemen, dan lokasi kerja',
    icon: 'badge',
    dateField: 'created_at',
    statusField: 'status',
    orderField: 'id',
    columns: [
      { name: 'id', label: 'ID Karyawan', type: 'number', defaultSelected: true },
      { name: 'nik', label: 'NIK', type: 'string', defaultSelected: true },
      { name: 'nama_karyawan', label: 'Nama Karyawan', type: 'string', defaultSelected: true },
      { name: 'email_kantor', label: 'Email Kantor', type: 'string', defaultSelected: true },
      { name: 'title', label: 'Title/Jabatan', type: 'string', defaultSelected: true },
      { name: 'job_level', label: 'Job Level', type: 'string', defaultSelected: true },
      { name: 'departemen', label: 'Departemen', type: 'string', defaultSelected: true },
      { name: 'directorate', label: 'Direktorat', type: 'string', defaultSelected: true },
      { name: 'lokasi_kerja', label: 'Lokasi Kerja', type: 'string', defaultSelected: true },
      { name: 'status', label: 'Status Karyawan', type: 'string', defaultSelected: true },
      { name: 'employeement_status', label: 'Status Kepegawaian', type: 'string', defaultSelected: false },
      { name: 'tanggal_mulai_bekerja', label: 'Tanggal Mulai Kerja', type: 'date', defaultSelected: false },
      { name: 'nik_atasan_langsung', label: 'NIK Atasan', type: 'string', defaultSelected: false },
      { name: 'created_at', label: 'Dibuat Pada', type: 'date', defaultSelected: true },
      { name: 'updated_at', label: 'Diperbarui Pada', type: 'date', defaultSelected: false }
    ]
  },
  tickets: {
    tableName: 'tickets',
    label: 'Tiket Kendala IT',
    description: 'Data tiket laporan masalah IT, status penanganan, dan penyelesaian',
    icon: 'confirmation_number',
    dateField: 'created_at',
    statusField: 'status_tiket',
    orderField: 'id',
    fromClause: 'tickets LEFT JOIN users u_pelapor ON u_pelapor.id = tickets.pelapor_user_id LEFT JOIN users u_assignee ON u_assignee.id = tickets.assigned_to_user_id',
    columns: [
      { name: 'id', label: 'ID Tiket', type: 'number', defaultSelected: true, dbExpr: '"tickets"."id"' },
      { name: 'nomor_tiket', label: 'Nomor Tiket', type: 'string', defaultSelected: true, dbExpr: '"tickets"."nomor_tiket"' },
      { name: 'judul', label: 'Judul / Subjek', type: 'string', defaultSelected: true, dbExpr: '"tickets"."judul"' },
      { name: 'deskripsi', label: 'Deskripsi Kendala', type: 'string', defaultSelected: false, dbExpr: '"tickets"."deskripsi"' },
      { name: 'kategori', label: 'Kategori', type: 'string', defaultSelected: true, dbExpr: '"tickets"."kategori"' },
      { name: 'status_tiket', label: 'Status', type: 'string', defaultSelected: true, dbExpr: '"tickets"."status_tiket"' },
      { name: 'prioritas', label: 'Prioritas', type: 'string', defaultSelected: true, dbExpr: '"tickets"."prioritas"' },
      { name: 'pelapor_user_id', label: 'ID Pelapor', type: 'number', defaultSelected: false, dbExpr: '"tickets"."pelapor_user_id"' },
      { name: 'pelapor', label: 'Nama Pelapor', type: 'string', defaultSelected: true, dbExpr: 'COALESCE(u_pelapor.nama, \'\')', sourceTable: 'users', sourceColumn: 'nama' },
      { name: 'assigned_to_user_id', label: 'ID Teknisi', type: 'number', defaultSelected: false, dbExpr: '"tickets"."assigned_to_user_id"' },
      { name: 'assigned_to', label: 'Teknisi / Assignee', type: 'string', defaultSelected: true, dbExpr: 'COALESCE(u_assignee.nama, \'\')', sourceTable: 'users', sourceColumn: 'nama' },
      { name: 'created_at', label: 'Tanggal Dibuat', type: 'date', defaultSelected: true, dbExpr: '"tickets"."created_at"' },
      { name: 'updated_at', label: 'Terakhir Diperbarui', type: 'date', defaultSelected: false, dbExpr: '"tickets"."updated_at"' },
      { name: 'resolved_at', label: 'Tanggal Selesai', type: 'date', defaultSelected: true, dbExpr: '"tickets"."resolved_at"' }
    ]
  },
  users: {
    tableName: 'users',
    label: 'Pengguna Sistem',
    description: 'Data akun pengguna aplikasi, peran (role), dan status keaktifan',
    icon: 'group',
    dateField: 'created_at',
    statusField: 'is_active',
    orderField: 'id',
    columns: [
      { name: 'id', label: 'ID User', type: 'number', defaultSelected: true },
      { name: 'nama', label: 'Nama Lengkap', type: 'string', defaultSelected: true },
      { name: 'email', label: 'Email Akses', type: 'string', defaultSelected: true },
      { name: 'role', label: 'Role / Hak Akses', type: 'string', defaultSelected: true },
      { name: 'is_active', label: 'Status Aktif', type: 'boolean', defaultSelected: true },
      { name: 'created_at', label: 'Tanggal Registrasi', type: 'date', defaultSelected: true },
      { name: 'updated_at', label: 'Terakhir Diperbarui', type: 'date', defaultSelected: false }
    ]
  },
  log_riwayat_aset: {
    tableName: 'log_riwayat_aset',
    label: 'Log Audit Perubahan Aset',
    description: 'Riwayat mutasi, perubahan atribut, dan penghapusan aset IT',
    icon: 'history',
    dateField: 'dibuat_pada',
    orderField: 'id',
    columns: [
      { name: 'id', label: 'ID Log', type: 'number', defaultSelected: true },
      { name: 'id_aset', label: 'ID Aset', type: 'number', defaultSelected: true },
      { name: 'label_aset', label: 'Label Aset', type: 'string', defaultSelected: true },
      { name: 'aksi', label: 'Jenis Aksi', type: 'string', defaultSelected: true },
      { name: 'perubahan', label: 'Rincian Perubahan', type: 'string', defaultSelected: true },
      { name: 'oleh_pengguna', label: 'Dilakukan Oleh', type: 'string', defaultSelected: true },
      { name: 'dibuat_pada', label: 'Waktu Eksekusi', type: 'date', defaultSelected: true }
    ]
  },
  log_audit_login: {
    tableName: 'log_audit_login',
    label: 'Log Audit Login & Sesi',
    description: 'Riwayat aktivitas login, logout, IP address, dan browser pengguna',
    icon: 'receipt_long',
    dateField: 'login_time',
    orderField: 'id',
    columns: [
      { name: 'id', label: 'ID Log', type: 'number', defaultSelected: true },
      { name: 'user_id', label: 'ID User', type: 'number', defaultSelected: true },
      { name: 'email', label: 'Email', type: 'string', defaultSelected: true },
      { name: 'ip_address', label: 'IP Address', type: 'string', defaultSelected: true },
      { name: 'user_agent', label: 'User Agent / Browser', type: 'string', defaultSelected: true },
      { name: 'login_time', label: 'Waktu Login', type: 'date', defaultSelected: true }
    ]
  },
  riwayat_pemakaian_aset: {
    tableName: 'riwayat_pemakaian_aset',
    label: 'Riwayat Pemakaian Aset Karyawan',
    description: 'Riwayat masa siklus penggunaan aset oleh masing-masing karyawan',
    icon: 'repeat',
    dateField: 'tanggal_mulai',
    orderField: 'id',
    fromClause: 'riwayat_pemakaian_aset LEFT JOIN aset_ti a ON a.id = riwayat_pemakaian_aset.id_aset LEFT JOIN karyawan k ON k.nik = riwayat_pemakaian_aset.nik_pemegang',
    columns: [
      { name: 'id', label: 'ID Riwayat', type: 'number', defaultSelected: true, dbExpr: '"riwayat_pemakaian_aset"."id"' },
      { name: 'id_aset', label: 'ID Aset', type: 'number', defaultSelected: false, dbExpr: '"riwayat_pemakaian_aset"."id_aset"' },
      { name: 'label_aset', label: 'Label Aset', type: 'string', defaultSelected: true, dbExpr: 'COALESCE(a.hostname, \'\')', sourceTable: 'aset_ti', sourceColumn: 'hostname' },
      { name: 'nomor_seri', label: 'Nomor Seri', type: 'string', defaultSelected: true, dbExpr: 'COALESCE(a.serial_number, \'\')', sourceTable: 'aset_ti', sourceColumn: 'serial_number' },
      { name: 'tipe_perangkat', label: 'Tipe Perangkat', type: 'string', defaultSelected: true, dbExpr: 'COALESCE(a.tipe_perangkat, \'\')', sourceTable: 'aset_ti', sourceColumn: 'tipe_perangkat' },
      { name: 'merek', label: 'Merek', type: 'string', defaultSelected: false, dbExpr: 'COALESCE(a.brand_merek, \'\')', sourceTable: 'aset_ti', sourceColumn: 'brand_merek' },
      { name: 'model', label: 'Model', type: 'string', defaultSelected: false, dbExpr: 'COALESCE(a.model, \'\')', sourceTable: 'aset_ti', sourceColumn: 'model' },
      { name: 'nik', label: 'NIK Karyawan', type: 'string', defaultSelected: true, dbExpr: '"riwayat_pemakaian_aset"."nik_pemegang"', sourceTable: 'riwayat_pemakaian_aset', sourceColumn: 'nik_pemegang' },
      { name: 'nama_karyawan', label: 'Nama Karyawan', type: 'string', defaultSelected: true, dbExpr: 'COALESCE(k.nama_karyawan, \'\')', sourceTable: 'karyawan', sourceColumn: 'nama_karyawan' },
      { name: 'tanggal_mulai', label: 'Tanggal Penyerahan', type: 'date', defaultSelected: true, dbExpr: '"riwayat_pemakaian_aset"."tanggal_mulai"' },
      { name: 'tanggal_selesai', label: 'Tanggal Pengembalian', type: 'date', defaultSelected: true, dbExpr: '"riwayat_pemakaian_aset"."tanggal_selesai"' },
      { name: 'catatan', label: 'Catatan', type: 'string', defaultSelected: false, dbExpr: '"riwayat_pemakaian_aset"."catatan"' }
    ]
  },
  ticket_casp_ratings: {
    tableName: 'ticket_casp_ratings',
    label: 'Penilaian Kepuasan CASP Tiket',
    description: 'Data skor rating kepuasan layanan IT dan ulasan feedback dari pelapor',
    icon: 'star',
    dateField: 'submitted_at',
    orderField: 'id',
    fromClause: 'ticket_casp_ratings LEFT JOIN users u_rep ON u_rep.id = ticket_casp_ratings.reporter_user_id LEFT JOIN users u_ass ON u_ass.id = ticket_casp_ratings.assignee_user_id',
    columns: [
      { name: 'id', label: 'ID Rating', type: 'number', defaultSelected: true, dbExpr: '"ticket_casp_ratings"."id"' },
      { name: 'id_tiket', label: 'ID Tiket', type: 'number', defaultSelected: true, dbExpr: '"ticket_casp_ratings"."id_tiket"' },
      { name: 'reporter_user_id', label: 'ID Pelapor', type: 'number', defaultSelected: false, dbExpr: '"ticket_casp_ratings"."reporter_user_id"' },
      { name: 'reporter_name', label: 'Nama Pelapor', type: 'string', defaultSelected: true, dbExpr: 'COALESCE(u_rep.nama, \'\')', sourceTable: 'users', sourceColumn: 'nama' },
      { name: 'assignee_user_id', label: 'ID Teknisi', type: 'number', defaultSelected: false, dbExpr: '"ticket_casp_ratings"."assignee_user_id"' },
      { name: 'assignee_name', label: 'Nama Teknisi IT', type: 'string', defaultSelected: true, dbExpr: 'COALESCE(u_ass.nama, \'\')', sourceTable: 'users', sourceColumn: 'nama' },
      { name: 'rating_score', label: 'Skor Rating (1-5)', type: 'number', defaultSelected: true, dbExpr: '"ticket_casp_ratings"."rating_score"' },
      { name: 'feedback', label: 'Feedback / Ulasan', type: 'string', defaultSelected: true, dbExpr: '"ticket_casp_ratings"."feedback"' },
      { name: 'submitted_at', label: 'Waktu Penilaian', type: 'date', defaultSelected: true, dbExpr: '"ticket_casp_ratings"."submitted_at"' }
    ]
  }
}

/**
 * Validasi metadata export terhadap skema PostgreSQL yang sedang aktif.
 * Melempar error jika tabel, kolom, dateField, statusField, atau orderField tidak ditemukan di database.
 */
export async function validateExportMetadata(queryable = pool) {
  const dbTablesRes = await queryable.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `)
  const existingTables = new Set(dbTablesRes.rows.map((r) => r.table_name))

  const dbColsRes = await queryable.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `)
  const existingColumns = new Set(dbColsRes.rows.map((r) => `${r.table_name}.${r.column_name}`))

  for (const [schemaKey, schema] of Object.entries(TABLE_SCHEMAS)) {
    if (!existingTables.has(schema.tableName)) {
      throw new Error(`Export schema '${schemaKey}' references non-existent table '${schema.tableName}'.`)
    }

    if (schema.dateField) {
      const fieldName = schema.dateField.includes('.') ? schema.dateField.split('.').pop() : schema.dateField
      if (!existingColumns.has(`${schema.tableName}.${fieldName}`)) {
        throw new Error(`Export schema '${schemaKey}' references non-existent dateField '${schema.dateField}'.`)
      }
    }

    if (schema.statusField) {
      const fieldName = schema.statusField.includes('.') ? schema.statusField.split('.').pop() : schema.statusField
      if (!existingColumns.has(`${schema.tableName}.${fieldName}`)) {
        throw new Error(`Export schema '${schemaKey}' references non-existent statusField '${schema.statusField}'.`)
      }
    }

    if (schema.orderField) {
      const fieldName = schema.orderField.includes('.') ? schema.orderField.split('.').pop() : schema.orderField
      if (!existingColumns.has(`${schema.tableName}.${fieldName}`)) {
        throw new Error(`Export schema '${schemaKey}' references non-existent orderField '${schema.orderField}'.`)
      }
    }

    for (const col of schema.columns) {
      const targetTable = col.sourceTable || schema.tableName
      const targetCol = col.sourceColumn || col.name
      if (!existingColumns.has(`${targetTable}.${targetCol}`)) {
        throw new Error(`Export schema '${schemaKey}' column '${col.name}' references non-existent column '${targetTable}.${targetCol}'.`)
      }
    }
  }

  return true
}

/**
 * Endpoint GET /api/export/tables
 * Mendapatkan daftar skema tabel yang bisa diekspor beserta jumlah baris data masing-masing.
 */
export async function getExportTablesMetadata(req, res) {
  try {
    const tableKeys = Object.keys(TABLE_SCHEMAS)

    const tablesList = await Promise.all(
      tableKeys.map(async (key) => {
        const schema = TABLE_SCHEMAS[key]
        let rowCount = null
        let error = null

        try {
          const tableIdentifier = quoteAllowedIdentifier(schema.tableName)
          const countRes = await pool.query(`SELECT COUNT(*)::int AS count FROM ${tableIdentifier}`)
          rowCount = countRes.rows[0]?.count ?? null
        } catch (err) {
          // Log error internal tanpa membocorkan ke client
          console.error(`[Export Metadata Error] Gagal menghitung jumlah baris untuk ${schema.tableName}:`, err.message)
          rowCount = null
          error = 'Gagal menghitung jumlah data'
        }

        // Return clean client metadata representation (sanitized)
        const { fromClause, ...clientSchema } = schema
        const cleanColumns = clientSchema.columns.map(({ dbExpr, sourceTable, sourceColumn, ...col }) => col)

        return {
          ...clientSchema,
          columns: cleanColumns,
          rowCount,
          ...(error ? { error } : {})
        }
      })
    )

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      tables: tablesList
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' })
  }
}

/**
 * Endpoint POST /api/export/data
 * Mengambil data kustom berdasarkan pilihan tabel, kolom, rentang tanggal, filter kata kunci, dan batas baris.
 */
export async function exportTableData(req, res) {
  try {
    if (!isPlainObject(req.body)) {
      throw createHttpError(400, 'Body request harus berupa objek JSON.')
    }

    const { tableName, columns, limit } = req.body

    if (typeof tableName !== 'string' || !Object.hasOwn(TABLE_SCHEMAS, tableName)) {
      throw createHttpError(400, 'Tabel yang dipilih tidak valid atau tidak ditemukan.')
    }

    if (
      !Object.hasOwn(req.body, 'limit') ||
      typeof limit !== 'number' ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_EXPORT_ROWS
    ) {
      throw createHttpError(
        400,
        `Limit wajib berupa integer JSON antara 1 dan ${MAX_EXPORT_ROWS}.`
      )
    }

    const schema = TABLE_SCHEMAS[tableName]
    const validColNames = schema.columns.map((c) => c.name)

    let selectedCols = validColNames
    if (columns !== undefined) {
      const columnSet = Array.isArray(columns) ? new Set(columns) : null
      const hasOnlyAllowedColumns =
        columnSet &&
        columns.length > 0 &&
        columnSet.size === columns.length &&
        columns.every((column) => typeof column === 'string' && validColNames.includes(column))

      if (!hasOnlyAllowedColumns) {
        throw createHttpError(
          400,
          'Kolom harus berupa subset unik dan tidak kosong dari allowlist tabel.'
        )
      }

      selectedCols = columns
    }

    const startDate = validateOptionalDate(req.body.startDate, 'Tanggal awal')
    const endDate = validateOptionalDate(req.body.endDate, 'Tanggal akhir')
    if (startDate && endDate && startDate > endDate) {
      throw createHttpError(400, 'Tanggal awal tidak boleh melewati tanggal akhir.')
    }

    const search = validateOptionalText(req.body.search, 'Pencarian', MAX_SEARCH_LENGTH)
    const status = validateOptionalText(req.body.status, 'Status', MAX_STATUS_LENGTH)

    const selectClause = selectedCols
      .map((colName) => {
        const colMeta = schema.columns.find((c) => c.name === colName)
        const colAlias = quoteAllowedIdentifier(colName)
        if (colMeta && colMeta.dbExpr) {
          return `${colMeta.dbExpr} AS ${colAlias}`
        }
        return `${quoteAllowedIdentifier(schema.tableName)}.${colAlias} AS ${colAlias}`
      })
      .join(', ')

    const fromClause = schema.fromClause || quoteAllowedIdentifier(schema.tableName)
    let sql = `SELECT ${selectClause} FROM ${fromClause}`
    const whereConditions = []
    const queryParams = []
    let paramIndex = 1

    if (schema.softDeleteField) {
      const softDeleteExpr = schema.softDeleteField.includes('.')
        ? schema.softDeleteField
        : `${quoteAllowedIdentifier(schema.tableName)}.${quoteAllowedIdentifier(schema.softDeleteField)}`
      whereConditions.push(`${softDeleteExpr} IS NULL`)
    }

    if (schema.dateField) {
      const dateExpr = schema.dateField.includes('.')
        ? schema.dateField
        : `${quoteAllowedIdentifier(schema.tableName)}.${quoteAllowedIdentifier(schema.dateField)}`

      if (startDate) {
        whereConditions.push(`${dateExpr} >= $${paramIndex}::date`)
        queryParams.push(startDate)
        paramIndex++
      }
      if (endDate) {
        whereConditions.push(`${dateExpr} < ($${paramIndex}::date + INTERVAL '1 day')`)
        queryParams.push(endDate)
        paramIndex++
      }
    }

    if (search) {
      const searchCols = schema.columns.filter((c) => c.type === 'string')
      if (searchCols.length > 0) {
        const searchConditions = searchCols.map((c) => {
          const expr = c.dbExpr || `${quoteAllowedIdentifier(schema.tableName)}.${quoteAllowedIdentifier(c.name)}`
          return `${expr}::text ILIKE $${paramIndex}`
        })
        whereConditions.push(`(${searchConditions.join(' OR ')})`)
        queryParams.push(`%${search}%`)
        paramIndex++
      }
    }

    if (status && status.toLowerCase() !== 'semua' && status.toLowerCase() !== 'all') {
      if (schema.statusField) {
        const statusExpr = schema.statusField.includes('.')
          ? schema.statusField
          : `${quoteAllowedIdentifier(schema.tableName)}.${quoteAllowedIdentifier(schema.statusField)}`

        const colMeta = schema.columns.find((c) => c.name === schema.statusField)
        if (colMeta && colMeta.type === 'boolean') {
          const sLower = status.toLowerCase()
          const boolVal = ['true', '1', 'active', 'aktif', 'ya'].includes(sLower)
          whereConditions.push(`${statusExpr} = $${paramIndex}`)
          queryParams.push(boolVal)
          paramIndex++
        } else {
          whereConditions.push(`${statusExpr}::text ILIKE $${paramIndex}`)
          queryParams.push(status)
          paramIndex++
        }
      }
    }

    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`
    }

    const orderExpr = schema.orderField.includes('.')
      ? schema.orderField
      : `${quoteAllowedIdentifier(schema.tableName)}.${quoteAllowedIdentifier(schema.orderField)}`
    sql += ` ORDER BY ${orderExpr} DESC LIMIT $${paramIndex}`
    queryParams.push(limit)

    const result = await pool.query(sql, queryParams)

    // Calculate total un-truncated DB count for this query
    let totalDbRows = result.rows.length
    try {
      let countSql = `SELECT COUNT(*)::int AS count FROM ${fromClause}`
      if (whereConditions.length > 0) {
        countSql += ` WHERE ${whereConditions.join(' AND ')}`
        // Exclude the limit parameter from count query
        const countParams = queryParams.slice(0, queryParams.length - 1)
        const countRes = await pool.query(countSql, countParams)
        totalDbRows = countRes.rows[0]?.count ?? result.rows.length
      } else {
        const countRes = await pool.query(`SELECT COUNT(*)::int AS count FROM ${fromClause}`)
        totalDbRows = countRes.rows[0]?.count ?? result.rows.length
      }
    } catch (err) {
      console.error('[Export Count Error]', err.message)
    }

    const isTruncated = totalDbRows > result.rows.length

    const exportedColumnsMeta = selectedCols.map((colName) => {
      const colMeta = schema.columns.find((c) => c.name === colName)
      return {
        name: colName,
        label: colMeta.label,
        type: colMeta.type
      }
    })

    // Proyeksikan ulang agar properti tak terduga dari driver/mock tidak ikut terkirim.
    const projectedRows = result.rows.map((row) =>
      Object.fromEntries(
        selectedCols.map((column) => {
          let val = row[column]
          if ((column === 'lokasi_asset' || column === 'lokasi_kerja') && val) {
            val = normalizeLocation(val)
          }
          return [column, val]
        })
      )
    )

    // Audit Logging
    try {
      const auditActor = req.user?.nama || req.user?.email || 'Super Administrator'
      await pool.query(
        `INSERT INTO log_riwayat_aset (id_aset, label_aset, aksi, perubahan, oleh_pengguna, dibuat_pada)
         VALUES (0, $1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [
          `Export ${schema.label}`,
          'UBAH',
          `Mengekspor ${projectedRows.length} baris data (tabel: ${schema.tableName})`,
          auditActor
        ]
      )
    } catch (logErr) {
      console.error('[Export Audit Log Error]', logErr.message)
    }

    res.json({
      success: true,
      tableName: schema.tableName,
      label: schema.label,
      totalRows: projectedRows.length,
      totalDbRows,
      isTruncated,
      columns: exportedColumnsMeta,
      data: projectedRows
    })
  } catch (error) {
    if (error.statusCode === 400) {
      res.status(400).json({ success: false, message: error.message })
      return
    }

    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' })
  }
}

/**
 * Neutralizes CSV formula injection by prefixing single quote if string begins with =, +, -, @, \t, \r
 */
export function escapeCsvField(val) {
  if (val === null || val === undefined) {
    return ''
  }
  let str = String(val)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsvString(rows, columns) {
  const headerRow = columns.map((col) => escapeCsvField(col.label || col.name)).join(',')
  const dataRows = rows.map((row) =>
    columns
      .map((col) => {
        let val = row[col.name]
        if ((col.name === 'lokasi_asset' || col.name === 'lokasi_kerja') && val) {
          val = normalizeLocation(val)
        }
        return escapeCsvField(val)
      })
      .join(',')
  )
  return [headerRow, ...dataRows].join('\r\n')
}

async function logExportAudit(req, label, tableName, rowCount) {
  try {
    const auditActor = req.user?.nama || req.user?.email || 'Super Administrator'
    await pool.query(
      `INSERT INTO log_riwayat_aset (id_aset, label_aset, aksi, perubahan, oleh_pengguna, dibuat_pada)
       VALUES (0, $1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [
        `Export ${label}`,
        'UBAH',
        `Mengekspor ${rowCount} baris data (tabel: ${tableName})`,
        auditActor
      ]
    )
  } catch (logErr) {
    console.error('[Export Audit Log Error]', logErr.message)
  }
}

/**
 * GET /api/export
 * Root index listing available export endpoints and format capabilities.
 */
export async function getExportIndex(req, res) {
  res.json({
    success: true,
    service: 'IT Assets Monitoring Export API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      { path: '/api/export/assets', name: 'Export Assets', description: 'Export IT asset inventory data', formats: ['csv', 'json'] },
      { path: '/api/export/users', name: 'Export Users', description: 'Export system user accounts (excluding secrets)', formats: ['csv', 'json'] },
      { path: '/api/export/tickets', name: 'Export Tickets', description: 'Export IT support tickets data', formats: ['csv', 'json'] },
      { path: '/api/export/tables', name: 'Tables Metadata', description: 'Export schema metadata and row counts', formats: ['json'] },
      { path: '/api/export/data', name: 'Custom Data Export', description: 'Custom table export with column selection', formats: ['json'] }
    ]
  })
}

/**
 * GET /api/export/assets
 * Direct file download export for Assets.
 */
export async function exportAssetsHandler(req, res) {
  try {
    const format = (req.query.format || 'csv').toLowerCase()
    const schema = TABLE_SCHEMAS.aset_ti
    const selectedCols = schema.columns.map((c) => c.name)

    const result = await pool.query(
      `SELECT id, hostname, serial_number, nik_pemegang_asset, nama_karyawan_pemegang_asset,
              departemen_pemegang_asset, lokasi_asset, tipe_perangkat, brand_merek, model,
              spesifikasi, status, kondisi, note_asset, created_at, updated_at
       FROM aset_ti
       WHERE deleted_at IS NULL
       ORDER BY id DESC
       LIMIT ${MAX_EXPORT_ROWS}`
    )

    const projectedRows = result.rows.map((row) =>
      Object.fromEntries(
        selectedCols.map((column) => {
          let val = row[column]
          if (column === 'lokasi_asset' && val) {
            val = normalizeLocation(val)
          }
          return [column, val]
        })
      )
    )

    await logExportAudit(req, 'Aset IT', 'aset_ti', projectedRows.length)

    const todayStr = new Date().toISOString().slice(0, 10)

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="export-assets-${todayStr}.json"`)
      return res.json({
        success: true,
        tableName: 'aset_ti',
        totalRows: projectedRows.length,
        data: projectedRows
      })
    }

    const csvContent = toCsvString(projectedRows, schema.columns)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="export-assets-${todayStr}.csv"`)
    res.send(csvContent)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat mengekspor aset.' })
  }
}

/**
 * GET /api/export/users
 * Direct file download export for Users (STRICTLY excludes password hashes & credentials).
 */
export async function exportUsersHandler(req, res) {
  try {
    const format = (req.query.format || 'csv').toLowerCase()
    const schema = TABLE_SCHEMAS.users
    const selectedCols = schema.columns.map((c) => c.name)

    const result = await pool.query(
      `SELECT id, nama, email, role, is_active, created_at, updated_at
       FROM users
       ORDER BY id ASC
       LIMIT ${MAX_EXPORT_ROWS}`
    )

    const projectedRows = result.rows.map((row) =>
      Object.fromEntries(selectedCols.map((column) => [column, row[column]]))
    )

    await logExportAudit(req, 'Pengguna Sistem', 'users', projectedRows.length)

    const todayStr = new Date().toISOString().slice(0, 10)

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="export-users-${todayStr}.json"`)
      return res.json({
        success: true,
        tableName: 'users',
        totalRows: projectedRows.length,
        data: projectedRows
      })
    }

    const csvContent = toCsvString(projectedRows, schema.columns)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="export-users-${todayStr}.csv"`)
    res.send(csvContent)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat mengekspor pengguna.' })
  }
}

/**
 * GET /api/export/tickets
 * Direct file download export for Tickets.
 */
export async function exportTicketsHandler(req, res) {
  try {
    const format = (req.query.format || 'csv').toLowerCase()
    const schema = TABLE_SCHEMAS.tickets

    const result = await pool.query(
      `SELECT tickets.id, tickets.nomor_tiket, tickets.judul, tickets.deskripsi, tickets.kategori,
              tickets.status_tiket, tickets.prioritas, tickets.pelapor_user_id,
              COALESCE(u_pelapor.nama, '') AS pelapor,
              tickets.assigned_to_user_id,
              COALESCE(u_assignee.nama, '') AS assigned_to,
              tickets.created_at, tickets.updated_at, tickets.resolved_at
       FROM tickets
       LEFT JOIN users u_pelapor ON u_pelapor.id = tickets.pelapor_user_id
       LEFT JOIN users u_assignee ON u_assignee.id = tickets.assigned_to_user_id
       WHERE tickets.deleted_at IS NULL
       ORDER BY tickets.id DESC
       LIMIT ${MAX_EXPORT_ROWS}`
    )

    const selectedCols = schema.columns.map((c) => c.name)
    const projectedRows = result.rows.map((row) =>
      Object.fromEntries(selectedCols.map((column) => [column, row[column]]))
    )

    await logExportAudit(req, 'Tiket Kendala IT', 'tickets', projectedRows.length)

    const todayStr = new Date().toISOString().slice(0, 10)

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="export-tickets-${todayStr}.json"`)
      return res.json({
        success: true,
        tableName: 'tickets',
        totalRows: projectedRows.length,
        data: projectedRows
      })
    }

    const csvContent = toCsvString(projectedRows, schema.columns)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="export-tickets-${todayStr}.csv"`)
    res.send(csvContent)
  } catch (error) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat mengekspor tiket.' })
  }
}

