import { randomUUID } from 'node:crypto'
import { pool } from '../config/database.js'
import { addSseClient, broadcastTicketEvent } from '../services/realtimeService.js'
import {
  TICKET_ROLES,
  buildTicketScopeQuery,
  canClaimTicket,
  canCommentTicket,
  canCreateTicket,
  canDeleteTicket,
  canManageTicket,
  canRateTicket,
  canReadTicket,
  canReadTicketCasp,
  canReassignTicket,
  createTicketIdentity,
  hasTicketWritePermission,
  isTicketAssignee,
  isTicketReporter,
  isTicketResolutionStatus,
  loadTicketAccessContext,
  normalizeTicketRole,
  canTransitionTicketStatus,
} from '../services/ticketAccessService.js'

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

const MAX_COMMENT_LENGTH = 4000
const MAX_COMMENT_ATTACHMENT_LENGTH = 7_000_000
const COMMENT_BODY_FIELDS = new Set(['pesan', 'attachment'])
const RASTER_DATA_URL_PATTERN = /^data:image\/(png|jpeg|gif|webp);base64,([a-z0-9+/]+={0,2})$/i
const MAX_RASTER_ATTACHMENT_BYTES = 5 * 1024 * 1024
const MAX_TICKET_TITLE_LENGTH = 255
const MAX_TICKET_DESCRIPTION_LENGTH = 20_000
const MAX_TICKET_ATTACHMENT_LENGTH = 7_000_000
const TICKET_CREATE_FIELDS = new Set(['judul', 'deskripsi', 'kategori', 'prioritas', 'queue_id', 'attachment'])
const TICKET_UPDATE_FIELDS = new Set([
  'judul',
  'deskripsi',
  'kategori',
  'prioritas',
  'status_tiket',
  'queue_id',
  'attachment',
])
const TICKET_CATEGORIES = new Set(['Request', 'Support', 'request', 'support'])
const TICKET_PRIORITIES = new Set(['Urgent (4h)', 'High (1day)', 'Medium (3d)', 'Low (7d)'])
const TICKET_STATUSES = new Set([
  'Open',
  'In Progress',
  'Pending',
  'Resolved',
  'Closed',
  'Cancelled',
])
const TICKET_LIST_QUERY_FIELDS = new Set([
  'search',
  'status',
  'prioritas',
  'queue_id',
  'tab',
  'page',
  'limit',
])
const TICKET_LIST_TABS = new Set([
  '',
  'all',
  'open',
  'pending',
  'closed',
  'resolved',
  'assigned',
  'mine',
  'reported',
  'created',
  'unassigned',
])
const MAX_TICKET_SEARCH_LENGTH = 150
const DEFAULT_TICKET_PAGE_SIZE = 50
const MAX_TICKET_PAGE_SIZE = 100

function getTicketIdentity(req) {
  return req.ticketIdentity || createTicketIdentity(req.user)
}

function assertCanonicalTicketIdentity(req) {
  const identity = getTicketIdentity(req)
  if (!identity.valid) {
    throw createHttpError(403, 'Identitas pengguna tidak valid untuk akses tiket.')
  }
  return identity
}

function parsePositiveId(value, message = 'ID tiket tidak valid.') {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw createHttpError(400, message)
  return id
}

function parsePositiveQueryInteger(value, fallback, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === '') return fallback
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw createHttpError(400, `${label} tidak valid.`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw createHttpError(400, `${label} tidak valid.`)
  }
  return parsed
}

function validateTicketListQuery(query) {
  const unknownField = Object.keys(query).find((field) => !TICKET_LIST_QUERY_FIELDS.has(field))
  if (unknownField) {
    throw createHttpError(400, `Parameter daftar tiket tidak diizinkan: ${unknownField}.`)
  }

  const normalizeOptionalText = (value, label) => {
    if (value === undefined || value === '') return ''
    if (typeof value !== 'string') throw createHttpError(400, `${label} tidak valid.`)
    return value.trim()
  }

  const search = normalizeOptionalText(query.search, 'Pencarian tiket')
  if (search.length > MAX_TICKET_SEARCH_LENGTH) {
    throw createHttpError(400, `Pencarian tiket maksimal ${MAX_TICKET_SEARCH_LENGTH} karakter.`)
  }

  const status = normalizeOptionalText(query.status, 'Status tiket')
  if (status && !TICKET_STATUSES.has(status)) {
    throw createHttpError(400, 'Status tiket tidak valid.')
  }

  // Validasi ENUM prioritas tiket
  const prioritas = normalizeOptionalText(query.prioritas, 'Prioritas tiket');
  const VALID_PRIORITIES = ["Urgent (4h)", "High (1day)", "Medium (3d)", "Low (7d)"];
  if (prioritas && !VALID_PRIORITIES.includes(prioritas)) {
    throw createHttpError(400, `Prioritas tidak valid. Harus salah satu dari: ${VALID_PRIORITIES.join(", ")}`);
  }

  const tab = normalizeOptionalText(query.tab, 'Tab tiket').toLowerCase()
  if (!TICKET_LIST_TABS.has(tab)) throw createHttpError(400, 'Tab tiket tidak valid.')

  return {
    search,
    status,
    prioritas,
    tab,
    queueId:
      query.queue_id === undefined || query.queue_id === ''
        ? null
        : parsePositiveId(query.queue_id, 'Queue ID tidak valid.'),
    page: parsePositiveQueryInteger(query.page, 1, 'Halaman tiket'),
    limit: parsePositiveQueryInteger(
      query.limit,
      DEFAULT_TICKET_PAGE_SIZE,
      'Batas tiket',
      MAX_TICKET_PAGE_SIZE,
    ),
  }
}

function assertPlainObject(body, message) {
  if (
    body == null ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    (Object.getPrototypeOf(body) !== Object.prototype && Object.getPrototypeOf(body) !== null)
  ) {
    throw createHttpError(400, message)
  }
}

function hasRasterMagicBytes(mimeSubtype, bytes) {
  if (mimeSubtype === 'png') {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
  }
  if (mimeSubtype === 'jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (mimeSubtype === 'gif') {
    if (bytes.length < 6) return false
    const signature = bytes.subarray(0, 6).toString('ascii')
    return signature === 'GIF87a' || signature === 'GIF89a'
  }
  return (
    mimeSubtype === 'webp' &&
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
}

function normalizeRasterAttachment(attachment, label, maxLength) {
  if (attachment !== null && attachment !== undefined && typeof attachment !== 'string') {
    throw createHttpError(400, `Attachment ${label} tidak valid.`)
  }
  if (typeof attachment === 'string' && attachment.length > maxLength) {
    throw createHttpError(413, `Attachment ${label} terlalu besar.`)
  }

  const normalized = typeof attachment === 'string' && attachment.trim() ? attachment.trim() : null
  if (!normalized) return null

  const match = RASTER_DATA_URL_PATTERN.exec(normalized)
  if (!match || match[2].length % 4 !== 0) {
    throw createHttpError(400, `Attachment ${label} harus berupa data gambar yang didukung.`)
  }

  const mimeSubtype = match[1].toLowerCase()
  const encoded = match[2]
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length > MAX_RASTER_ATTACHMENT_BYTES) {
    throw createHttpError(413, `Attachment ${label} terlalu besar.`)
  }
  if (bytes.toString('base64') !== encoded || !hasRasterMagicBytes(mimeSubtype, bytes)) {
    throw createHttpError(400, `Attachment ${label} tidak cocok dengan format gambar.`)
  }

  return normalized
}

