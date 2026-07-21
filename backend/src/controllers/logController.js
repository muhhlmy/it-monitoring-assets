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
  const idAset = parseInt(req.params.id, 10)
  if (isNaN(idAset)) {
    throw createHttpError(400, 'ID aset tidak valid.')
  }

  const result = await pool.query(
    `SELECT id, id_aset, label_aset, aksi, perubahan, oleh_pengguna, dibuat_pada
       FROM log_riwayat_aset
      WHERE id_aset = $1
      ORDER BY id DESC`,
    [idAset]
  )
  res.json(result.rows)
}

export async function listLoginLogs(req, res) {
  const result = await pool.query(
    `SELECT id, nama_pengguna, email, aktifitas, ip_address, browser, dibuat_pada
       FROM log_audit_login
      ORDER BY id DESC`
  )
  res.json(result.rows)
}

export async function storeLoginLog(req, res) {
  const { nama_pengguna, email, aktifitas, ip_address, browser } = req.body

  if (!nama_pengguna || !email || !aktifitas) {
    throw createHttpError(400, 'Nama pengguna, email, dan aktifitas wajib diisi.')
  }

  const result = await pool.query(
    `INSERT INTO log_audit_login (nama_pengguna, email, aktifitas, ip_address, browser)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, nama_pengguna, email, aktifitas, ip_address, browser, dibuat_pada`,
    [
      String(nama_pengguna).trim(),
      String(email).trim().toLowerCase(),
      String(aktifitas).trim(),
      ip_address || req.ip || '127.0.0.1',
      browser || req.headers['user-agent'] || 'Unknown'
    ]
  )

  res.status(201).json(result.rows[0])
}
