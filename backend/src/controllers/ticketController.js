import { pool } from '../config/database.js'
import { ensureQueueTablesExist } from './queueController.js'
import { addSseClient, broadcastEvent } from '../services/realtimeService.js'

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

const isSuperAdmin = (role) => {
  const r = (role || '').trim().toLowerCase()
  return r === 'superadmin' || r === 'super admin'
}

// ── Ensure base tickets tables exist ──────────────────────────
let isTableChecked = false

export async function ensureTicketsTableExists() {
  if (isTableChecked) return

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nomor_tiket     VARCHAR(50) UNIQUE,
      judul           VARCHAR(255) NOT NULL,
      deskripsi       TEXT,
      kategori        VARCHAR(100) DEFAULT 'IT',
      prioritas       VARCHAR(30)  DEFAULT 'Medium (3d)',
      status_tiket    VARCHAR(30)  DEFAULT 'Open',
      assigned_to     VARCHAR(150),
      pelapor         VARCHAR(150),
      attachment      TEXT,
      dibuat_pada     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      diperbarui_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS log_riwayat_tiket (
      id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      id_tiket      BIGINT NOT NULL,
      nomor_tiket   VARCHAR(50),
      aksi          VARCHAR(50) NOT NULL,
      perubahan     TEXT NOT NULL,
      oleh_pengguna VARCHAR(150) NOT NULL,
      dibuat_pada   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS komentar_tiket (
      id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      id_tiket      BIGINT NOT NULL,
      nama_pengguna VARCHAR(150) NOT NULL,
      role_pengguna VARCHAR(50),
      pesan         TEXT NOT NULL,
      attachment    TEXT,
      dibuat_pada   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ticket_casp_ratings (
      id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_id              BIGINT NOT NULL UNIQUE,
      reporter_user_id       BIGINT NULL,
      assignee_user_id       BIGINT NULL,
      reporter_name_snapshot VARCHAR(150) NOT NULL,
      assignee_name_snapshot VARCHAR(150) NOT NULL,
      rating                 SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      feedback               TEXT,
      submitted_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS attachment TEXT;`)
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP NULL;`)
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolved_by_user_id BIGINT NULL;`)

  // Seed data awal jika kosong
  const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM tickets')
  if (countResult.rows[0].count === 0) {
    await pool.query(`
      INSERT INTO tickets (nomor_tiket, judul, deskripsi, kategori, prioritas, status_tiket, assigned_to, pelapor)
      VALUES
        ('TCK-2026-001', 'Layar Laptop Lenovo Blinking', 'Layar berkedip saat membuka aplikasi grafis tinggi.', 'IT', 'High (1day)', 'Open', NULL, 'Helmy Karyawan'),
        ('TCK-2026-002', 'Koneksi Server Database Terputus', 'Server DB tidak bisa di-ping dari segmen kantor.', 'IT', 'Urgent (4h)', 'Pending', 'Admin IT', 'Budi Santoso'),
        ('TCK-2026-003', 'Pengajuan Kartu Access Ruangan', 'Permintaan fisik kartu akses pintu utama kantor.', 'GA', 'Low (7d)', 'Closed', 'Staff GA', 'Siti Rahma'),
        ('TCK-2026-004', 'Pengajuan Cuti & Update Data', 'Pembaruan data BPJS Kesehatan di portal HR.', 'HR', 'Medium (3d)', 'Open', NULL, 'Ahmad Rizki'),
        ('TCK-2026-005', 'Ganti Battery Laptop Dell', 'Baterai laptop Dell Inspiron sudah melendung.', 'IT', 'High (1day)', 'Closed', 'Admin IT', 'Dewi Lestari');
    `)
    await pool.query(`
      INSERT INTO log_riwayat_tiket (id_tiket, nomor_tiket, aksi, perubahan, oleh_pengguna)
      VALUES
        (1, 'TCK-2026-001', 'PEMBUATAN', 'Tiket baru dibuat.', 'Helmy Karyawan'),
        (2, 'TCK-2026-002', 'PEMBUATAN', 'Tiket baru dibuat.', 'Budi Santoso');
    `)
    await pool.query(`
      INSERT INTO komentar_tiket (id_tiket, nama_pengguna, role_pengguna, pesan)
      VALUES
        (1, 'Helmy Karyawan', 'user', 'Mohon dibantu ya. Kedipnya parah saat buka CAD.'),
        (1, 'Admin IT', 'super admin', 'Siap, sedang disiapkan unit pengganti sementara.');
    `)
  }

  isTableChecked = true

  // Jalankan queue migration (idempotent)
  await ensureQueueTablesExist()
}

async function addTicketLog(id_tiket, nomor_tiket, aksi, perubahan, oleh_pengguna) {
  try {
    await pool.query(
      `INSERT INTO log_riwayat_tiket (id_tiket, nomor_tiket, aksi, perubahan, oleh_pengguna) VALUES ($1, $2, $3, $4, $5)`,
      [id_tiket, nomor_tiket, aksi, perubahan, oleh_pengguna || 'Sistem']
    )
  } catch (err) {
    console.error('Gagal mencatat log riwayat tiket:', err)
  }
}

// ── LIST TICKETS (queue-aware) ────────────────────────────────
export async function listTickets(req, res) {
  await ensureTicketsTableExists()
  const { search, status, prioritas, queue_id, tab } = req.query
  const userId = req.user.id
  const userNama = req.user.nama
  const superAdmin = isSuperAdmin(req.user.role)
  const userRole = (req.user.role || '').trim().toLowerCase()
  const isRegularUser = userRole !== 'admin' && userRole !== 'superadmin' && userRole !== 'super admin'

  const params = []
  let conditions = []

  // Access control:
  // Role 'user' (pelapor/karyawan): HANYA melihat tiket yang dilaporkan oleh diri sendiri
  if (isRegularUser) {
    params.push(userId)
    params.push(userNama)
    conditions.push(`(t.pelapor_user_id = $1 OR (t.pelapor_user_id IS NULL AND LOWER(TRIM(t.pelapor)) = LOWER(TRIM($2))))`)
    if (tab === 'open') {
      conditions.push(`t.status_tiket IN ('Open', 'In Progress')`)
    } else if (tab === 'pending') {
      conditions.push(`t.status_tiket = 'Pending'`)
    } else if (tab === 'closed' || tab === 'resolved') {
      conditions.push(`t.status_tiket IN ('Closed', 'Resolved')`)
    }
  } else if (!superAdmin) {
    // Admin (non-superadmin):
    if (tab === 'assigned') {
      // Ditangani Saya: tiket yang di-assign ke saya
      params.push(userId)
      conditions.push(`t.assigned_to_user_id = $${params.length}`)
    } else if (tab === 'reported' || tab === 'created') {
      // Dibuat Saya: tiket yang dilaporkan/dibuat oleh admin ini sendiri
      params.push(userId)
      params.push(userNama)
      conditions.push(`(t.pelapor_user_id = $${params.length - 1} OR (t.pelapor_user_id IS NULL AND t.pelapor = $${params.length}))`)
    } else if (tab === 'mine') {
      // Backward compatibility 'mine' untuk admin = ditangani saya
      params.push(userId)
      conditions.push(`t.assigned_to_user_id = $${params.length}`)
    } else if (tab === 'unassigned') {
      // Unassigned: tiket di queue saya yang belum ada assignee
      params.push(userId)
      conditions.push(`t.assigned_to_user_id IS NULL`)
      conditions.push(`EXISTS (SELECT 1 FROM user_ticket_queues utq WHERE utq.user_id = $${params.length} AND utq.queue_id = t.queue_id)`)
    } else {
      // Default: semua tiket di queue yang di-mapping ke user ini
      params.push(userId)
      conditions.push(`EXISTS (SELECT 1 FROM user_ticket_queues utq WHERE utq.user_id = $${params.length} AND utq.queue_id = t.queue_id)`)
    }
  } else {
    // Superadmin:
    if (tab === 'assigned') {
      params.push(userId)
      conditions.push(`t.assigned_to_user_id = $${params.length}`)
    } else if (tab === 'reported' || tab === 'created') {
      params.push(userId)
      params.push(userNama)
      conditions.push(`(t.pelapor_user_id = $${params.length - 1} OR (t.pelapor_user_id IS NULL AND t.pelapor = $${params.length}))`)
    } else if (tab === 'mine') {
      params.push(userId)
      conditions.push(`t.assigned_to_user_id = $${params.length}`)
    } else if (tab === 'unassigned') {
      conditions.push(`t.assigned_to_user_id IS NULL`)
    }
  }

  if (search) {
    params.push(`%${search}%`)
    const n = params.length
    conditions.push(`(t.judul ILIKE $${n} OR t.nomor_tiket ILIKE $${n} OR t.pelapor ILIKE $${n} OR reporter.nama ILIKE $${n})`)
  }
  if (status) {
    params.push(status)
    conditions.push(`t.status_tiket = $${params.length}`)
  }
  if (prioritas) {
    params.push(prioritas)
    conditions.push(`t.prioritas = $${params.length}`)
  }
  if (queue_id) {
    params.push(parseInt(queue_id, 10))
    conditions.push(`t.queue_id = $${params.length}`)
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

  const sql = `
    SELECT
      t.*,
      q.kode   AS queue_kode,
      q.nama   AS queue_nama,
      assignee.nama  AS assigned_to_nama,
      reporter.nama  AS pelapor_nama,
      COALESCE(k_rep.nik, '') AS pelapor_nik,
      COALESCE(k_rep.jabatan, 'User') AS pelapor_jabatan,
      COALESCE(comm_count.total_komentar, 0)::int AS total_komentar
    FROM tickets t
    LEFT JOIN ticket_queues q    ON q.id = t.queue_id
    LEFT JOIN users assignee     ON assignee.id = t.assigned_to_user_id
    LEFT JOIN users reporter     ON reporter.id = t.pelapor_user_id
    LEFT JOIN karyawan k_rep     ON LOWER(TRIM(reporter.email)) = LOWER(TRIM(k_rep.email_kantor))
    LEFT JOIN (
      SELECT id_tiket, COUNT(*)::int AS total_komentar
      FROM komentar_tiket
      GROUP BY id_tiket
    ) comm_count ON comm_count.id_tiket = t.id
    ${whereClause}
    ORDER BY
      CASE t.prioritas
        WHEN 'Urgent (4h)'  THEN 1
        WHEN 'High (1day)'  THEN 2
        WHEN 'Medium (3d)'  THEN 3
        WHEN 'Low (7d)'     THEN 4
        ELSE 5
      END,
      t.dibuat_pada DESC
  `

  const result = await pool.query(sql, params)
  res.json(result.rows)
}

// ── TICKET STATS ──────────────────────────────────────────────
export async function getTicketStats(req, res) {
  await ensureTicketsTableExists()
  const userId = req.user.id
  const userNama = req.user.nama
  const superAdmin = isSuperAdmin(req.user.role)
  const userRole = (req.user.role || '').trim().toLowerCase()
  const isRegularUser = userRole !== 'admin' && userRole !== 'superadmin' && userRole !== 'super admin'

  let whereClause = ''
  const params = []

  if (isRegularUser) {
    params.push(userId)
    params.push(userNama)
    whereClause = `WHERE (t.pelapor_user_id = $1 OR (t.pelapor_user_id IS NULL AND LOWER(TRIM(t.pelapor)) = LOWER(TRIM($2))))`
  } else if (!superAdmin) {
    params.push(userId)
    whereClause = `WHERE EXISTS (SELECT 1 FROM user_ticket_queues utq WHERE utq.user_id = $1 AND utq.queue_id = t.queue_id)`
  }

  const countsResult = await pool.query(`
    SELECT
      COUNT(*)::int AS "totalTickets",
      COUNT(CASE WHEN t.status_tiket = 'Open'    THEN 1 END)::int AS "openTickets",
      COUNT(CASE WHEN t.status_tiket = 'Pending' THEN 1 END)::int AS "pendingTickets",
      COUNT(CASE WHEN t.status_tiket = 'Closed'  THEN 1 END)::int AS "closedTickets",
      COUNT(CASE WHEN t.assigned_to_user_id IS NULL AND t.status_tiket NOT IN ('Closed','Resolved','Cancelled') THEN 1 END)::int AS "unassignedTickets"
    FROM tickets t
    ${whereClause}
  `, params)

  const recentResult = await pool.query(`
    SELECT t.*, q.kode AS queue_kode, assignee.nama AS assigned_to_nama
    FROM tickets t
    LEFT JOIN ticket_queues q ON q.id = t.queue_id
    LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
    ${whereClause}
    ORDER BY t.id DESC LIMIT 5
  `, params)

  const stats = countsResult.rows[0] || { totalTickets: 0, openTickets: 0, pendingTickets: 0, closedTickets: 0, unassignedTickets: 0 }
  stats.recentTickets = recentResult.rows
  res.json(stats)
}

// ── CASP/CSAT STATS (dashboard) ───────────────────────────────
export async function getTicketCaspStats(req, res) {
  await ensureTicketsTableExists()
  const userId = req.user.id
  const superAdmin = isSuperAdmin(req.user.role)
  const userRole = (req.user.role || '').trim().toLowerCase()
  const isRegularUser = userRole !== 'admin' && userRole !== 'superadmin' && userRole !== 'super admin'

  // Akses sesuai role (konsisten dengan getTicketStats):
  //  - Admin / superadmin: agregasi SEMUA rating CSAT.
  //  - User biasa: agregasi rating CSAT untuk tiket miliknya (sebagai pelapor).
  let whereClause = ''
  const params = []
  if (isRegularUser) {
    params.push(userId)
    whereClause = 'WHERE cr.reporter_user_id = $1'
  }

  const result = await pool.query(`
    SELECT
      COUNT(*)::int                                          AS "totalRatings",
      COALESCE(AVG(cr.rating), 0)::float                     AS "averageRating",
      COUNT(CASE WHEN cr.rating = 1 THEN 1 END)::int         AS "r1",
      COUNT(CASE WHEN cr.rating = 2 THEN 1 END)::int         AS "r2",
      COUNT(CASE WHEN cr.rating = 3 THEN 1 END)::int         AS "r3",
      COUNT(CASE WHEN cr.rating = 4 THEN 1 END)::int         AS "r4",
      COUNT(CASE WHEN cr.rating = 5 THEN 1 END)::int         AS "r5"
    FROM ticket_casp_ratings cr
    ${whereClause}
  `, params)

  const row = result.rows[0] || {}
  const totalRatings = Number(row.totalRatings) || 0
  const averageRating = totalRatings > 0
    ? Math.round((Number(row.averageRating) || 0) * 100) / 100
    : 0

  // Distribusi selalu 5 baris (rating 1–5), meskipun count = 0.
  const distribution = [
    { rating: 1, count: Number(row.r1) || 0 },
    { rating: 2, count: Number(row.r2) || 0 },
    { rating: 3, count: Number(row.r3) || 0 },
    { rating: 4, count: Number(row.r4) || 0 },
    { rating: 5, count: Number(row.r5) || 0 },
  ]

  res.json({ averageRating, totalRatings, distribution })
}

// ── CASP/CSAT TREND (line chart per bulan) ───────────────────
export async function getCaspTrend(req, res) {
  await ensureTicketsTableExists()
  const userId = req.user.id
  const superAdmin = isSuperAdmin(req.user.role)
  const userRole = (req.user.role || '').trim().toLowerCase()
  const isRegularUser = userRole !== 'admin' && userRole !== 'superadmin' && userRole !== 'super admin'

  let whereClause = ''
  const params = []
  if (isRegularUser) {
    params.push(userId)
    whereClause = 'WHERE cr.reporter_user_id = $1'
  }

  const result = await pool.query(`
    SELECT
      TO_CHAR(cr.submitted_at, 'Mon YYYY') AS "period",
      TO_CHAR(cr.submitted_at, 'YYYY-MM')  AS "ym",
      ROUND(AVG(cr.rating)::numeric, 2)    AS "averageRating",
      COUNT(*)::int                         AS "totalRatings"
    FROM ticket_casp_ratings cr
    ${whereClause}
    GROUP BY TO_CHAR(cr.submitted_at, 'Mon YYYY'), TO_CHAR(cr.submitted_at, 'YYYY-MM')
    ORDER BY TO_CHAR(cr.submitted_at, 'YYYY-MM') DESC
    LIMIT 12
  `, params)

  const dbMap = new Map()
  for (const row of result.rows) {
    dbMap.set(row.ym, {
      period: row.period,
      averageRating: Number(row.averageRating) || 0,
      totalRatings: Number(row.totalRatings) || 0,
    })
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  const now = new Date()
  const timeline = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const period = `${monthNames[d.getMonth()]} ${d.getFullYear()}`

    if (dbMap.has(ym)) {
      timeline.push(dbMap.get(ym))
    } else {
      timeline.push({ period, averageRating: 0, totalRatings: 0 })
    }
  }

  res.json(timeline)
}

// ── GET TICKET HISTORY ────────────────────────────────────────
export async function getTicketHistory(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) throw createHttpError(400, 'ID tiket tidak valid.')

  const userRole = (req.user?.role || '').trim().toLowerCase()
  if (userRole === 'user') {
    const check = await pool.query(
      'SELECT id FROM tickets WHERE id = $1 AND (pelapor_user_id = $2 OR (pelapor_user_id IS NULL AND pelapor = $3))',
      [id, req.user.id, req.user.nama]
    )
    if (check.rowCount === 0) throw createHttpError(403, 'Anda tidak memiliki akses ke tiket ini.')
  }

  const result = await pool.query('SELECT * FROM log_riwayat_tiket WHERE id_tiket = $1 ORDER BY id DESC', [id])
  res.json(result.rows)
}

// ── GET TICKET COMMENTS ───────────────────────────────────────
export async function getTicketComments(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) throw createHttpError(400, 'ID tiket tidak valid.')

  const userRole = (req.user?.role || '').trim().toLowerCase()
  if (userRole === 'user') {
    const check = await pool.query(
      'SELECT id FROM tickets WHERE id = $1 AND (pelapor_user_id = $2 OR (pelapor_user_id IS NULL AND pelapor = $3))',
      [id, req.user.id, req.user.nama]
    )
    if (check.rowCount === 0) throw createHttpError(403, 'Anda tidak memiliki akses ke tiket ini.')
  }

  const result = await pool.query('SELECT * FROM komentar_tiket WHERE id_tiket = $1 ORDER BY id ASC', [id])
  res.json(result.rows)
}

// ── CREATE TICKET COMMENT ─────────────────────────────────────
export async function createTicketComment(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) throw createHttpError(400, 'ID tiket tidak valid.')
  const { pesan, attachment, nama_pengguna, role_pengguna } = req.body
  if (!pesan || !String(pesan).trim()) throw createHttpError(400, 'Pesan komentar wajib diisi.')

  const ticketCheck = await pool.query('SELECT status_tiket FROM tickets WHERE id = $1', [id])
  if (ticketCheck.rowCount === 0) throw createHttpError(404, 'Tiket tidak ditemukan.')
  const statusTiket = ticketCheck.rows[0].status_tiket
  if (statusTiket === 'Resolved' || statusTiket === 'Closed') {
    throw createHttpError(403, 'Diskusi untuk tiket ini telah ditutup karena status tiket sudah Resolved/Closed.')
  }

  const userNama = nama_pengguna || req.user?.nama || 'User'
  const userRole = role_pengguna || req.user?.role || 'user'
  const result = await pool.query(
    `INSERT INTO komentar_tiket (id_tiket, nama_pengguna, role_pengguna, pesan, attachment) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, userNama, userRole, String(pesan).trim(), attachment || null]
  )
  const newComment = result.rows[0]

  broadcastEvent('COMMENT_CREATED', { ticketId: id, comment: newComment })

  res.status(201).json(newComment)
}