function normalizeTicketAttachment(attachment) {
  return normalizeRasterAttachment(attachment, 'tiket', MAX_TICKET_ATTACHMENT_LENGTH)
}

function withoutInlineAttachment(record) {
  if (!record || typeof record !== 'object') return record

  const {
    attachment,
    deleted_at: _deletedAt,
    deleted_by_user_id: _deletedByUserId,
    deletion_reason: _deletionReason,
    ...safeRecord
  } = record
  return {
    ...safeRecord,
    has_attachment:
      safeRecord.has_attachment === true ||
      (typeof attachment === 'string' && attachment.trim().length > 0),
  }
}

function validateTicketCreateBody(body) {
  assertPlainObject(body, 'Payload pembuatan tiket tidak valid.')

  const unknownField = Object.keys(body).find((field) => !TICKET_CREATE_FIELDS.has(field))
  if (unknownField) {
    throw createHttpError(400, `Field pembuatan tiket tidak diizinkan: ${unknownField}.`)
  }

  if (typeof body.judul !== 'string' || !body.judul.trim()) {
    throw createHttpError(400, 'Judul tiket wajib diisi.')
  }
  const judul = body.judul.trim()
  if (judul.length > MAX_TICKET_TITLE_LENGTH) {
    throw createHttpError(400, `Judul tiket maksimal ${MAX_TICKET_TITLE_LENGTH} karakter.`)
  }

  if (body.deskripsi !== undefined && typeof body.deskripsi !== 'string') {
    throw createHttpError(400, 'Deskripsi tiket harus berupa teks.')
  }
  const deskripsi = typeof body.deskripsi === 'string' ? body.deskripsi.trim() : ''
  if (deskripsi.length > MAX_TICKET_DESCRIPTION_LENGTH) {
    throw createHttpError(
      400,
      `Deskripsi tiket maksimal ${MAX_TICKET_DESCRIPTION_LENGTH} karakter.`,
    )
  }

  if (!Number.isSafeInteger(body.queue_id) || body.queue_id <= 0) {
    throw createHttpError(400, 'Unit tujuan tidak valid.')
  }
  if (
    body.prioritas !== undefined &&
    (typeof body.prioritas !== 'string' || !TICKET_PRIORITIES.has(body.prioritas))
  ) {
    throw createHttpError(400, 'Prioritas tiket tidak valid.')
  }

  let kategori = 'Support'
  if (body.kategori !== undefined && body.kategori !== null && body.kategori !== '') {
    if (typeof body.kategori !== 'string' || !TICKET_CATEGORIES.has(body.kategori)) {
      throw createHttpError(400, 'Kategori tiket tidak valid. Harus Request atau Support.')
    }
    kategori = body.kategori.toLowerCase() === 'request' ? 'Request' : 'Support'
  }

  return {
    judul,
    deskripsi,
    kategori,
    queue_id: body.queue_id,
    prioritas: body.prioritas ?? 'Medium (3d)',
    attachment: normalizeTicketAttachment(body.attachment),
  }
}

function validateTicketUpdateBody(body) {
  assertPlainObject(body, 'Payload pembaruan tiket tidak valid.')

  const fields = Object.keys(body)
  if (fields.length === 0) {
    throw createHttpError(400, 'Payload pembaruan tiket tidak boleh kosong.')
  }
  const unknownField = fields.find((field) => !TICKET_UPDATE_FIELDS.has(field))
  if (unknownField) {
    throw createHttpError(400, `Field pembaruan tiket tidak diizinkan: ${unknownField}.`)
  }

  const normalized = {}
  const hasField = (field) => Object.prototype.hasOwnProperty.call(body, field)

  if (hasField('judul')) {
    if (typeof body.judul !== 'string') {
      throw createHttpError(400, 'Judul tiket harus berupa teks.')
    }
    normalized.judul = body.judul.trim()
    if (!normalized.judul) throw createHttpError(400, 'Judul tiket wajib diisi.')
    if (normalized.judul.length > MAX_TICKET_TITLE_LENGTH) {
      throw createHttpError(400, `Judul tiket maksimal ${MAX_TICKET_TITLE_LENGTH} karakter.`)
    }
  }

  if (hasField('deskripsi')) {
    if (typeof body.deskripsi !== 'string') {
      throw createHttpError(400, 'Deskripsi tiket harus berupa teks.')
    }
    normalized.deskripsi = body.deskripsi.trim()
    if (normalized.deskripsi.length > MAX_TICKET_DESCRIPTION_LENGTH) {
      throw createHttpError(
        400,
        `Deskripsi tiket maksimal ${MAX_TICKET_DESCRIPTION_LENGTH} karakter.`,
      )
    }
  }

  if (hasField('kategori')) {
    if (typeof body.kategori !== 'string' || !TICKET_CATEGORIES.has(body.kategori)) {
      throw createHttpError(400, 'Kategori tiket tidak valid. Harus Request atau Support.')
    }
    normalized.kategori = body.kategori.toLowerCase() === 'request' ? 'Request' : 'Support'
  }

  if (hasField('prioritas')) {
    if (typeof body.prioritas !== 'string' || !TICKET_PRIORITIES.has(body.prioritas)) {
      throw createHttpError(400, 'Prioritas tiket tidak valid.')
    }
    normalized.prioritas = body.prioritas
  }

  if (hasField('status_tiket')) {
    if (typeof body.status_tiket !== 'string' || !TICKET_STATUSES.has(body.status_tiket)) {
      throw createHttpError(400, 'Status tiket tidak valid.')
    }
    normalized.status_tiket = body.status_tiket
  }

  if (hasField('queue_id')) {
    if (
      typeof body.queue_id !== 'number' ||
      !Number.isSafeInteger(body.queue_id) ||
      body.queue_id <= 0
    ) {
      throw createHttpError(400, 'Unit tujuan tidak valid.')
    }
    normalized.queue_id = body.queue_id
  }

  if (hasField('attachment')) {
    normalized.attachment = normalizeTicketAttachment(body.attachment)
  }

  return normalized
}

function assertTicketFound(ticket) {
  if (!ticket) throw createHttpError(404, 'Tiket tidak ditemukan.')
}

