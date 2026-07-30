import { pool } from '../config/database.js'

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

const SUPERADMIN_PERMISSIONS = {
  dashboard: 'full',
  assets: 'full',
  my_assets: 'full',
  tickets: 'full',
  submissions: 'full',
  users: 'full',
  logs: 'full',
  karyawan: 'full',
  export: 'full'
}

const DEFAULT_USER_PERMISSIONS = {
  dashboard: 'none',
  assets: 'none',
  my_assets: 'read_only',
  tickets: 'read_only',
  submissions: 'none',
  users: 'none',
  logs: 'none',
  karyawan: 'none',
  export: 'none'
}

function normaliseLegacyPermissions(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_USER_PERMISSIONS }
  const KEYS = Object.keys(DEFAULT_USER_PERMISSIONS)
  const out = {}
  for (const k of KEYS) {
    const v = raw[k]
    if (v === 'none' || v === 'read_only' || v === 'full') {
      out[k] = v
    } else if (v === true) {
      out[k] = 'read_only'
    } else {
      out[k] = 'none'
    }
  }
  return out
}

let isUserPermissionsChecked = false
async function ensureUsersPermissionsColumnExists() {
  if (isUserPermissionsChecked) return
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"dashboard":"none","assets":"none","my_assets":"read_only","tickets":"read_only","submissions":"none","users":"none","logs":"none","karyawan":"none"}'::jsonb;
    `)
    isUserPermissionsChecked = true
  } catch (err) {
    console.error('Gagal memastikan kolom permissions pada tabel users:', err)
  }
}

// Helper untuk sync mapping user_ticket_queues
async function syncUserQueues(userId, queueIds) {
  if (!Array.isArray(queueIds)) return
  await pool.query('DELETE FROM user_ticket_queues WHERE user_id = $1', [userId])
  for (const qId of queueIds) {
    const validId = parseInt(qId, 10)
    if (!isNaN(validId)) {
      await pool.query(
        `INSERT INTO user_ticket_queues (user_id, queue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, validId]
      )
    }
  }
}

export async function listUsers(req, res) {
  await ensureUsersPermissionsColumnExists()

  const result = await pool.query(
    `SELECT u.id, u.nama, u.email, u.role, u.permissions, u.is_active, u.dibuat_pada, u.diperbarui_pada,
            COALESCE(
              JSON_AGG(
                JSON_BUILD_OBJECT('id', q.id, 'kode', q.kode, 'nama', q.nama)
              ) FILTER (WHERE q.id IS NOT NULL), '[]'
            ) AS queues
       FROM users u
       LEFT JOIN user_ticket_queues utq ON utq.user_id = u.id
       LEFT JOIN ticket_queues q ON q.id = utq.queue_id AND q.is_active = true
      GROUP BY u.id
      ORDER BY u.id DESC`
  )

  const rows = result.rows.map(user => {
    const isSuper = (user.role || '').trim().toLowerCase().includes('admin')
    user.permissions = isSuper
      ? SUPERADMIN_PERMISSIONS
      : normaliseLegacyPermissions(user.permissions)
    user.queue_ids = (user.queues || []).map(q => q.id)
    return user
  })
  res.json(rows)
}

export async function storeUser(req, res) {
  await ensureUsersPermissionsColumnExists()
  const { nama, email, password, role, permissions, queue_ids } = req.body
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
    : normaliseLegacyPermissions(permissions)

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

  const newUser = result.rows[0]
  if (Array.isArray(queue_ids)) {
    await syncUserQueues(newUser.id, queue_ids)
  }

  // Fetch updated queue mapping
  const qResult = await pool.query(
    `SELECT q.id, q.kode, q.nama FROM user_ticket_queues utq JOIN ticket_queues q ON q.id = utq.queue_id WHERE utq.user_id = $1`,
    [newUser.id]
  )
  newUser.queues = qResult.rows
  newUser.queue_ids = qResult.rows.map(q => q.id)

  res.status(201).json(newUser)
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

  let { nama, email, password, role, permissions, is_active, queue_ids } = req.body

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
    : normaliseLegacyPermissions(permissions || oldUser.permissions)

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

  const updatedUser = result.rows[0]
  if (Array.isArray(queue_ids)) {
    await syncUserQueues(updatedUser.id, queue_ids)
  }

  // Fetch updated queue mapping
  const qResult = await pool.query(
    `SELECT q.id, q.kode, q.nama FROM user_ticket_queues utq JOIN ticket_queues q ON q.id = utq.queue_id WHERE utq.user_id = $1`,
    [updatedUser.id]
  )
  updatedUser.queues = qResult.rows
  updatedUser.queue_ids = qResult.rows.map(q => q.id)

  res.json(updatedUser)
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

  const oldUserResult = await pool.query('SELECT role FROM users WHERE id = $1', [id])
  if (oldUserResult.rowCount > 0) {
    const oldRole = oldUserResult.rows[0].role.trim().toLowerCase()
    if (oldRole === 'superadmin' || oldRole === 'super admin') {
      throw createHttpError(403, 'Akun superadmin tidak dapat dihapus.')
    }
  }

  const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id])
  if (result.rowCount === 0) throw createHttpError(404, 'Pengguna tidak ditemukan.')

  res.json({ message: 'Pengguna berhasil dihapus.' })
}