// ── STREAM REALTIME TICKET EVENTS (SSE) ───────────────────────
export function streamTicketEvents(req, res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  if (res.flushHeaders) res.flushHeaders()

  addSseClient(res, req.user)
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`)
}

// ── CREATE TICKET ─────────────────────────────────────────────
export async function createTicket(req, res) {
  await ensureTicketsTableExists()
  const { judul, deskripsi, queue_id, prioritas, attachment } = req.body

  if (!judul) throw createHttpError(400, 'Judul tiket wajib diisi.')
  if (!queue_id) throw createHttpError(400, 'Unit tujuan (queue) wajib dipilih.')

  // Validasi queue aktif
  const queueCheck = await pool.query('SELECT id, kode, nama FROM ticket_queues WHERE id = $1 AND is_active = true', [queue_id])
  if (queueCheck.rowCount === 0) throw createHttpError(400, 'Unit tujuan tidak valid atau tidak aktif.')
  const queue = queueCheck.rows[0]

  // Generate nomor tiket
  const countRes = await pool.query('SELECT COUNT(*)::int AS count FROM tickets')
  const seq = String(countRes.rows[0].count + 1).padStart(3, '0')
  const nomor_tiket = `TCK-${new Date().getFullYear()}-${seq}`

  const pelaporNama = req.user?.nama || 'User'
  const pelaporId   = req.user?.id   || null

  const result = await pool.query(
    `INSERT INTO tickets
       (nomor_tiket, judul, deskripsi, kategori, prioritas, status_tiket,
        assigned_to, pelapor, attachment, queue_id, pelapor_user_id, assigned_to_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      nomor_tiket,
      String(judul).trim(),
      deskripsi || '',
      queue.kode,                   // dual write: isi kategori lama juga
      prioritas || 'Medium (3d)',
      'Open',
      null,                         // assigned_to (teks) null
      pelaporNama,                  // dual write: isi pelapor lama juga
      attachment || null,
      queue.id,
      pelaporId,
      null                          // belum di-assign
    ]
  )

  const newTicket = result.rows[0]
  await addTicketLog(newTicket.id, newTicket.nomor_tiket, 'PEMBUATAN',
    `Tiket '${newTicket.judul}' dibuat untuk unit ${queue.nama}. Prioritas: ${newTicket.prioritas}.`,
    pelaporNama)

  broadcastEvent('TICKET_CREATED', newTicket)

  res.status(201).json(newTicket)
}