function assertTicketRead(identity, ticket) {
  assertTicketFound(ticket)
  if (!canReadTicket(identity, ticket)) {
    throw createHttpError(403, 'Anda tidak memiliki akses ke tiket ini.')
  }
}

function assertTicketCaspRead(identity, ticket) {
  assertTicketFound(ticket)
  if (!canReadTicketCasp(identity, ticket)) {
    throw createHttpError(403, 'Anda tidak memiliki akses ke penilaian CASP tiket ini.')
  }
}

function isResolvedTicket(ticket) {
  const status =
    typeof ticket?.status_tiket === 'string' ? ticket.status_tiket.trim().toLowerCase() : ''
  return status === 'resolved' || status === 'closed'
}

// ── Ensure base tickets tables exist ──────────────────────────
async function withTransaction(operation) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      error.rollbackError = rollbackError
    }
    throw error
  } finally {
    client.release()
  }
}

async function addTicketLog(queryable, id_tiket, nomor_tiket, aksi, perubahan, oleh_pengguna) {
  await queryable.query(
    `INSERT INTO log_riwayat_tiket (id_tiket, action, old_value, new_value, actor_name) VALUES ($1, $2, $3, $4, $5)`,
    [
      id_tiket,
      aksi || 'UPDATE',
      nomor_tiket ? { nomor_tiket } : null,
      perubahan ? { text: perubahan } : null,
      oleh_pengguna || 'Sistem',
    ],
  )
}

