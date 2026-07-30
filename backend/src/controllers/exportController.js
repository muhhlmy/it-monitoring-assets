import { pool } from '../config/database.js'

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

// Metadata skema tabel yang dapat diekspor
const TABLE_SCHEMAS = {
  aset_ti: {
    tableName: 'aset_ti',
    label: 'Aset IT (Inventaris)',
    description: 'Data seluruh aset/perangkat IT beserta penugasan karyawan dan statusnya',
    icon: 'devices',
    dateField: 'dibuat_pada',
    columns: [
      { name: 'id_aset', label: 'ID Aset', type: 'number', defaultSelected: true },
      { name: 'label_aset', label: 'Label Aset', type: 'string', defaultSelected: true },
      { name: 'nomor_seri', label: 'Nomor Seri', type: 'string', defaultSelected: true },
      { name: 'tipe_perangkat', label: 'Tipe Perangkat', type: 'string', defaultSelected: true },
      { name: 'merek', label: 'Merek', type: 'string', defaultSelected: true },
      { name: 'model', label: 'Model', type: 'string', defaultSelected: true },
      { name: 'spesifikasi', label: 'Spesifikasi', type: 'string', defaultSelected: true },
      { name: 'status_aset', label: 'Status Aset', type: 'string', defaultSelected: true },
      { name: 'kondisi_aset', label: 'Kondisi Aset', type: 'string', defaultSelected: true },
      { name: 'lokasi_aset', label: 'Lokasi Perangkat', type: 'string', defaultSelected: true },
      { name: 'id_karyawan', label: 'ID Karyawan', type: 'number', defaultSelected: false },
      { name: 'catatan_aset', label: 'Catatan', type: 'string', defaultSelected: false },
      { name: 'dibuat_pada', label: 'Dibuat Pada', type: 'date', defaultSelected: true },
      { name: 'diperbarui_pada', label: 'Diperbarui Pada', type: 'date', defaultSelected: false }
    ]
  },
  karyawan: {
    tableName: 'karyawan',
    label: 'Data Karyawan',
    description: 'Data profil karyawan, NIK, jabatan, departemen, dan lokasi kerja',
    icon: 'badge',
    dateField: 'dibuat_pada',
    columns: [
      { name: 'id_karyawan', label: 'ID Karyawan', type: 'number', defaultSelected: true },
      { name: 'nik', label: 'NIK', type: 'string', defaultSelected: true },
      { name: 'nama_karyawan', label: 'Nama Karyawan', type: 'string', defaultSelected: true },
      { name: 'email_kantor', label: 'Email Kantor', type: 'string', defaultSelected: true },
      { name: 'jabatan', label: 'Jabatan', type: 'string', defaultSelected: true },
      { name: 'departemen', label: 'Departemen', type: 'string', defaultSelected: true },
      { name: 'direktorat', label: 'Direktorat', type: 'string', defaultSelected: true },
      { name: 'lokasi_kerja', label: 'Lokasi Kerja', type: 'string', defaultSelected: true },
      { name: 'status_karyawan', label: 'Status Karyawan', type: 'string', defaultSelected: true },
      { name: 'status_kepegawaian', label: 'Status Kepegawaian', type: 'string', defaultSelected: false },
      { name: 'jenis_perjanjian_kerja', label: 'Jenis Perjanjian', type: 'string', defaultSelected: false },
      { name: 'tanggal_mulai_bekerja', label: 'Tanggal Mulai Kerja', type: 'date', defaultSelected: false },
      { name: 'id_atasan_langsung', label: 'ID Atasan', type: 'number', defaultSelected: false },
      { name: 'dibuat_pada', label: 'Dibuat Pada', type: 'date', defaultSelected: true }
    ]
  },
  tickets: {
    tableName: 'tickets',
    label: 'Tiket Kendala IT',
    description: 'Data tiket laporan masalah IT, status penanganan, dan penyelesaian',
    icon: 'confirmation_number',
    dateField: 'created_at',
    columns: [
      { name: 'id', label: 'ID Tiket', type: 'number', defaultSelected: true },
      { name: 'ticket_number', label: 'Nomor Tiket', type: 'string', defaultSelected: true },
      { name: 'subject', label: 'Judul / Subjek', type: 'string', defaultSelected: true },
      { name: 'category', label: 'Kategori', type: 'string', defaultSelected: true },
      { name: 'status', label: 'Status', type: 'string', defaultSelected: true },
      { name: 'priority', label: 'Prioritas', type: 'string', defaultSelected: true },
      { name: 'reporter_name', label: 'Nama Pelapor', type: 'string', defaultSelected: true },
      { name: 'reporter_email', label: 'Email Pelapor', type: 'string', defaultSelected: false },
      { name: 'assignee_name', label: 'Teknisi / Assignee', type: 'string', defaultSelected: true },
      { name: 'asset_label', label: 'Label Aset Terkait', type: 'string', defaultSelected: true },
      { name: 'location', label: 'Lokasi', type: 'string', defaultSelected: true },
      { name: 'description', label: 'Deskripsi Kendala', type: 'string', defaultSelected: false },
      { name: 'created_at', label: 'Tanggal Dibuat', type: 'date', defaultSelected: true },
      { name: 'resolved_at', label: 'Tanggal Selesai', type: 'date', defaultSelected: true }
    ]
  },
  users: {
    tableName: 'users',
    label: 'Pengguna Sistem',
    description: 'Data akun pengguna aplikasi, peran (role), dan status keaktifan',
    icon: 'group',
    dateField: 'dibuat_pada',
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
        const countRes = await pool.query(`SELECT COUNT(*)::int AS count FROM ${schema.tableName}`)
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
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Endpoint POST /api/export/data
 * Mengambil data kustom berdasarkan pilihan tabel, kolom, rentang tanggal, filter kata kunci, dan batas baris.
 */
export async function exportTableData(req, res) {
  try {
    const {
      tableName,
      columns,
      startDate,
      endDate,
      search,
      status,
      limit = 'all'
    } = req.body

    if (!tableName || !TABLE_SCHEMAS[tableName]) {
      throw createHttpError(400, 'Tabel yang dipilih tidak valid atau tidak ditemukan.')
    }

    const schema = TABLE_SCHEMAS[tableName]
    const validColNames = schema.columns.map((c) => c.name)

    // Filter kolom yang valid (whitelist) untuk mencegah SQL injection
    let selectedCols = Array.isArray(columns) && columns.length > 0
      ? columns.filter((col) => validColNames.includes(col))
      : validColNames

    if (selectedCols.length === 0) {
      selectedCols = validColNames
    }

    // Bangun kueri SQL
    const selectClause = selectedCols.map((c) => `"${c}"`).join(', ')
    let sql = `SELECT ${selectClause} FROM ${tableName}`
    const whereConditions = []
    const queryParams = []
    let paramIndex = 1

    // Filter Rentang Tanggal jika tersedian
    if (schema.dateField) {
      if (startDate) {
        whereConditions.push(`"${schema.dateField}" >= $${paramIndex}`)
        queryParams.push(`${startDate} 00:00:00`)
        paramIndex++
      }
      if (endDate) {
        whereConditions.push(`"${schema.dateField}" <= $${paramIndex}`)
        queryParams.push(`${endDate} 23:59:59`)
        paramIndex++
      }
    }

    // Filter Kata Kunci Pencarian pada kolom string pertama/utama
    if (search && String(search).trim() !== '') {
      const searchCols = schema.columns.filter((c) => c.type === 'string').map((c) => c.name)
      if (searchCols.length > 0) {
        const searchConditions = searchCols.map((col) => `"${col}"::text ILIKE $${paramIndex}`)
        whereConditions.push(`(${searchConditions.join(' OR ')})`)
        queryParams.push(`%${String(search).trim()}%`)
        paramIndex++
      }
    }

    // Filter Status spesifik jika ada (misal status_aset, status, status_karyawan)
    if (status && status !== 'semua' && status !== 'all') {
      const statusCol = validColNames.find((c) => c.includes('status'))
      if (statusCol) {
        whereConditions.push(`"${statusCol}"::text ILIKE $${paramIndex}`)
        queryParams.push(status)
        paramIndex++
      }
    }

    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`
    }

    // Ordering
    const primaryKeyCol = validColNames[0] || 'id'
    sql += ` ORDER BY "${primaryKeyCol}" DESC`

    // Limit
    if (limit && limit !== 'all') {
      const parsedLimit = parseInt(limit, 10)
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        sql += ` LIMIT $${paramIndex}`
        queryParams.push(parsedLimit)
      }
    }

    const result = await pool.query(sql, queryParams)

    // Ambil metadata detail dari kolom yang diekspor
    const exportedColumnsMeta = selectedCols.map((colName) => {
      const colMeta = schema.columns.find((c) => c.name === colName)
      return {
        name: colName,
        label: colMeta ? colMeta.label : colName,
        type: colMeta ? colMeta.type : 'string'
      }
    })

    res.json({
      success: true,
      tableName: schema.tableName,
      label: schema.label,
      totalRows: result.rows.length,
      columns: exportedColumnsMeta,
      data: result.rows
    })
  } catch (error) {
    const statusCode = error.statusCode || 500
    res.status(statusCode).json({ success: false, message: error.message })
  }
}

/**
 * Endpoint GET /api/export/full-db
 * Mengekspor snapshot seluruh isi tabel database untuk keperluan Full Data Backup.
 */
export async function exportFullDatabase(req, res) {
  try {
    const tableKeys = Object.keys(TABLE_SCHEMAS)
    const backupData = {}
    const metadata = {
      exportedAt: new Date().toISOString(),
      system: 'IT Asset Monitoring System',
      tablesCount: tableKeys.length,
      totalRecords: 0
    }

    for (const key of tableKeys) {
      const schema = TABLE_SCHEMAS[key]
      try {
        const result = await pool.query(`SELECT * FROM ${schema.tableName} ORDER BY 1 ASC`)
        backupData[key] = {
          label: schema.label,
          rowCount: result.rows.length,
          data: result.rows
        }
        metadata.totalRecords += result.rows.length
      } catch (err) {
        backupData[key] = {
          label: schema.label,
          rowCount: 0,
          data: [],
          error: 'Tabel tidak ditemukan / kosong'
        }
      }
    }

    res.json({
      success: true,
      metadata,
      tables: backupData
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