// ── UPDATE TICKET ─────────────────────────────────────────────
export async function updateTicket(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) throw createHttpError(400, 'ID tiket tidak valid.')

  const check = await pool.query('SELECT * FROM tickets WHERE id = $1', [id])
  if (check.rowCount === 0) throw createHttpError(404, 'Tiket tidak ditemukan.')
  const oldTicket = check.rows[0]

  const { judul, deskripsi, prioritas, status_tiket, queue_id, attachment } = req.body

  // Jika queue berubah, validasi queue baru
  let newQueueId = queue_id !== undefined ? queue_id : oldTicket.queue_id
  let queueKode = oldTicket.kategori
  if (queue_id && queue_id !== oldTicket.queue_id) {
    const queueCheck = await pool.query('SELECT id, kode FROM ticket_queues WHERE id = $1 AND is_active = true', [queue_id])
    if (queueCheck.rowCount === 0) throw createHttpError(400, 'Unit tujuan tidak valid.')
    queueKode = queueCheck.rows[0].kode
    newQueueId = queueCheck.rows[0].id
  }

  const newAttachment = attachment !== undefined ? attachment : oldTicket.attachment

  const result = await pool.query(
    `UPDATE tickets
        SET judul       = COALESCE($1, judul),
            deskripsi   = COALESCE($2, deskripsi),
            kategori    = $3,
            prioritas   = COALESCE($4, prioritas),
            status_tiket = COALESCE($5, status_tiket),
            attachment  = $6,
            queue_id    = $7,
            diperbarui_pada = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *`,
    [judul, deskripsi, queueKode, prioritas, status_tiket, newAttachment, newQueueId, id]
  )

  const updatedTicket = result.rows[0]
  const changes = []
  if (judul && judul !== oldTicket.judul) changes.push(`Judul diubah menjadi '${judul}'`)
  if (status_tiket && status_tiket !== oldTicket.status_tiket) changes.push(`Status: '${oldTicket.status_tiket}' → '${status_tiket}'`)
  if (prioritas && prioritas !== oldTicket.prioritas) changes.push(`Prioritas: '${oldTicket.prioritas}' → '${prioritas}'`)
  if (newQueueId !== oldTicket.queue_id) changes.push(`Unit tujuan diubah`)
  if (newAttachment !== oldTicket.attachment) changes.push('Lampiran diperbarui')

  const isResolving = status_tiket === 'Resolved' && oldTicket.status_tiket !== 'Resolved'
  if (isResolving) {
    await pool.query(
      `UPDATE tickets SET resolved_at = CURRENT_TIMESTAMP, resolved_by_user_id = $1 WHERE id = $2`,
      [req.user?.id || null, id]
    )
  }

  const aksi = status_tiket && status_tiket !== oldTicket.status_tiket
    ? (isResolving ? 'RESOLVE' : 'PERUBAHAN_STATUS')
    : 'UPDATE_DETAIL'

  const logDetail = isResolving
    ? `Tiket diselesaikan oleh ${req.user?.nama || 'Admin'}; menunggu penilaian CASP dari pelapor.`
    : (changes.join('. ') || 'Detail tiket diperbarui')

  await addTicketLog(id, oldTicket.nomor_tiket, aksi, logDetail, req.user?.nama || 'Admin')

  broadcastEvent('TICKET_UPDATED', updatedTicket)

  res.json(updatedTicket)
}