// ── LIST TICKETS (queue-aware) ────────────────────────────────
export async function listTickets(req, res) {
  const identity = assertCanonicalTicketIdentity(req)
  const { search, status, prioritas, queueId, tab, page, limit } = validateTicketListQuery(req.query)
  const ticketScope = buildTicketScopeQuery(identity, { tab })
  const params = [...ticketScope.params]
  const conditions = [...ticketScope.conditions]

  if (tab === 'open') {
    conditions.push(`t.status_tiket IN ('Open', 'In Progress')`)
  } else if (tab === 'pending') {
    conditions.push(`t.status_tiket = 'Pending'`)
  } else if (tab === 'closed' || tab === 'resolved') {
    conditions.push(`t.status_tiket IN ('Closed', 'Resolved')`)
  }

  if (search) {
    params.push(`%${search}%`)
    const n = params.length
    conditions.push(
      `(t.judul ILIKE $${n} OR t.nomor_tiket ILIKE $${n} OR reporter.email ILIKE $${n} OR reporter.nama ILIKE $${n})`,
    )
  }
  if (status) {
    params.push(status)
    conditions.push(`t.status_tiket = $${params.length}`)
  }
  if (prioritas) {
    params.push(prioritas)
    conditions.push(`t.prioritas = $${params.length}`)
  }
  if (queueId !== null) {
    params.push(queueId)
    conditions.push(`t.queue_id = $${params.length}`)
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

  const sql = `
    SELECT
      t.id,
      t.nomor_tiket,
      t.judul,
      t.deskripsi,
      t.kategori,
      t.prioritas,
      t.status_tiket,
      t.assigned_to_user_id AS assigned_to,
      t.pelapor_user_id AS pelapor,
      t.queue_id,
      t.pelapor_user_id,
      t.assigned_to_user_id,
      t.resolved_at,
      t.resolved_by_user_id,
      t.created_at AS dibuat_pada,
      t.updated_at AS diperbarui_pada,
      (t.attachment_count > 0) AS has_attachment,
      q.kode   AS queue_kode,
      q.nama   AS queue_nama,
      assignee.nama  AS assigned_to_nama,
      reporter.nama  AS pelapor_nama,
      COALESCE(k_rep.nik, '') AS pelapor_nik,
      COALESCE(k_rep.title, 'User') AS pelapor_jabatan,
      COALESCE((
        SELECT COUNT(*)::int
        FROM komentar_tiket comment_row
        WHERE comment_row.id_tiket = t.id
      ), 0)::int AS total_komentar,
      COUNT(*) OVER()::int AS __total_count
    FROM tickets t
    LEFT JOIN ticket_queues q    ON q.id = t.queue_id
    LEFT JOIN users assignee     ON assignee.id = t.assigned_to_user_id
    LEFT JOIN users reporter     ON reporter.id = t.pelapor_user_id
    LEFT JOIN karyawan k_rep     ON LOWER(TRIM(reporter.email)) = LOWER(TRIM(k_rep.email_kantor))
    ${whereClause}
    ORDER BY
      CASE t.prioritas
        WHEN 'Urgent (4h)'  THEN 1
        WHEN 'High (1day)'  THEN 2
        WHEN 'Medium (3d)'  THEN 3
        WHEN 'Low (7d)'     THEN 4
        ELSE 5
      END,
      t.created_at DESC,
      t.id DESC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `

  const result = await pool.query(sql, [...params, limit, (page - 1) * limit])
  const totalCount = Number(result.rows[0]?.__total_count) || 0
  const rows = result.rows.map(({ __total_count: _totalCount, ...row }) => row)
  res.setHeader('X-Total-Count', String(totalCount))
  res.setHeader('X-Page', String(page))
  res.setHeader('X-Page-Size', String(limit))
  res.json(rows)
}

// ── TICKET STATS ──────────────────────────────────────────────
export async function getTicketStats(req, res) {
  const identity = assertCanonicalTicketIdentity(req)
  const ticketScope = buildTicketScopeQuery(identity, { mode: 'aggregate' })
  const params = ticketScope.params
  const whereClause =
    ticketScope.conditions.length > 0 ? `WHERE ${ticketScope.conditions.join(' AND ')}` : ''

  const countsResult = await pool.query(
    `
    SELECT
      COUNT(*)::int AS "totalTickets",
      COUNT(CASE WHEN t.status_tiket = 'Open'    THEN 1 END)::int AS "openTickets",
      COUNT(CASE WHEN t.status_tiket = 'Pending' THEN 1 END)::int AS "pendingTickets",
      COUNT(CASE WHEN t.status_tiket = 'Closed'  THEN 1 END)::int AS "closedTickets",
      COUNT(CASE WHEN t.assigned_to_user_id IS NULL AND t.status_tiket NOT IN ('Closed','Resolved','Cancelled') THEN 1 END)::int AS "unassignedTickets"
    FROM tickets t
    ${whereClause}
  `,
    params,
  )

  const recentResult = await pool.query(
    `
    SELECT
      t.id,
      t.nomor_tiket,
      t.judul,
      t.kategori,
      t.prioritas,
      t.status_tiket,
      t.assigned_to_user_id AS assigned_to,
      t.pelapor_user_id AS pelapor,
      t.queue_id,
      t.pelapor_user_id,
      t.assigned_to_user_id,
      t.resolved_at,
      t.resolved_by_user_id,
      t.created_at AS dibuat_pada,
      t.updated_at AS diperbarui_pada,
      (t.attachment_count > 0) AS has_attachment,
      q.kode AS queue_kode,
      assignee.nama AS assigned_to_nama
    FROM tickets t
    LEFT JOIN ticket_queues q ON q.id = t.queue_id
    LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
    ${whereClause}
    ORDER BY t.id DESC LIMIT 5
  `,
    params,
  )

  const stats = countsResult.rows[0] || {
    totalTickets: 0,
    openTickets: 0,
    pendingTickets: 0,
    closedTickets: 0,
    unassignedTickets: 0,
  }
  stats.recentTickets = recentResult.rows
  res.json(stats)
}

// ── CASP/CSAT STATS (dashboard) ───────────────────────────────
export async function getTicketCaspStats(req, res) {
  const identity = assertCanonicalTicketIdentity(req)
  const ticketScope = buildTicketScopeQuery(identity, {
    mode: 'aggregate',
    alias: 't',
  })
  const params = ticketScope.params
  const whereClause =
    ticketScope.conditions.length > 0 ? `WHERE ${ticketScope.conditions.join(' AND ')}` : ''

  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int                                               AS "totalRatings",
      COALESCE(AVG(cr.rating_score), 0)::float                    AS "averageRating",
      COUNT(CASE WHEN cr.rating_score = 1 THEN 1 END)::int         AS "r1",
      COUNT(CASE WHEN cr.rating_score = 2 THEN 1 END)::int         AS "r2",
      COUNT(CASE WHEN cr.rating_score = 3 THEN 1 END)::int         AS "r3",
      COUNT(CASE WHEN cr.rating_score = 4 THEN 1 END)::int         AS "r4",
      COUNT(CASE WHEN cr.rating_score = 5 THEN 1 END)::int         AS "r5"
    FROM ticket_casp_ratings cr
    JOIN tickets t ON t.id = cr.id_tiket
    ${whereClause}
  `,
    params,
  )

  const row = result.rows[0] || {}
  const totalRatings = Number(row.totalRatings) || 0
  const averageRating =
    totalRatings > 0 ? Math.round((Number(row.averageRating) || 0) * 100) / 100 : 0

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
  const identity = assertCanonicalTicketIdentity(req)
  const ticketScope = buildTicketScopeQuery(identity, {
    mode: 'aggregate',
    alias: 't',
  })
  const params = ticketScope.params
  const whereClause =
    ticketScope.conditions.length > 0 ? `WHERE ${ticketScope.conditions.join(' AND ')}` : ''

  const result = await pool.query(
    `
    SELECT
      TO_CHAR(cr.submitted_at, 'Mon YYYY') AS "period",
      TO_CHAR(cr.submitted_at, 'YYYY-MM')  AS "ym",
      ROUND(AVG(cr.rating_score)::numeric, 2) AS "averageRating",
      COUNT(*)::int                         AS "totalRatings"
    FROM ticket_casp_ratings cr
    JOIN tickets t ON t.id = cr.id_tiket
    ${whereClause}
    GROUP BY TO_CHAR(cr.submitted_at, 'Mon YYYY'), TO_CHAR(cr.submitted_at, 'YYYY-MM')
    ORDER BY TO_CHAR(cr.submitted_at, 'YYYY-MM') DESC
    LIMIT 12
  `,
    params,
  )

  const dbMap = new Map()
  for (const row of result.rows) {
    dbMap.set(row.ym, {
      period: row.period,
      averageRating: Number(row.averageRating) || 0,
      totalRatings: Number(row.totalRatings) || 0,
    })
  }

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ]
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
  const id = parsePositiveId(req.params.id)
  const identity = assertCanonicalTicketIdentity(req)
  const ticket = await loadTicketAccessContext(pool, identity, id)
  assertTicketRead(identity, ticket)

  const result = await pool.query(
    `SELECT
       id,
       id_tiket,
       action AS aksi,
       COALESCE(new_value->>'text', action) AS perubahan,
       actor_name AS oleh_pengguna,
       created_at AS dibuat_pada
     FROM log_riwayat_tiket
     WHERE id_tiket = $1
     ORDER BY id DESC`,
    [id],
  )
  res.json(result.rows)
}

// ── GET TICKET COMMENTS ───────────────────────────────────────
export async function getTicketComments(req, res) {
  const id = parsePositiveId(req.params.id)
  const identity = assertCanonicalTicketIdentity(req)
  const ticket = await loadTicketAccessContext(pool, identity, id)
  assertTicketRead(identity, ticket)

  const result = await pool.query(
    `SELECT
       k.id,
       k.id_tiket,
       u.nama AS nama_pengguna,
       u.role AS role_pengguna,
       k.pesan,
       k.created_at AS dibuat_pada,
       (k.attachment_data IS NOT NULL AND k.attachment_data != '') AS has_attachment
     FROM komentar_tiket k
     JOIN users u ON u.id = k.user_id
     WHERE k.id_tiket = $1
     ORDER BY k.id ASC`,
    [id],
  )
  res.json(result.rows)
}

// Attachment payloads are fetched only for one authorized ticket at a time.
export async function getTicketAttachment(req, res) {
  const id = parsePositiveId(req.params.id)
  const identity = assertCanonicalTicketIdentity(req)
  const ticket = await loadTicketAccessContext(pool, identity, id)
  assertTicketRead(identity, ticket)

  const result = await pool.query(
    `SELECT attachment_data AS attachment
     FROM komentar_tiket
     WHERE id_tiket = $1
       AND attachment_data IS NOT NULL
       AND attachment_data != ''
     ORDER BY id ASC
     LIMIT 1`,
    [id],
  )
  const attachment = result.rows[0]?.attachment
  if (typeof attachment !== 'string' || !attachment.trim()) {
    throw createHttpError(404, 'Lampiran tiket tidak ditemukan.')
  }

  res.json({ attachment })
}

// A comment attachment is scoped through its parent ticket before the blob is queried.
export async function getTicketCommentAttachment(req, res) {
  const ticketId = parsePositiveId(req.params.id)
  const commentId = parsePositiveId(req.params.commentId, 'ID komentar tidak valid.')
  const identity = assertCanonicalTicketIdentity(req)
  const ticket = await loadTicketAccessContext(pool, identity, ticketId)
  assertTicketRead(identity, ticket)

  const result = await pool.query(
    `SELECT attachment_data AS attachment
     FROM komentar_tiket
     WHERE id_tiket = $1
       AND id = $2`,
    [ticketId, commentId],
  )
  const attachment = result.rows[0]?.attachment
  if (typeof attachment !== 'string' || !attachment.trim()) {
    throw createHttpError(404, 'Lampiran komentar tidak ditemukan.')
  }

  res.json({ attachment })
}

// ── CREATE TICKET COMMENT ─────────────────────────────────────
export async function createTicketComment(req, res) {
  const id = parsePositiveId(req.params.id)
  const identity = assertCanonicalTicketIdentity(req)
  if (!identity.name) {
    throw createHttpError(403, 'Identitas actor komentar tidak lengkap.')
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw createHttpError(400, 'Payload komentar tidak valid.')
  }
  if (Object.keys(req.body).some((field) => !COMMENT_BODY_FIELDS.has(field))) {
    throw createHttpError(400, 'Payload komentar hanya boleh berisi pesan dan attachment.')
  }

  const { pesan, attachment } = req.body
  const normalizedMessage = typeof pesan === 'string' ? pesan.trim() : ''
  if (!normalizedMessage) throw createHttpError(400, 'Pesan komentar wajib diisi.')
  if (normalizedMessage.length > MAX_COMMENT_LENGTH) {
    throw createHttpError(400, `Pesan komentar maksimal ${MAX_COMMENT_LENGTH} karakter.`)
  }
  const normalizedAttachment = normalizeRasterAttachment(
    attachment,
    'komentar',
    MAX_COMMENT_ATTACHMENT_LENGTH,
  )

  const client = await pool.connect()
  let newComment
  let ticket
  try {
    await client.query('BEGIN')
    ticket = await loadTicketAccessContext(client, identity, id, {
      forUpdate: true,
    })
    assertTicketRead(identity, ticket)
    if (!canCommentTicket(identity, ticket)) {
      throw createHttpError(403, 'Diskusi untuk tiket ini telah ditutup.')
    }

    const actorRole = identity.role === TICKET_ROLES.REPORTER ? 'user' : identity.role
    const result = await client.query(
      `INSERT INTO komentar_tiket (id_tiket, user_id, pesan, attachment_data)
       VALUES ($1, $2, $3, $4)
       RETURNING id, id_tiket, pesan, created_at AS dibuat_pada`,
      [id, identity.id, normalizedMessage, normalizedAttachment],
    )
    newComment = {
      ...result.rows[0],
      nama_pengguna: identity.name,
      role_pengguna: actorRole,
      has_attachment: Boolean(normalizedAttachment),
    }

    if (normalizedAttachment) {
      await client.query(
        `UPDATE tickets SET attachment_count = COALESCE(attachment_count, 0) + 1 WHERE id = $1`,
        [id],
      )
    }

    await addTicketLog(client, id, ticket.nomor_tiket, 'KOMENTAR', 'Komentar ditambahkan.', identity.name)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  await broadcastTicketEvent('COMMENT_CREATED', ticket, { actorUserId: identity.id, comment: newComment })
  res.status(201).json(withoutInlineAttachment(newComment))
}

// ── STREAM REALTIME TICKET EVENTS (SSE) ───────────────────────
export async function streamTicketEvents(req, res) {
  const identity = assertCanonicalTicketIdentity(req)
  const tokenExpiresAt = Number(req.user?.exp) * 1000
  if (!Number.isFinite(tokenExpiresAt) || tokenExpiresAt <= Date.now()) {
    throw createHttpError(401, 'Sesi realtime tidak valid atau telah berakhir.')
  }

  const removeClient = addSseClient(res, identity, [], {
    expiresAt: tokenExpiresAt,
  })
  try {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-store, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    if (res.flushHeaders) res.flushHeaders()

    const connectedEvent = JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })
    if (res.write(`retry: 5000\ndata: ${connectedEvent}\n\n`) === false) {
      removeClient()
      res.end()
    }
  } catch (error) {
    removeClient()
    throw error
  }
}

// ── CREATE TICKET ─────────────────────────────────────────────
export async function createTicket(req, res) {
  const identity = assertCanonicalTicketIdentity(req)
  if (!canCreateTicket(identity)) {
    throw createHttpError(403, 'Anda tidak memiliki akses untuk membuat tiket.')
  }
  if (!identity.name) throw createHttpError(403, 'Identitas pelapor tidak lengkap.')
  const { judul, deskripsi, kategori, queue_id, prioritas, attachment } = validateTicketCreateBody(req.body)
  const pelaporNama = identity.name
  const pelaporId = identity.id

  const newTicket = await withTransaction(async (client) => {
    const queueCheck = await client.query(
      'SELECT id, kode, nama FROM ticket_queues WHERE id = $1 AND is_active = true',
      [queue_id],
    )
    if (queueCheck.rowCount === 0) {
      throw createHttpError(400, 'Unit tujuan tidak valid atau tidak aktif.')
    }
    const queue = queueCheck.rows[0]

    const temporaryTicketNumber = `TMP-${randomUUID().replace(/-/g, '').slice(0, 16)}`

    const result = await client.query(
      `INSERT INTO tickets
         (nomor_tiket, judul, deskripsi, kategori, prioritas, status_tiket,
          queue_id, pelapor_user_id, assigned_to_user_id, attachment_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        temporaryTicketNumber,
        judul,
        deskripsi,
        kategori || queue.kode,
        prioritas,
        'Open',
        queue.id,
        pelaporId,
        null,
        attachment ? 1 : 0,
      ],
    )

    const insertedTicket = result.rows[0]
    if (attachment) {
      await client.query(
        `INSERT INTO komentar_tiket (id_tiket, user_id, pesan, attachment_data)
         VALUES ($1, $2, $3, $4)`,
        [insertedTicket.id, pelaporId, 'Lampiran Kendala', attachment],
      )
    }

    const nomor_tiket = `TKT-${new Date().getFullYear()}-${String(insertedTicket.id).padStart(6, '0')}`
    const numberResult = await client.query(
      `UPDATE tickets
       SET nomor_tiket = $1
       WHERE id = $2
         AND nomor_tiket = $3
       RETURNING *`,
      [nomor_tiket, insertedTicket.id, temporaryTicketNumber],
    )
    if (numberResult.rowCount !== 1) {
      throw new Error('Gagal menetapkan nomor tiket final.')
    }

    const createdTicket = numberResult.rows[0]
    await addTicketLog(
      client,
      createdTicket.id,
      createdTicket.nomor_tiket,
      'PEMBUATAN',
      `Tiket '${createdTicket.judul}' dibuat untuk unit ${queue.nama}. Prioritas: ${createdTicket.prioritas}.`,
      pelaporNama,
    )
    return createdTicket
  })

  await broadcastTicketEvent('TICKET_CREATED', newTicket, { actorUserId: identity.id })

  res.status(201).json(withoutInlineAttachment(newTicket))
}

