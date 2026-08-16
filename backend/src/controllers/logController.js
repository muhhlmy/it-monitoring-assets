import { pool } from '../config/database.js'

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

export async function listAssetLogs(req, res) {
  const result = await pool.query(
    `SELECT id, id_aset, label_aset, aksi, perubahan, oleh_pengguna, dibuat_pada
       FROM log_riwayat_aset
      ORDER BY id DESC`
  )
  res.json(result.rows)
}

export async function listAssetLogsByDevice(req, res) {
  try {
    const idAset = parseInt(req.params.id, 10)
    if (isNaN(idAset)) {
      throw createHttpError(400, 'ID aset tidak valid.')
    }

    // 1. Audit logs from log_riwayat_aset
    const auditLogsResult = await pool.query(
      `SELECT id, id_aset, label_aset, aksi, perubahan, oleh_pengguna, dibuat_pada
         FROM log_riwayat_aset
        WHERE id_aset = $1
        ORDER BY id DESC`,
      [idAset]
    )

    // 2. Usage history from riwayat_pemakaian_aset JOIN karyawan
    const usageLogsResult = await pool.query(
      `SELECT rpa.id, rpa.id_aset, rpa.nik_pemegang, rpa.tanggal_mulai, rpa.tanggal_selesai, rpa.catatan,
              k.nama_karyawan, k.departemen
         FROM riwayat_pemakaian_aset rpa
         LEFT JOIN karyawan k ON rpa.nik_pemegang = k.nik
        WHERE rpa.id_aset = $1
        ORDER BY rpa.id DESC`,
      [idAset]
    )

    // 3. Asset basic info fallback
    const assetResult = await pool.query(
      `SELECT id, hostname, serial_number, created_at, status, kondisi,
              nama_karyawan_pemegang_asset, nik_pemegang_asset
         FROM aset_ti
        WHERE id = $1`,
      [idAset]
    )
    const asset = assetResult.rows[0]

    const combined = []

    // Audit logs
    for (const log of auditLogsResult.rows) {
      combined.push({
        id: `audit-${log.id}`,
        id_aset: log.id_aset,
        label_aset: log.label_aset,
        aksi: log.aksi,
        perubahan: log.perubahan,
        oleh_pengguna: log.oleh_pengguna,
        dibuat_pada: log.dibuat_pada,
      })
    }

    // Usage cycle logs
    for (const usage of usageLogsResult.rows) {
      const isEnd = Boolean(usage.tanggal_selesai)
      const empName = usage.nama_karyawan || usage.nik_pemegang || 'Karyawan'
      combined.push({
        id: `usage-${usage.id}`,
        id_aset: usage.id_aset,
        label_aset: asset?.hostname || `Aset #${idAset}`,
        aksi: isEnd ? 'UBAH' : 'TAMBAH',
        perubahan: isEnd
          ? `Aset dikembalikan dari ${empName} (NIK: ${usage.nik_pemegang}). ${usage.catatan || ''}`
          : `Aset dialokasikan / ditugaskan kepada ${empName} (NIK: ${usage.nik_pemegang}). ${usage.catatan || ''}`,
        oleh_pengguna: 'Sistem',
        dibuat_pada: usage.tanggal_mulai,
      })
    }

    // Initial fallback log
    if (combined.length === 0 && asset) {
      combined.push({
        id: `init-${asset.id}`,
        id_aset: asset.id,
        label_aset: asset.hostname,
        aksi: 'TAMBAH',
        perubahan: `Aset baru didaftarkan dengan nomor seri ${asset.serial_number}, status: ${asset.status}, kondisi: ${asset.kondisi}.`,
        oleh_pengguna: 'Sistem',
        dibuat_pada: asset.created_at,
      })
    }

    // Sort descending
    combined.sort((a, b) => new Date(b.dibuat_pada) - new Date(a.dibuat_pada))

    res.json(combined)
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    console.error('Error fetching asset logs:', error)
    res.status(500).json({ error: 'Gagal mengambil riwayat log aset.' })
  }
}

export async function listLoginLogs(req, res) {
  try {
    const result = await pool.query(
      `SELECT l.id,
              COALESCE(u.nama, l.email, 'Pengguna') AS nama_pengguna,
              l.email,
              'LOGIN' AS aktifitas,
              COALESCE(l.ip_address, '—') AS ip_address,
              COALESCE(l.user_agent, '—') AS browser,
              COALESCE(l.login_time, l.created_at) AS dibuat_pada
         FROM log_audit_login l
         LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.id DESC`
    )
    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching login logs:', error)
    res.status(500).json({ error: 'Gagal mengambil log audit login.' })
  }
}
