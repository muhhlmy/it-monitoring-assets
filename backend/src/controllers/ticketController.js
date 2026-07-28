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
      kategori VARCHAR(100) DEFAULT 'IT',
      prioritas VARCHAR(30) DEFAULT 'Medium (3d)',
      status_tiket VARCHAR(30) DEFAULT 'Open',
      assigned_to VARCHAR(150),
      pelapor VARCHAR(150),
      attachment TEXT,
      dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      diperbarui_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS log_riwayat_tiket (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      id_tiket BIGINT NOT NULL,
      nomor_tiket VARCHAR(50),
      aksi VARCHAR(50) NOT NULL,
      perubahan TEXT NOT NULL,
      oleh_pengguna VARCHAR(150) NOT NULL,
      dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS komentar_tiket (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      id_tiket BIGINT NOT NULL,
      nama_pengguna VARCHAR(150) NOT NULL,
      role_pengguna VARCHAR(50),
      pesan TEXT NOT NULL,
      attachment TEXT,
      dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Ensure attachment column exists if table was created previously without it
  await pool.query(`
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS attachment TEXT;
  `)

  // Check if seed data exists
  const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM tickets')
  if (countResult.rows[0].count === 0) {
    await pool.query(`
      INSERT INTO tickets (nomor_tiket, judul, deskripsi, kategori, prioritas, status_tiket, assigned_to, pelapor)
      VALUES 
        ('TCK-2026-001', 'Layar Laptop Lenovo Blinking', 'Layar berkedip saat membuka aplikasi grafis tinggi.', 'IT', 'High (1day)', 'Open', NULL, 'Helmy Karyawan'),
        ('TCK-2026-002', 'Koneksi Server Database Terputus', 'Server DB Pluit tidak bisa di-ping dari segmen kantor.', 'IT', 'Urgent (4h)', 'Pending', 'Admin IT', 'Budi Santoso'),
        ('TCK-2026-003', 'Pengajuan Kartu Access Ruangan Baru', 'Permintaan fisik kartu akses pintu utama kantor.', 'GA', 'Low (7d)', 'Closed', 'Staff GA', 'Siti Rahma'),
        ('TCK-2026-004', 'Pengajuan Cuti & Update Data Karyawan', 'Pembaruan data BPJS Kesehatan di portal portal HR.', 'HR', 'Medium (3d)', 'Open', NULL, 'Ahmad Rizki'),
        ('TCK-2026-005', 'Ganti Battery Laptop Dell', 'Baterai laptop Dell Inspiron sudah drop dan melendung.', 'IT', 'High (1day)', 'Closed', 'Admin IT', 'Dewi Lestari');
    `)

    // Seed sample audit log
    await pool.query(`
      INSERT INTO log_riwayat_tiket (id_tiket, nomor_tiket, aksi, perubahan, oleh_pengguna)
      VALUES 
        (1, 'TCK-2026-001', 'PEMBUATAN', 'Tiket baru ''Layar Laptop Lenovo Blinking'' berhasil dibuat.', 'Helmy Karyawan'),
        (2, 'TCK-2026-002', 'PEMBUATAN', 'Tiket baru ''Koneksi Server Database Terputus'' berhasil dibuat.', 'Budi Santoso'),
        (2, 'TCK-2026-002', 'PENUGASAN', 'Ditugaskan penanganan kepada Admin IT.', 'Budi Santoso');
    `)

    // Seed sample comments
    await pool.query(`
      INSERT INTO komentar_tiket (id_tiket, nama_pengguna, role_pengguna, pesan)
      VALUES 
        (1, 'Helmy Karyawan', 'user', 'Halo Tim IT, mohon dibantu ya. Kedipnya parah saat buka CAD.'),
        (1, 'Admin IT', 'super admin', 'Siap Pak Helmy, sedang disiapkan unit pengganti sementara.');
    `)
  }

  isTableChecked = true
}

async function addTicketLog(id_tiket, nomor_tiket, aksi, perubahan, oleh_pengguna) {
  try {
    await pool.query(
      `INSERT INTO log_riwayat_tiket (id_tiket, nomor_tiket, aksi, perubahan, oleh_pengguna)
       VALUES ($1, $2, $3, $4, $5)`,
      [id_tiket, nomor_tiket, aksi, perubahan, oleh_pengguna || 'Sistem']
    )
  } catch (err) {
    console.error('Gagal mencatat log riwayat tiket:', err)
  }
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

export async function getTicketHistory(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    throw createHttpError(400, 'ID tiket tidak valid.')
  }

  const result = await pool.query(
    'SELECT * FROM log_riwayat_tiket WHERE id_tiket = $1 ORDER BY id DESC',
    [id]
  )
  res.json(result.rows)
}

export async function getTicketComments(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    throw createHttpError(400, 'ID tiket tidak valid.')
  }

  const result = await pool.query(
    'SELECT * FROM komentar_tiket WHERE id_tiket = $1 ORDER BY id ASC',
    [id]
  )
  res.json(result.rows)
}