// ── UPDATE TICKET ─────────────────────────────────────────────
export async function updateTicket(req, res) {
  const id = parsePositiveId(req.params.id)
  const identity = assertCanonicalTicketIdentity(req)
  if (!hasTicketWritePermission(identity)) {
    throw createHttpError(403, 'Anda tidak memiliki akses tulis untuk tiket.')
  }
  if (!identity.name) throw createHttpError(403, 'Identitas actor tidak lengkap.')
  const update = validateTicketUpdateBody(req.body)

  const accessTicket = await loadTicketAccessContext(pool, identity, id)
  assertTicketFound(accessTicket)
  if (!canManageTicket(identity, accessTicket)) {
    throw createHttpError(403, 'Anda tidak memiliki akses untuk mengubah tiket ini.')
  }

  const updateResult = await withTransaction(async (client) => {
    const lockedAccessTicket = await loadTicketAccessContext(client, identity, id, {
      forUpdate: true,
    })
    assertTicketFound(lockedAccessTicket)
    if (!canManageTicket(identity, lockedAccessTicket)) {
      throw createHttpError(409, 'Scope tiket berubah; muat ulang sebelum memperbarui.')
    }

    const check = await client.query(
      `SELECT
       id,
       nomor_tiket,
       judul,
       kategori,
       prioritas,
       status_tiket,
       attachment_count,
       queue_id
     FROM tickets
     WHERE id = $1
     FOR UPDATE`,
      [id],
    )
    if (check.rowCount === 0) throw createHttpError(404, 'Tiket tidak ditemukan.')
    const oldTicket = check.rows[0]

    const { judul, deskripsi, prioritas, status_tiket, queue_id, attachment } = update

    if (
      status_tiket !== undefined &&
      !canTransitionTicketStatus(oldTicket.status_tiket, status_tiket)
    ) {
      throw createHttpError(
        409,
        `Perubahan status dari ${oldTicket.status_tiket} ke ${status_tiket} tidak diizinkan.`,
      )
    }

    // Jika queue berubah, validasi queue baru
    let newQueueId = oldTicket.queue_id
    let queueKode = oldTicket.kategori
    if (queue_id !== undefined) {
      const targetQueueId = parsePositiveId(queue_id, 'Unit tujuan tidak valid.')
      newQueueId = targetQueueId
      if (targetQueueId === Number(oldTicket.queue_id)) {
        newQueueId = oldTicket.queue_id
      } else {
        const queueCheck = await client.query(
          `SELECT
           q.id,
           q.kode,
           EXISTS (
             SELECT 1
             FROM user_ticket_queues utq
             WHERE utq.user_id = $2
               AND utq.queue_id = q.id
           ) AS is_queue_member
         FROM ticket_queues q
         WHERE q.id = $1
           AND q.is_active = true`,
          [targetQueueId, identity.id],
        )
        if (queueCheck.rowCount === 0) throw createHttpError(400, 'Unit tujuan tidak valid.')
        const targetQueueTicket = {
          ...lockedAccessTicket,
          queue_id: queueCheck.rows[0].id,
          assigned_to_user_id: null,
          is_queue_member: queueCheck.rows[0].is_queue_member === true,
        }
        if (!canManageTicket(identity, targetQueueTicket)) {
          throw createHttpError(403, 'Anda tidak memiliki akses ke unit tujuan.')
        }
        queueKode = queueCheck.rows[0].kode
        newQueueId = queueCheck.rows[0].id
      }
    }

    if (attachment) {
      await client.query(
        `INSERT INTO komentar_tiket (id_tiket, user_id, pesan, attachment_data)
         VALUES ($1, $2, $3, $4)`,
        [id, identity.id, 'Lampiran Kendala (Perubahan)', attachment],
      )
      await client.query(
        `UPDATE tickets SET attachment_count = COALESCE(attachment_count, 0) + 1 WHERE id = $1`,
        [id],
      )
    }

    const wasResolved = isTicketResolutionStatus(oldTicket.status_tiket)
    const willBeResolved =
      status_tiket === undefined ? wasResolved : isTicketResolutionStatus(status_tiket)
    const isResolving = status_tiket !== undefined && willBeResolved && !wasResolved
    const isReopening = status_tiket !== undefined && wasResolved && !willBeResolved
    const queueChanged = Number(newQueueId) !== Number(oldTicket.queue_id)

    if (isReopening) {
      const ratingResult = await client.query(
        'SELECT 1 FROM ticket_casp_ratings WHERE id_tiket = $1 LIMIT 1',
        [id],
      )
      if (ratingResult.rowCount > 0) {
        throw createHttpError(
          409,
          'Tiket yang sudah memiliki penilaian CASP tidak dapat dibuka kembali.',
        )
      }
    }

    const result = await client.query(
      `UPDATE tickets t
        SET judul       = COALESCE($1, judul),
            deskripsi   = COALESCE($2, deskripsi),
            kategori    = CASE WHEN $10 = TRUE THEN $3 ELSE kategori END,
            prioritas   = COALESCE($4, prioritas),
            status_tiket = COALESCE($5, status_tiket),
            queue_id    = CASE WHEN $10 = TRUE THEN $6 ELSE queue_id END,
            resolved_at = CASE
              WHEN $11 = TRUE THEN CURRENT_TIMESTAMP
              WHEN $12 = TRUE THEN NULL
              ELSE resolved_at
            END,
            resolved_by_user_id = CASE
              WHEN $11 = TRUE THEN $9
              WHEN $12 = TRUE THEN NULL
              ELSE resolved_by_user_id
            END,
            assigned_to_user_id = CASE WHEN $13 = TRUE THEN NULL ELSE assigned_to_user_id END,
            updated_at  = CURRENT_TIMESTAMP
      WHERE t.id = $7
        AND t.deleted_at IS NULL
        AND (
          $8 = TRUE
          OR t.assigned_to_user_id = $9
          OR EXISTS (
            SELECT 1
            FROM user_ticket_queues current_scope
            WHERE current_scope.user_id = $9
              AND current_scope.queue_id = t.queue_id
          )
        )
        AND (
          $8 = TRUE
          OR $10 = FALSE
          OR $6 = t.queue_id
          OR EXISTS (
            SELECT 1
            FROM user_ticket_queues target_scope
            WHERE target_scope.user_id = $9
              AND target_scope.queue_id = $6
          )
        )
      RETURNING t.*`,
      [
        judul,
        deskripsi,
        queueKode,
        prioritas,
        status_tiket,
        newQueueId,
        id,
        identity.role === TICKET_ROLES.SUPERADMIN,
        identity.id,
        queue_id !== undefined,
        isResolving,
        isReopening,
        queueChanged,
      ],
    )
    if (result.rowCount === 0) {
      throw createHttpError(409, 'Scope tiket berubah; muat ulang sebelum memperbarui.')
    }

    const transactionTicket = result.rows[0]
    const changes = []
    if (judul && judul !== oldTicket.judul) changes.push(`Judul diubah menjadi '${judul}'`)
    if (status_tiket && status_tiket !== oldTicket.status_tiket)
      changes.push(`Status: '${oldTicket.status_tiket}' → '${status_tiket}'`)
    if (prioritas && prioritas !== oldTicket.prioritas)
      changes.push(`Prioritas: '${oldTicket.prioritas}' → '${prioritas}'`)
    if (queueChanged) changes.push('Unit tujuan diubah dan assignment lama dikosongkan')
    if (attachment) changes.push('Lampiran diperbarui')

    const aksi =
      status_tiket && status_tiket !== oldTicket.status_tiket
        ? isResolving
          ? 'RESOLVE'
          : 'PERUBAHAN_STATUS'
        : 'UPDATE_DETAIL'

    const logDetail = isResolving
      ? `Tiket diselesaikan oleh ${identity.name}; menunggu penilaian CASP dari pelapor.`
      : changes.join('. ') || 'Detail tiket diperbarui'

    await addTicketLog(client, id, oldTicket.nomor_tiket, aksi, logDetail, identity.name)
    return { ticket: transactionTicket, changes }
  })

  await broadcastTicketEvent('TICKET_UPDATED', updateResult.ticket, {
    actorUserId: identity.id,
    changes: updateResult.changes,
  })

  res.json(withoutInlineAttachment(updateResult.ticket))
}