// ── CLAIM TICKET (atomic) ─────────────────────────────────────
export async function claimTicket(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) throw createHttpError(400, 'ID tiket tidak valid.')

  const userId    = req.user.id
  const userName  = req.user.nama || 'Admin'
  const superAdmin = isSuperAdmin(req.user.role)

  // Atomic update: hanya berhasil jika assigned_to_user_id masih NULL
  // dan user terdaftar di queue tiket tersebut (kecuali superadmin)
  let result
  if (superAdmin) {
    result = await pool.query(
      `UPDATE tickets
          SET assigned_to_user_id = $1,
              assigned_to = $2,
              status_tiket = 'In Progress',
              diperbarui_pada = CURRENT_TIMESTAMP
        WHERE id = $3
          AND assigned_to_user_id IS NULL
          AND status_tiket NOT IN ('Closed', 'Resolved', 'Cancelled')
        RETURNING *`,
      [userId, userName, id]
    )
  } else {
    result = await pool.query(
      `UPDATE tickets t
          SET assigned_to_user_id = $1,
              assigned_to = $2,
              status_tiket = 'In Progress',
              diperbarui_pada = CURRENT_TIMESTAMP
        WHERE t.id = $3
          AND t.assigned_to_user_id IS NULL
          AND t.status_tiket NOT IN ('Closed', 'Resolved', 'Cancelled')
          AND EXISTS (
            SELECT 1 FROM user_ticket_queues utq
            WHERE utq.user_id = $1 AND utq.queue_id = t.queue_id
          )
        RETURNING *`,
      [userId, userName, id]
    )
  }

  if (result.rowCount === 0) {
    // Cek apakah tiket sudah diambil orang lain atau user tidak punya akses
    const check = await pool.query('SELECT assigned_to_user_id, status_tiket FROM tickets WHERE id = $1', [id])
    if (check.rowCount === 0) throw createHttpError(404, 'Tiket tidak ditemukan.')
    const t = check.rows[0]
    if (t.assigned_to_user_id) throw createHttpError(409, 'Tiket sudah diambil oleh admin lain.')
    throw createHttpError(403, 'Anda tidak memiliki akses ke queue tiket ini.')
  }

  const ticket = result.rows[0]
  await addTicketLog(id, ticket.nomor_tiket, 'CLAIM', `Tiket diambil oleh ${userName}.`, userName)

  broadcastEvent('TICKET_UPDATED', ticket)

  res.json(ticket)
}

