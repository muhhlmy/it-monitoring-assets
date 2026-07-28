import { pool } from '../config/database.js'

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

const SUPERADMIN_PERMISSIONS = {
  dashboard: true,
  assets: true,
  my_assets: true,
  tickets: true,
  submissions: true,
  users: true,
  logs: true,
  karyawan: true
}

const DEFAULT_USER_PERMISSIONS = {
  dashboard: false,
  assets: false,
  my_assets: true,
  tickets: true,
  submissions: false,
  users: false,
  logs: false,
  karyawan: false
}

let isUserPermissionsChecked = false
async function ensureUsersPermissionsColumnExists() {
  if (isUserPermissionsChecked) return
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"dashboard":false,"assets":false,"my_assets":true,"tickets":true,"submissions":false,"users":false,"logs":false,"karyawan":false}'::jsonb;
    `)
    isUserPermissionsChecked = true
  } catch (err) {
    console.error('Gagal memastikan kolom permissions pada tabel users:', err)
  }
}

export async function listUsers(req, res) {
  await ensureUsersPermissionsColumnExists()
  const result = await pool.query(
    `SELECT id, nama, email, role, permissions, is_active, dibuat_pada, diperbarui_pada
       FROM users
      ORDER BY id DESC`
  )
  const rows = result.rows.map(user => {
    const isSuper = (user.role || '').trim().toLowerCase().includes('admin')
    user.permissions = isSuper
      ? SUPERADMIN_PERMISSIONS
      : (typeof user.permissions === 'object' && user.permissions !== null ? user.permissions : DEFAULT_USER_PERMISSIONS)
    return user
  })
  res.json(rows)
}

export async function storeUser(req, res) {
  await ensureUsersPermissionsColumnExists()
  const { nama, email, password, role, permissions } = req.body
  const currentUserRole = req.user.role ? req.user.role.trim().toLowerCase() : ''
  const newRole = (role || 'user').trim().toLowerCase()

  if (currentUserRole !== 'superadmin' && currentUserRole !== 'super admin' && (newRole === 'superadmin' || newRole === 'super admin')) {
    throw createHttpError(403, 'Hanya superadmin yang dapat membuat akun superadmin.')
  }

  if (!nama || !email || !password) {
    throw createHttpError(400, 'Nama, email, dan password wajib diisi.')
  }

  const isSuper = newRole === 'superadmin' || newRole === 'super admin'
  const userPermissions = isSuper
    ? SUPERADMIN_PERMISSIONS
    : (typeof permissions === 'object' && permissions !== null ? permissions : DEFAULT_USER_PERMISSIONS)

  const result = await pool.query(
    `INSERT INTO users (nama, email, password, role, permissions, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, nama, email, role, permissions, is_active, dibuat_pada, diperbarui_pada`,
    [
      String(nama).trim(),
      String(email).trim().toLowerCase(),
      String(password),
      role || 'user',
      JSON.stringify(userPermissions),
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

  if (currentUserRole !== 'superadmin' && currentUserRole !== 'super admin' && (oldRole === 'superadmin' || oldRole === 'super admin')) {
    throw createHttpError(403, 'Hanya superadmin yang dapat mengubah akun superadmin.')
  }

  let { nama, email, password, role, permissions, is_active } = req.body

  if (!nama || !email) {
    throw createHttpError(400, 'Nama dan email wajib diisi.')
  }

  if (oldRole === 'superadmin' || oldRole === 'super admin' || (role || '').trim().toLowerCase() === 'superadmin') {
    is_active = true
  } else {
    is_active = is_active !== false
  }

  const isSuper = (role || oldUser.role).trim().toLowerCase().includes('admin')
  const userPermissions = isSuper
    ? SUPERADMIN_PERMISSIONS
    : (typeof permissions === 'object' && permissions !== null ? permissions : (oldUser.permissions || DEFAULT_USER_PERMISSIONS))

  let result
  if (password && String(password).trim() !== '') {
    result = await pool.query(
      `UPDATE users
          SET nama = $1, email = $2, password = $3, role = $4, permissions = $5, is_active = $6, diperbarui_pada = CURRENT_TIMESTAMP
        WHERE id = $7
        RETURNING id, nama, email, role, permissions, is_active, dibuat_pada, diperbarui_pada`,
      [
        String(nama).trim(),
        String(email).trim().toLowerCase(),
        String(password),
        role || 'user',
        JSON.stringify(userPermissions),
        is_active,
        id
      ]
    )
  } else {
    result = await pool.query(
      `UPDATE users
          SET nama = $1, email = $2, role = $3, permissions = $4, is_active = $5, diperbarui_pada = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING id, nama, email, role, permissions, is_active, dibuat_pada, diperbarui_pada`,
      [
        String(nama).trim(),
        String(email).trim().toLowerCase(),
        role || 'user',
        JSON.stringify(userPermissions),
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