export async function createTicketComment(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    throw createHttpError(400, 'ID tiket tidak valid.')
  }

  const { pesan, attachment, nama_pengguna, role_pengguna } = req.body

  if (!pesan || !String(pesan).trim()) {
    throw createHttpError(400, 'Pesan komentar wajib diisi.')
  }

  const userNama = nama_pengguna || req.user?.nama || 'User'
  const userRole = role_pengguna || req.user?.role || 'user'

  const result = await pool.query(
    `INSERT INTO komentar_tiket (id_tiket, nama_pengguna, role_pengguna, pesan, attachment)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, userNama, userRole, String(pesan).trim(), attachment || null]
  )

  res.status(201).json(result.rows[0])
}

export async function createTicket(req, res) {
  await ensureTicketsTableExists()
  const { judul, deskripsi, kategori, prioritas, status_tiket, assigned_to, pelapor, attachment } = req.body

  if (!judul) {
    throw createHttpError(400, 'Judul tiket wajib diisi.')
  }

  // Generate unique nomor_tiket
  const countRes = await pool.query('SELECT COUNT(*)::int AS count FROM tickets')
  const seq = String(countRes.rows[0].count + 1).padStart(3, '0')
  const nomor_tiket = `TCK-${new Date().getFullYear()}-${seq}`

  const assignedVal = assigned_to && String(assigned_to).trim() ? String(assigned_to).trim() : null
  const pelaporVal = pelapor && String(pelapor).trim() ? String(pelapor).trim() : (req.user?.nama || 'User')

  const result = await pool.query(
    `INSERT INTO tickets (nomor_tiket, judul, deskripsi, kategori, prioritas, status_tiket, assigned_to, pelapor, attachment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      nomor_tiket,
      String(judul).trim(),
      deskripsi || '',
      kategori || 'IT',
      prioritas || 'Medium (3d)',
      status_tiket || 'Open',
      assignedVal,
      pelaporVal,
      attachment || null
    ]
  )

  const newTicket = result.rows[0]

  // Add audit log
  await addTicketLog(
    newTicket.id,
    newTicket.nomor_tiket,
    'PEMBUATAN',
    `Tiket baru '${newTicket.judul}' berhasil dibuat. Kategori: ${newTicket.kategori}, Prioritas: ${newTicket.prioritas}`,
    pelaporVal
  )

  res.status(201).json(newTicket)
}