// ── CLAIM TICKET (atomic) ─────────────────────────────────────
export async function claimTicket(req, res) {
  const id = parsePositiveId(req.params.id)
  const identity = assertCanonicalTicketIdentity(req)
  if (!identity.name) throw createHttpError(403, 'Identitas actor tidak lengkap.')

  const accessTicket = await loadTicketAccessContext(pool, identity, id)
  assertTicketFound(accessTicket)
  if (!canClaimTicket(identity, accessTicket)) {
    if (accessTicket.assigned_to_user_id != null) {
      throw createHttpError(409, 'Tiket sudah diambil oleh admin lain.')
    }
    if (['Closed', 'Resolved', 'Cancelled'].includes(accessTicket.status_tiket)) {
      throw createHttpError(409, 'Tiket yang sudah selesai tidak dapat diambil.')
    }
    throw createHttpError(403, 'Anda tidak memiliki akses ke queue tiket ini.')
  }

  const ticket = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE tickets t
        SET assigned_to_user_id = $1,
            status_tiket = 'In Progress',
            updated_at = CURRENT_TIMESTAMP
      WHERE t.id = $2
        AND t.deleted_at IS NULL
        AND t.assigned_to_user_id IS NULL
        AND t.status_tiket NOT IN ('Closed', 'Resolved', 'Cancelled')
        AND (
          $3 = TRUE
          OR EXISTS (
            SELECT 1
            FROM user_ticket_queues utq
            WHERE utq.user_id = $1
              AND utq.queue_id = t.queue_id
          )
        )
      RETURNING *`,
      [identity.id, id, identity.role === TICKET_ROLES.SUPERADMIN],
    )

    if (result.rowCount === 0) {
      throw createHttpError(409, 'Tiket berubah atau sudah diambil oleh admin lain.')
    }

    const claimedTicket = result.rows[0]
    await addTicketLog(
      client,
      id,
      claimedTicket.nomor_tiket,
      'CLAIM',
      `Tiket diambil oleh ${identity.name}.`,
      identity.name,
    )
    return claimedTicket
  })

  await broadcastTicketEvent('TICKET_UPDATED', ticket, {
    actorUserId: identity.id,
    changes: [`Ditangani oleh ${identity.name}`, `Status: 'Open' → 'In Progress'`],
  })

  res.json(withoutInlineAttachment(ticket))
}

// ── REASSIGN TICKET ───────────────────────────────────────────
export async function reassignTicket(req, res) {
  const id = parsePositiveId(req.params.id)
  const identity = assertCanonicalTicketIdentity(req)
  if (!identity.name) throw createHttpError(403, 'Identitas actor tidak lengkap.')

  const { target_user_id } = req.body
  if (!target_user_id) throw createHttpError(400, 'target_user_id wajib diisi.')
  const targetUserId = parsePositiveId(target_user_id, 'target_user_id tidak valid.')

  const ticket = await loadTicketAccessContext(pool, identity, id)
  assertTicketFound(ticket)
  if (!canReassignTicket(identity, ticket)) {
    throw createHttpError(
      403,
      'Hanya assignee saat ini atau superadmin yang dapat melakukan reassign.',
    )
  }

  const targetUser = await pool.query(
    `SELECT
       u.id,
       u.nama,
       u.role,
       u.permissions,
       EXISTS (
         SELECT 1
         FROM user_ticket_queues utq
         WHERE utq.user_id = u.id
           AND utq.queue_id = $2
       ) AS is_queue_member
     FROM users u
     WHERE u.id = $1
       AND u.is_active = true`,
    [targetUserId, ticket.queue_id],
  )
  if (targetUser.rowCount === 0) {
    throw createHttpError(404, 'User tujuan tidak ditemukan atau tidak aktif.')
  }

  const target = targetUser.rows[0]
  const targetRole = normalizeTicketRole(target.role)
  const targetIsWritableQueueAdmin =
    targetRole === TICKET_ROLES.ADMIN &&
    target.is_queue_member === true &&
    hasTicketWritePermission(target)
  const targetIsSuperadminForSuperActor =
    identity.role === TICKET_ROLES.SUPERADMIN && targetRole === TICKET_ROLES.SUPERADMIN
  const targetAllowed = targetIsWritableQueueAdmin || targetIsSuperadminForSuperActor
  if (!targetAllowed) {
    throw createHttpError(
      403,
      'User tujuan harus admin aktif dengan akses tulis pada queue tiket ini.',
    )
  }

  const reassignedTicket = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE tickets AS t
        SET assigned_to_user_id = $1,
            updated_at = CURRENT_TIMESTAMP
      WHERE t.id = $2
        AND t.deleted_at IS NULL
        AND t.assigned_to_user_id IS NOT DISTINCT FROM $3
        AND t.queue_id IS NOT DISTINCT FROM $4
        AND LOWER(TRIM(t.status_tiket)) NOT IN ('closed', 'resolved', 'cancelled')
        AND EXISTS (
          SELECT 1
          FROM users target_user
          WHERE target_user.id = $1
            AND target_user.is_active = true
            AND (
              (
                $5 = TRUE
                AND LOWER(TRIM(target_user.role)) IN ('superadmin', 'super admin')
              )
              OR (
                LOWER(TRIM(target_user.role)) = 'admin'
                AND (
                  LOWER(TRIM(target_user.permissions ->> 'tickets')) = 'full'
                  OR target_user.permissions -> 'tickets' = 'true'::jsonb
                )
                AND EXISTS (
                  SELECT 1
                  FROM user_ticket_queues target_scope
                  WHERE target_scope.user_id = target_user.id
                    AND target_scope.queue_id = t.queue_id
                )
              )
            )
        )
      RETURNING t.*`,
      [
        targetUserId,
        id,
        ticket.assigned_to_user_id,
        ticket.queue_id,
        identity.role === TICKET_ROLES.SUPERADMIN,
      ],
    )
    if (result.rowCount === 0) {
      throw createHttpError(
        409,
        'Assignment, queue, atau status tiket berubah; muat ulang sebelum reassign.',
      )
    }

    await addTicketLog(
      client,
      id,
      ticket.nomor_tiket,
      'REASSIGN',
      `Tiket di-reassign ke ${target.nama} oleh ${identity.name}.`,
      identity.name,
    )
    return result.rows[0]
  })
  await broadcastTicketEvent('TICKET_UPDATED', reassignedTicket, {
    actorUserId: identity.id,
    changes: [`Dialihkan ke ${target.nama}`],
  })

  res.json(withoutInlineAttachment(reassignedTicket))
}

