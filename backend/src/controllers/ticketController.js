import { pool } from '../config/database.js'

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

let isTableChecked = false

export async function ensureTicketsTableExists() {
  if (isTableChecked) return

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nomor_tiket VARCHAR(50) UNIQUE,
      judul VARCHAR(255) NOT NULL,
      deskripsi TEXT,
      kategori VARCHAR(100) DEFAULT 'Hardware',
      prioritas VARCHAR(30) DEFAULT 'Medium',
      status_tiket VARCHAR(30) DEFAULT 'Open',
      assigned_to VARCHAR(150),
      pelapor VARCHAR(150),
      dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      diperbarui_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Check if seed data exists
  const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM tickets')
  if (countResult.rows[0].count === 0) {
    await pool.query(`
      INSERT INTO tickets (nomor_tiket, judul, deskripsi, kategori, prioritas, status_tiket, assigned_to, pelapor)
      VALUES 
        ('TCK-2026-001', 'Layar Laptop Lenovo Blinking', 'Layar berkedip saat membuka aplikasi grafis tinggi.', 'Hardware', 'High', 'Open', 'Admin IT', 'Helmy Karyawan'),
        ('TCK-2026-002', 'Koneksi Server Database Terputus', 'Server DB Pluit tidak bisa di-ping dari segmen kantor.', 'Network', 'Urgent', 'Pending', 'Admin IT', 'Budi Santoso'),
        ('TCK-2026-003', 'Permintaan Printer Toner Baru', 'Toner hitam printer HP LaserJet Pro R740 habis.', 'Peripheral', 'Low', 'Closed', 'Admin IT', 'Siti Rahma'),
        ('TCK-2026-004', 'Installasi Software CAD Design', 'Pengajuan lisensi dan install software CAD di laptop baru.', 'Software', 'Medium', 'Open', 'Admin IT', 'Ahmad Rizki'),
        ('TCK-2026-005', 'Ganti Battery Laptop Dell', 'Baterai laptop Dell Inspiron sudah drop dan melendung.', 'Hardware', 'High', 'Closed', 'Admin IT', 'Dewi Lestari');
    `)
  }

  isTableChecked = true
}

export async function listTickets(req, res) {
  await ensureTicketsTableExists()
  const { search, status, prioritas } = req.query

  let sql = 'SELECT * FROM tickets WHERE 1=1'
  const params = []

  if (search) {
    params.push(`%${search}%`)
    sql += ` AND (judul ILIKE $${params.length} OR nomor_tiket ILIKE $${params.length} OR pelapor ILIKE $${params.length} OR assigned_to ILIKE $${params.length})`
  }

  if (status) {
    params.push(status)
    sql += ` AND status_tiket = $${params.length}`
  }

  if (prioritas) {
    params.push(prioritas)
    sql += ` AND prioritas = $${params.length}`
  }

  sql += ' ORDER BY id DESC'

  const result = await pool.query(sql, params)
  res.json(result.rows)
}

export async function getTicketStats(req, res) {
  await ensureTicketsTableExists()

  const countsResult = await pool.query(`
    SELECT 
      COUNT(*)::int AS "totalTickets",
      COUNT(CASE WHEN status_tiket = 'Open' THEN 1 END)::int AS "openTickets",
      COUNT(CASE WHEN status_tiket = 'Pending' THEN 1 END)::int AS "pendingTickets",
      COUNT(CASE WHEN status_tiket = 'Closed' THEN 1 END)::int AS "closedTickets"
    FROM tickets
  `)

  const recentResult = await pool.query(`
    SELECT * FROM tickets ORDER BY id DESC LIMIT 5
  `)

  const stats = countsResult.rows[0] || { totalTickets: 0, openTickets: 0, pendingTickets: 0, closedTickets: 0 }
  stats.recentTickets = recentResult.rows

  res.json(stats)
}

export async function createTicket(req, res) {
  await ensureTicketsTableExists()
  const { judul, deskripsi, kategori, prioritas, status_tiket, assigned_to, pelapor } = req.body

  if (!judul) {
    throw createHttpError(400, 'Judul tiket wajib diisi.')
  }

  // Generate unique nomor_tiket
  const countRes = await pool.query('SELECT COUNT(*)::int AS count FROM tickets')
  const seq = String(countRes.rows[0].count + 1).padStart(3, '0')
  const nomor_tiket = `TCK-${new Date().getFullYear()}-${seq}`

  const result = await pool.query(
    `INSERT INTO tickets (nomor_tiket, judul, deskripsi, kategori, prioritas, status_tiket, assigned_to, pelapor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      nomor_tiket,
      String(judul).trim(),
      deskripsi || '',
      kategori || 'Hardware',
      prioritas || 'Medium',
      status_tiket || 'Open',
      assigned_to || req.user.nama || 'Admin IT',
      pelapor || 'User'
    ]
  )

  res.status(201).json(result.rows[0])
}

export async function updateTicket(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    throw createHttpError(400, 'ID tiket tidak valid.')
  }

  const { judul, deskripsi, kategori, prioritas, status_tiket, assigned_to, pelapor } = req.body

  const check = await pool.query('SELECT * FROM tickets WHERE id = $1', [id])
  if (check.rowCount === 0) {
    throw createHttpError(404, 'Tiket tidak ditemukan.')
  }

  const result = await pool.query(
    `UPDATE tickets
        SET judul = COALESCE($1, judul),
            deskripsi = COALESCE($2, deskripsi),
            kategori = COALESCE($3, kategori),
            prioritas = COALESCE($4, prioritas),
            status_tiket = COALESCE($5, status_tiket),
            assigned_to = COALESCE($6, assigned_to),
            pelapor = COALESCE($7, pelapor),
            diperbarui_pada = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *`,
    [judul, deskripsi, kategori, prioritas, status_tiket, assigned_to, pelapor, id]
  )

  res.json(result.rows[0])
}

export async function deleteTicket(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    throw createHttpError(400, 'ID tiket tidak valid.')
  }

  const result = await pool.query('DELETE FROM tickets WHERE id = $1 RETURNING id', [id])

  if (result.rowCount === 0) {
    throw createHttpError(404, 'Tiket tidak ditemukan.')
  }

  res.json({ message: 'Tiket berhasil dihapus.' })
}