// ── REASSIGN TICKET ───────────────────────────────────────────
export async function reassignTicket(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) throw createHttpError(400, 'ID tiket tidak valid.')

  const { target_user_id } = req.body
  if (!target_user_id) throw createHttpError(400, 'target_user_id wajib diisi.')

  const ticketCheck = await pool.query('SELECT * FROM tickets WHERE id = $1', [id])
  if (ticketCheck.rowCount === 0) throw createHttpError(404, 'Tiket tidak ditemukan.')
  const ticket = ticketCheck.rows[0]

  const userId = req.user.id
  const superAdmin = isSuperAdmin(req.user.role)
  const isCurrentAssignee = ticket.assigned_to_user_id === userId

  if (!superAdmin && !isCurrentAssignee) {
    throw createHttpError(403, 'Hanya assignee saat ini atau superadmin yang dapat melakukan reassign.')
  }

  // Validasi target admin terdaftar di queue yang sama
  if (!superAdmin) {
    const adminCheck = await pool.query(
      `SELECT 1 FROM user_ticket_queues utq JOIN users u ON u.id = utq.user_id
       WHERE u.id = $1 AND u.is_active = true AND utq.queue_id = $2`,
      [target_user_id, ticket.queue_id]
    )
    if (adminCheck.rowCount === 0) throw createHttpError(403, 'Admin tujuan tidak terdaftar di queue tiket ini.')
  }

  const targetUser = await pool.query('SELECT nama FROM users WHERE id = $1', [target_user_id])
  if (targetUser.rowCount === 0) throw createHttpError(404, 'User tujuan tidak ditemukan.')
  const targetName = targetUser.rows[0].nama

  const result = await pool.query(
    `UPDATE tickets SET assigned_to_user_id = $1, assigned_to = $2, diperbarui_pada = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
    [target_user_id, targetName, id]
  )

  await addTicketLog(id, ticket.nomor_tiket, 'REASSIGN',
    `Tiket di-reassign ke ${targetName} oleh ${req.user.nama || 'Admin'}.`,
    req.user.nama || 'Admin')

  const reassignedTicket = result.rows[0]
  broadcastEvent('TICKET_UPDATED', reassignedTicket)

  res.json(reassignedTicket)
}

// ── DELETE TICKET ─────────────────────────────────────────────
export async function deleteTicket(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) throw createHttpError(400, 'ID tiket tidak valid.')
  const result = await pool.query('DELETE FROM tickets WHERE id = $1 RETURNING id', [id])
  if (result.rowCount === 0) throw createHttpError(404, 'Tiket tidak ditemukan.')
  res.json({ message: 'Tiket berhasil dihapus.' })
}

// ── GET CASP RATING ───────────────────────────────────────────
export async function getTicketCasp(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) throw createHttpError(400, 'ID tiket tidak valid.')

  const ticketRes = await pool.query('SELECT * FROM tickets WHERE id = $1', [id])
  if (ticketRes.rowCount === 0) throw createHttpError(404, 'Tiket tidak ditemukan.')
  const ticket = ticketRes.rows[0]

  const caspRes = await pool.query('SELECT * FROM ticket_casp_ratings WHERE ticket_id = $1', [id])
  const existingRating = caspRes.rows[0] || null

  const userId = req.user?.id
  const isReporter = userId ? ticket.pelapor_user_id === userId : ticket.pelapor === req.user?.nama
  const isAssignee = userId && ticket.assigned_to_user_id === userId
  const isResolved = ticket.status_tiket === 'Resolved' || ticket.status_tiket === 'Closed'

  let eligible = false
  let reason = null

  if (existingRating) {
    reason = 'CASP sudah dikirim.'
  } else if (!isResolved) {
    reason = 'Tiket belum berstatus Resolved atau Closed.'
  } else if (isAssignee) {
    reason = 'Petugas penanggung jawab tidak dapat memberikan penilaian CASP.'
  } else if (!isReporter) {
    reason = 'Hanya pelapor tiket yang dapat memberikan penilaian CASP.'
  } else {
    eligible = true
  }

  const ratingLabels = {
    1: 'Sangat Tidak Puas',
    2: 'Tidak Puas',
    3: 'Cukup',
    4: 'Puas',
    5: 'Sangat Puas'
  }

  res.json({
    eligible,
    reason,
    rating: existingRating ? {
      value: existingRating.rating,
      label: ratingLabels[existingRating.rating] || '',
      feedback: existingRating.feedback,
      submittedAt: existingRating.submitted_at,
      reporterName: existingRating.reporter_name_snapshot,
      assigneeName: existingRating.assignee_name_snapshot
    } : null,
    labels: ratingLabels
  })
}

// ── SUBMIT CASP RATING ────────────────────────────────────────
export async function submitTicketCasp(req, res) {
  await ensureTicketsTableExists()
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) throw createHttpError(400, 'ID tiket tidak valid.')

  const { rating, feedback } = req.body
  const numericRating = parseInt(rating, 10)
  if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
    throw createHttpError(400, 'Rating CASP wajib diisi dengan nilai angka 1 - 5.')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const ticketRes = await client.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [id])
    if (ticketRes.rowCount === 0) throw createHttpError(404, 'Tiket tidak ditemukan.')
    const ticket = ticketRes.rows[0]

    if (ticket.status_tiket !== 'Resolved' && ticket.status_tiket !== 'Closed') {
      throw createHttpError(409, 'Tiket belum berstatus Resolved atau Closed.')
    }

    const userId = req.user?.id
    const isReporter = userId ? ticket.pelapor_user_id === userId : ticket.pelapor === req.user?.nama
    const isAssignee = userId && ticket.assigned_to_user_id === userId

    if (isAssignee) {
      throw createHttpError(403, 'Petugas penanggung jawab tidak dapat memberikan penilaian CASP.')
    }
    if (!isReporter) {
      throw createHttpError(403, 'Hanya pelapor tiket yang dapat memberikan penilaian CASP.')
    }

    const checkCasp = await client.query('SELECT id FROM ticket_casp_ratings WHERE ticket_id = $1', [id])
    if (checkCasp.rowCount > 0) {
      throw createHttpError(409, 'Penilaian CASP untuk tiket ini sudah pernah dikirim.')
    }

    const reporterName = req.user?.nama || ticket.pelapor || 'Pelapor'
    const assigneeName = ticket.assigned_to || 'Admin'

    const insertRes = await client.query(
      `INSERT INTO ticket_casp_ratings
         (ticket_id, reporter_user_id, assignee_user_id, reporter_name_snapshot, assignee_name_snapshot, rating, feedback)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, userId || null, ticket.assigned_to_user_id || null, reporterName, assigneeName, numericRating, feedback ? String(feedback).trim() : null]
    )

    const labelMap = { 1: 'Sangat Tidak Puas', 2: 'Tidak Puas', 3: 'Cukup', 4: 'Puas', 5: 'Sangat Puas' }
    const ratingLabel = labelMap[numericRating] || ''

    await client.query(
      `INSERT INTO log_riwayat_tiket (id_tiket, nomor_tiket, aksi, perubahan, oleh_pengguna) VALUES ($1, $2, $3, $4, $5)`,
      [id, ticket.nomor_tiket, 'CASP_SUBMITTED', `Pelapor memberikan penilaian CASP ${numericRating}/5 (${ratingLabel}).`, reporterName]
    )

    await client.query('COMMIT')
    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