// ── DELETE TICKET ─────────────────────────────────────────────
export async function deleteTicket(req, res) {
  const id = parsePositiveId(req.params.id)
  const identity = assertCanonicalTicketIdentity(req)
  const deletedTicket = await withTransaction(async (client) => {
    const ticket = await loadTicketAccessContext(client, identity, id, { forUpdate: true })
    assertTicketFound(ticket)
    if (!canDeleteTicket(identity, ticket)) {
      throw createHttpError(403, 'Hanya superadmin yang dapat menghapus tiket.')
    }

    const deletionReason = 'Dihapus oleh superadmin melalui aplikasi.'
    const result = await client.query(
      `UPDATE tickets
          SET deleted_at = CURRENT_TIMESTAMP,
              deleted_by_user_id = $2,
              deletion_reason = $3,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND deleted_at IS NULL
      RETURNING *`,
      [id, identity.id, deletionReason],
    )
    if (result.rowCount === 0) {
      throw createHttpError(409, 'Tiket sudah dihapus atau berubah; muat ulang halaman.')
    }

    await addTicketLog(
      client,
      id,
      ticket.nomor_tiket,
      'HAPUS',
      deletionReason,
      identity.name,
    )
    return result.rows[0]
  })

  await broadcastTicketEvent('TICKET_UPDATED', deletedTicket, {
    actorUserId: identity.id,
    changes: ['Tiket dihapus'],
  })
  res.json({ message: 'Tiket berhasil dihapus.' })
}