export async function updateTicket(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    throw createHttpError(400, 'ID tiket tidak valid.')
  }

  const { judul, deskripsi, kategori, prioritas, status_tiket, assigned_to, pelapor, attachment } = req.body

  const check = await pool.query('SELECT * FROM tickets WHERE id = $1', [id])
  if (check.rowCount === 0) {
    throw createHttpError(404, 'Tiket tidak ditemukan.')
  }

  const oldTicket = check.rows[0]
  const assignedVal = assigned_to !== undefined 
    ? (assigned_to && String(assigned_to).trim() ? String(assigned_to).trim() : null)
    : oldTicket.assigned_to

  const result = await pool.query(
    `UPDATE tickets
        SET judul = COALESCE($1, judul),
            deskripsi = COALESCE($2, deskripsi),
            kategori = COALESCE($3, kategori),
            prioritas = COALESCE($4, prioritas),
            status_tiket = COALESCE($5, status_tiket),
            assigned_to = $6,
            pelapor = COALESCE($7, pelapor),
            attachment = COALESCE($8, attachment),
            diperbarui_pada = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *`,
    [judul, deskripsi, kategori, prioritas, status_tiket, assignedVal, pelapor, attachment !== undefined ? attachment : oldTicket.attachment, id]
  )

  const updatedTicket = result.rows[0]

  // Build detailed change summary for audit log
  const changes = []

  if (judul !== undefined && judul !== null && String(judul).trim() !== oldTicket.judul) {
    changes.push(`Judul diubah dari '${oldTicket.judul || '-'}' menjadi '${String(judul).trim()}'`)
  }

  if (deskripsi !== undefined && deskripsi !== null && deskripsi !== oldTicket.deskripsi) {
    const oldDesc = oldTicket.deskripsi ? `'${oldTicket.deskripsi}'` : '(kosong)'
    const newDesc = deskripsi ? `'${deskripsi}'` : '(kosong)'
    changes.push(`Deskripsi rincian diubah dari ${oldDesc} menjadi ${newDesc}`)
  }

  if (kategori !== undefined && kategori !== null && kategori !== oldTicket.kategori) {
    changes.push(`Kategori diubah dari '${oldTicket.kategori || '-'}' menjadi '${kategori}'`)
  }

  if (prioritas !== undefined && prioritas !== null && prioritas !== oldTicket.prioritas) {
    changes.push(`Prioritas SLA diubah dari '${oldTicket.prioritas || '-'}' menjadi '${prioritas}'`)
  }

  if (status_tiket !== undefined && status_tiket !== null && status_tiket !== oldTicket.status_tiket) {
    changes.push(`Status tiket diubah dari '${oldTicket.status_tiket || '-'}' menjadi '${status_tiket}'`)
  }

  if (assignedVal !== oldTicket.assigned_to) {
    const oldAssign = oldTicket.assigned_to || 'Belum ditugaskan'
    const newAssign = assignedVal || 'Belum ditugaskan'
    changes.push(`Petugas IT (Assigned) diubah dari '${oldAssign}' menjadi '${newAssign}'`)
  }

  if (pelapor !== undefined && pelapor !== null && pelapor !== oldTicket.pelapor) {
    changes.push(`Nama Pelapor diubah dari '${oldTicket.pelapor || '-'}' menjadi '${pelapor}'`)
  }

  const newAttachment = attachment !== undefined ? attachment : oldTicket.attachment
  if (newAttachment !== oldTicket.attachment) {
    if (!oldTicket.attachment && newAttachment) {
      changes.push(`Lampiran gambar kendala baru ditambahkan`)
    } else if (oldTicket.attachment && !newAttachment) {
      changes.push(`Lampiran gambar kendala telah dihapus`)
    } else {
      changes.push(`Lampiran gambar kendala diperbarui`)
    }
  }

  let aksi = 'UPDATE_DETAIL'
  if (status_tiket && status_tiket !== oldTicket.status_tiket) {
    aksi = 'PERUBAHAN_STATUS'
  } else if (assignedVal !== oldTicket.assigned_to) {
    aksi = 'PENUGASAN'
  } else if (newAttachment !== oldTicket.attachment) {
    aksi = 'LAMPIRAN'
  }

  const currentUser = req.user?.nama || pelapor || 'Admin'
  const logText = changes.length > 0 ? changes.join('. ') : 'Detail tiket diperbarui'

  await addTicketLog(id, oldTicket.nomor_tiket, aksi, logText, currentUser)

  res.json(updatedTicket)
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


