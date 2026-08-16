import { pool } from '../config/database.js'

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
const TABLE_SCHEMAS = {
  aset_ti: {
    tableName: 'aset_ti',
    label: 'Aset IT (Inventaris)',
    description: 'Data seluruh aset/perangkat IT beserta penugasan karyawan dan statusnya',
    icon: 'devices',
    dateField: 'created_at',
    statusField: 'status',
    orderField: 'id',
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
    dateField: 'dibuat_pada',
    statusField: 'status_tiket',
    orderField: 'id',
    columns: [
      { name: 'id', label: 'ID Tiket', type: 'number', defaultSelected: true },
      { name: 'nomor_tiket', label: 'Nomor Tiket', type: 'string', defaultSelected: true },
      { name: 'judul', label: 'Judul / Subjek', type: 'string', defaultSelected: true },
      { name: 'deskripsi', label: 'Deskripsi Kendala', type: 'string', defaultSelected: false },
      { name: 'kategori', label: 'Kategori', type: 'string', defaultSelected: true },
      { name: 'status_tiket', label: 'Status', type: 'string', defaultSelected: true },
      { name: 'prioritas', label: 'Prioritas', type: 'string', defaultSelected: true },
      { name: 'pelapor', label: 'Nama Pelapor', type: 'string', defaultSelected: true },
      { name: 'assigned_to', label: 'Teknisi / Assignee', type: 'string', defaultSelected: true },
      { name: 'dibuat_pada', label: 'Tanggal Dibuat', type: 'date', defaultSelected: true },
      { name: 'diperbarui_pada', label: 'Terakhir Diperbarui', type: 'date', defaultSelected: false },
      { name: 'resolved_at', label: 'Tanggal Selesai', type: 'date', defaultSelected: true }
    ]
  },
  users: {
    tableName: 'users',
    label: 'Pengguna Sistem',
    description: 'Data akun pengguna aplikasi, peran (role), dan status keaktifan',
    icon: 'group',
    dateField: 'dibuat_pada',
    statusField: 'is_active',
    orderField: 'id',
    columns: [
      { name: 'id', label: 'ID User', type: 'number', defaultSelected: true },
      { name: 'nama', label: 'Nama Lengkap', type: 'string', defaultSelected: true },
      { name: 'email', label: 'Email Akses', type: 'string', defaultSelected: true },
      { name: 'role', label: 'Role / Hak Akses', type: 'string', defaultSelected: true },
      { name: 'is_active', label: 'Status Aktif', type: 'boolean', defaultSelected: true },
      { name: 'dibuat_pada', label: 'Tanggal Registrasi', type: 'date', defaultSelected: true },
      { name: 'diperbarui_pada', label: 'Terakhir Diperbarui', type: 'date', defaultSelected: false }
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
    dateField: 'dibuat_pada',
    orderField: 'id',
    columns: [
      { name: 'id', label: 'ID Log', type: 'number', defaultSelected: true },
      { name: 'nama_pengguna', label: 'Nama Pengguna', type: 'string', defaultSelected: true },
      { name: 'email', label: 'Email', type: 'string', defaultSelected: true },
      { name: 'aktifitas', label: 'Aktivitas Sesi', type: 'string', defaultSelected: true },
      { name: 'ip_address', label: 'IP Address', type: 'string', defaultSelected: true },
      { name: 'browser', label: 'User Agent / Browser', type: 'string', defaultSelected: true },
      { name: 'dibuat_pada', label: 'Waktu Kejadian', type: 'date', defaultSelected: true }
    ]
  },
  riwayat_pemakaian_aset: {
    tableName: 'riwayat_pemakaian_aset',
    label: 'Riwayat Pemakaian Aset Karyawan',
    description: 'Riwayat masa siklus penggunaan aset oleh masing-masing karyawan',
    icon: 'repeat',
    dateField: 'tanggal_mulai',
    orderField: 'id',
    columns: [
      { name: 'id', label: 'ID Riwayat', type: 'number', defaultSelected: true },
      { name: 'label_aset', label: 'Label Aset', type: 'string', defaultSelected: true },
      { name: 'nomor_seri', label: 'Nomor Seri', type: 'string', defaultSelected: true },
      { name: 'tipe_perangkat', label: 'Tipe Perangkat', type: 'string', defaultSelected: true },
      { name: 'merek', label: 'Merek', type: 'string', defaultSelected: false },
      { name: 'model', label: 'Model', type: 'string', defaultSelected: false },
      { name: 'nik', label: 'NIK Karyawan', type: 'string', defaultSelected: true },
      { name: 'nama_karyawan', label: 'Nama Karyawan', type: 'string', defaultSelected: true },
      { name: 'tanggal_mulai', label: 'Tanggal Penyerahan', type: 'date', defaultSelected: true },
      { name: 'tanggal_selesai', label: 'Tanggal Pengembalian', type: 'date', defaultSelected: true },
      { name: 'catatan', label: 'Catatan', type: 'string', defaultSelected: false }
    ]
  },
  ticket_casp_ratings: {
    tableName: 'ticket_casp_ratings',
    label: 'Penilaian Kepuasan CASP Tiket',
    description: 'Data skor rating kepuasan layanan IT dan ulasan feedback dari pelapor',
    icon: 'star',
    dateField: 'submitted_at',
    orderField: 'id',
    columns: [
      { name: 'id', label: 'ID Rating', type: 'number', defaultSelected: true },
      { name: 'ticket_id', label: 'ID Tiket', type: 'number', defaultSelected: true },
      { name: 'reporter_name_snapshot', label: 'Nama Pelapor', type: 'string', defaultSelected: true },
      { name: 'assignee_name_snapshot', label: 'Teknisi IT', type: 'string', defaultSelected: true },
      { name: 'rating', label: 'Skor Rating (1-5)', type: 'number', defaultSelected: true },
      { name: 'feedback', label: 'Feedback / Ulasan', type: 'string', defaultSelected: true },
      { name: 'submitted_at', label: 'Waktu Penilaian', type: 'date', defaultSelected: true }
    ]
  }
}

/**
 * Endpoint GET /api/export/tables
 * Mendapatkan daftar skema tabel yang bisa diekspor beserta jumlah baris data masing-masing.
 */
export async function getExportTablesMetadata(req, res) {
  try {
    const tableKeys = Object.keys(TABLE_SCHEMAS)
    const tablesList = []

    for (const key of tableKeys) {
      const schema = TABLE_SCHEMAS[key]
      let rowCount = 0

      try {
        const tableIdentifier = quoteAllowedIdentifier(schema.tableName)
        const countRes = await pool.query(`SELECT COUNT(*)::int AS count FROM ${tableIdentifier}`)
        rowCount = countRes.rows[0]?.count || 0
      } catch (err) {
        // Abaikan jika tabel belum terbuat di environment lokal
        rowCount = 0
      }

      tablesList.push({
        ...schema,
        rowCount
      })
    }

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

    const selectClause = selectedCols.map(quoteAllowedIdentifier).join(', ')
    const tableIdentifier = quoteAllowedIdentifier(schema.tableName)
    let sql = `SELECT ${selectClause} FROM ${tableIdentifier}`
    const whereConditions = []
    const queryParams = []
    let paramIndex = 1

    if (schema.dateField) {
      if (startDate) {
        const dateIdentifier = quoteAllowedIdentifier(schema.dateField)
        whereConditions.push(`${dateIdentifier} >= $${paramIndex}::date`)
        queryParams.push(startDate)
        paramIndex++
      }
      if (endDate) {
        const dateIdentifier = quoteAllowedIdentifier(schema.dateField)
        whereConditions.push(`${dateIdentifier} < ($${paramIndex}::date + INTERVAL '1 day')`)
        queryParams.push(endDate)
        paramIndex++
      }
    }

    if (search) {
      const searchCols = schema.columns.filter((c) => c.type === 'string').map((c) => c.name)
      if (searchCols.length > 0) {
        const searchConditions = searchCols.map(
          (col) => `${quoteAllowedIdentifier(col)}::text ILIKE $${paramIndex}`
        )
        whereConditions.push(`(${searchConditions.join(' OR ')})`)
        queryParams.push(`%${search}%`)
        paramIndex++
      }
    }

    if (status && status.toLowerCase() !== 'semua' && status.toLowerCase() !== 'all') {
      if (schema.statusField) {
        const statusIdentifier = quoteAllowedIdentifier(schema.statusField)
        whereConditions.push(`${statusIdentifier}::text ILIKE $${paramIndex}`)
        queryParams.push(status)
        paramIndex++
      }
    }

    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`
    }

    const orderIdentifier = quoteAllowedIdentifier(schema.orderField)
    sql += ` ORDER BY ${orderIdentifier} DESC LIMIT $${paramIndex}`
    queryParams.push(limit)

    const result = await pool.query(sql, queryParams)

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
      Object.fromEntries(selectedCols.map((column) => [column, row[column]]))
    )

    res.json({
      success: true,
      tableName: schema.tableName,
      label: schema.label,
      totalRows: projectedRows.length,
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