// ── GET CASP RATING ───────────────────────────────────────────
export async function getTicketCasp(req, res) {
  const id = parsePositiveId(req.params.id)
  const identity = assertCanonicalTicketIdentity(req)
  const ticket = await loadTicketAccessContext(pool, identity, id)
  assertTicketCaspRead(identity, ticket)

  const caspRes = await pool.query(
    `SELECT
       rating,
       feedback,
       submitted_at,
       reporter_name_snapshot,
       assignee_name_snapshot
     FROM ticket_casp_ratings
     WHERE ticket_id = $1`,
    [id],
  )
  const existingRating = caspRes.rows[0] || null

  const isReporter = isTicketReporter(identity, ticket)
  const isAssignee = isTicketAssignee(identity, ticket)
  const isResolved = isResolvedTicket(ticket)

  let eligible = false
  let reason = null

  if (existingRating) {
    reason = 'CASP sudah dikirim.'
  } else if (!isResolved) {
    reason = 'Tiket belum berstatus Resolved atau Closed.'
  } else if (isAssignee) {
    reason = 'Petugas penanggung jawab tidak dapat memberikan penilaian CASP.'
  } else if (!isReporter || !canRateTicket(identity, ticket)) {
    reason = 'Hanya pelapor tiket yang dapat memberikan penilaian CASP.'
  } else {
    eligible = true
  }

  const ratingLabels = {
    1: 'Sangat Tidak Puas',
    2: 'Tidak Puas',
    3: 'Cukup',
    4: 'Puas',
    5: 'Sangat Puas',
  }

  res.json({
    eligible,
    reason,
    rating: existingRating
      ? {
          value: existingRating.rating,
          label: ratingLabels[existingRating.rating] || '',
          feedback: existingRating.feedback,
          submittedAt: existingRating.submitted_at,
          reporterName: existingRating.reporter_name_snapshot,
          assigneeName: existingRating.assignee_name_snapshot,
        }
      : null,
    labels: ratingLabels,
  })
}

// ── SUBMIT CASP RATING ────────────────────────────────────────
export async function submitTicketCasp(req, res) {
  const id = parsePositiveId(req.params.id)
  const identity = assertCanonicalTicketIdentity(req)
  if (!identity.name) throw createHttpError(403, 'Identitas pelapor tidak lengkap.')

  const { rating, feedback } = req.body
  const numericRating = rating
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw createHttpError(400, 'Rating CASP wajib diisi dengan nilai angka 1 - 5.')
  }
  const normalizedFeedback =
    typeof feedback === 'string' && feedback.trim() ? feedback.trim() : null
  if (normalizedFeedback && normalizedFeedback.length > MAX_COMMENT_LENGTH) {
    throw createHttpError(400, `Feedback CASP maksimal ${MAX_COMMENT_LENGTH} karakter.`)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const ticket = await loadTicketAccessContext(client, identity, id, {
      forUpdate: true,
    })
    assertTicketCaspRead(identity, ticket)
    if (!canRateTicket(identity, ticket)) {
      throw createHttpError(403, 'Hanya pelapor tiket yang dapat memberikan penilaian CASP.')
    }

    if (!isResolvedTicket(ticket)) {
      throw createHttpError(409, 'Tiket belum berstatus Resolved atau Closed.')
    }

    const checkCasp = await client.query(
      'SELECT id FROM ticket_casp_ratings WHERE ticket_id = $1',
      [id],
    )
    if (checkCasp.rowCount > 0) {
      throw createHttpError(409, 'Penilaian CASP untuk tiket ini sudah pernah dikirim.')
    }

    const reporterName = identity.name
    const assigneeName = ticket.assigned_to || 'Belum Ditugaskan'

    const insertRes = await client.query(
      `INSERT INTO ticket_casp_ratings
         (ticket_id, reporter_user_id, assignee_user_id, reporter_name_snapshot, assignee_name_snapshot, rating, feedback)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING rating, feedback, submitted_at`,
      [
        id,
        identity.id,
        ticket.assigned_to_user_id || null,
        reporterName,
        assigneeName,
        numericRating,
        normalizedFeedback,
      ],
    )

    const labelMap = {
      1: 'Sangat Tidak Puas',
      2: 'Tidak Puas',
      3: 'Cukup',
      4: 'Puas',
      5: 'Sangat Puas',
    }
    const ratingLabel = labelMap[numericRating] || ''

    await client.query(
      `INSERT INTO log_riwayat_tiket (id_tiket, nomor_tiket, aksi, perubahan, oleh_pengguna) VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        ticket.nomor_tiket,
        'CASP_SUBMITTED',
        `Pelapor memberikan penilaian CASP ${numericRating}/5 (${ratingLabel}).`,
        reporterName,
      ],
    )

    await client.query('COMMIT')

    await broadcastTicketEvent('TICKET_UPDATED', ticket, {
      actorUserId: identity.id,
      changes: [`CASP rating ${numericRating}/5 diterima`],
    })

    res.status(201).json(insertRes.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
