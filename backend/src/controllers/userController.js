import { pool } from '../config/database.js'

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

export async function listUsers(req, res) {
  const result = await pool.query(
    `SELECT id, nama, email, role, is_active, dibuat_pada, diperbarui_pada
       FROM users
      ORDER BY id DESC`
  )
  res.json(result.rows)
}

export async function storeUser(req, res) {
  const { nama, email, password, role } = req.body
  const currentUserRole = req.user.role ? req.user.role.trim().toLowerCase() : ''
  const newRole = (role || 'user').trim().toLowerCase()

  if (currentUserRole === 'admin' && (newRole === 'superadmin' || newRole === 'super admin')) {
    throw createHttpError(403, 'Admin tidak dapat membuat akun superadmin.')
  }

  if (!nama || !email || !password) {
    throw createHttpError(400, 'Nama, email, dan password wajib diisi.')
  }

  const result = await pool.query(
    `INSERT INTO users (nama, email, password, role, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, nama, email, role, is_active, dibuat_pada, diperbarui_pada`,
    [
      String(nama).trim(),
      String(email).trim().toLowerCase(),
      String(password),
      role || 'user',
      true
    ]
  )

  res.status(201).json(result.rows[0])
}

export async function replaceUser(req, res) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    throw createHttpError(400, 'ID pengguna tidak valid.')
  }

  const currentUserRole = req.user.role ? req.user.role.trim().toLowerCase() : ''
  const oldUserResult = await pool.query('SELECT * FROM users WHERE id = $1', [id])
  if (oldUserResult.rowCount === 0) {
    throw createHttpError(404, 'Pengguna tidak ditemukan.')
  }
  const oldUser = oldUserResult.rows[0]
  const oldRole = oldUser.role.trim().toLowerCase()

  // Admin tidak bisa edit super admin
  if (currentUserRole === 'admin' && (oldRole === 'superadmin' || oldRole === 'super admin')) {
    throw createHttpError(403, 'Admin tidak dapat mengubah akun superadmin.')
  }

  let { nama, email, password, role, is_active } = req.body

  // Admin hanya bisa ganti password
  if (currentUserRole === 'admin') {
    nama = oldUser.nama
    email = oldUser.email
    role = oldUser.role
    is_active = oldUser.is_active
  } else {
    // Validasi untuk Superadmin
    if (!nama || !email) {
      throw createHttpError(400, 'Nama dan email wajib diisi.')
    }
  }

  // Superadmin account tidak bisa dinonaktifkan
  if (oldRole === 'superadmin' || oldRole === 'super admin' || (role || '').trim().toLowerCase() === 'superadmin') {
    is_active = true
  } else {
    is_active = is_active !== false
  }

  let result
  if (password && String(password).trim() !== '') {
    result = await pool.query(
      `UPDATE users
          SET nama = $1, email = $2, password = $3, role = $4, is_active = $5, diperbarui_pada = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING id, nama, email, role, is_active, dibuat_pada, diperbarui_pada`,
      [
        String(nama).trim(),
        String(email).trim().toLowerCase(),
        String(password),
        role || 'user',
        is_active,
        id
      ]
    )
  } else {
    result = await pool.query(
      `UPDATE users
          SET nama = $1, email = $2, role = $3, is_active = $4, diperbarui_pada = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING id, nama, email, role, is_active, dibuat_pada, diperbarui_pada`,
      [
        String(nama).trim(),
        String(email).trim().toLowerCase(),
        role || 'user',
        is_active,
        id
      ]
    )
  }

  res.json(result.rows[0])
}

export async function destroyUser(req, res) {
  const currentUserRole = req.user.role ? req.user.role.trim().toLowerCase() : ''
  if (currentUserRole === 'admin') {
    throw createHttpError(403, 'Admin tidak memiliki akses untuk menghapus pengguna.')
  }

  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    throw createHttpError(400, 'ID pengguna tidak valid.')
  }

  // Prevent deleting superadmin
  const oldUserResult = await pool.query('SELECT role FROM users WHERE id = $1', [id])
  if (oldUserResult.rowCount > 0) {
    const oldRole = oldUserResult.rows[0].role.trim().toLowerCase()
    if (oldRole === 'superadmin' || oldRole === 'super admin') {
      throw createHttpError(403, 'Akun superadmin tidak dapat dihapus.')
    }
  }

  const result = await pool.query(
    'DELETE FROM users WHERE id = $1 RETURNING id',
    [id]
  )

  if (result.rowCount === 0) {
    throw createHttpError(404, 'Pengguna tidak ditemukan.')
  }

  res.json({ message: 'Pengguna berhasil dihapus.' })
}
