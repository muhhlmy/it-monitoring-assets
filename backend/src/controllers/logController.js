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
