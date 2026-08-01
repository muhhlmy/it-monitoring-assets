import { pool } from '../config/database.js'
import {
  TICKET_ROLES,
  canListQueueAdmins,
  createTicketIdentity,
  isSuperAdmin,
} from '../services/ticketAccessService.js'

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function getTicketIdentity(req) {
  return req.ticketIdentity || createTicketIdentity(req.user)
}

// GET /api/ticket-queues
export async function listQueues(req, res) {
  const result = await pool.query(`SELECT id, kode, nama, deskripsi, is_active FROM ticket_queues WHERE is_active = true ORDER BY kode`)
  res.json(result.rows)
}

// GET /api/ticket-queues/my
export async function listMyQueues(req, res) {
  if (isSuperAdmin(req.user.role)) {
    const result = await pool.query(`SELECT id, kode, nama, deskripsi FROM ticket_queues WHERE is_active = true ORDER BY kode`)
    return res.json(result.rows)
  }
  const result = await pool.query(
    `SELECT q.id, q.kode, q.nama, q.deskripsi, utq.is_primary FROM user_ticket_queues utq JOIN ticket_queues q ON q.id = utq.queue_id WHERE utq.user_id = $1 AND q.is_active = true ORDER BY utq.is_primary DESC, q.kode ASC`,
    [req.user.id]
  )
  res.json(result.rows)
}

// GET /api/ticket-queues/:queueId/admins
export async function listQueueAdmins(req, res) {
  const identity = getTicketIdentity(req)
  if (!identity.valid || identity.role === TICKET_ROLES.REPORTER) {
    throw createHttpError(403, 'Anda tidak memiliki akses ke direktori admin queue.')
  }

  const queueId = Number(req.params.queueId)
  if (!Number.isSafeInteger(queueId) || queueId <= 0) {
    throw createHttpError(400, 'Queue ID tidak valid.')
  }

  const queueAccess = await pool.query(
    `SELECT
       q.id,
       EXISTS (
         SELECT 1
         FROM user_ticket_queues utq
         WHERE utq.user_id = $2
           AND utq.queue_id = q.id
       ) AS is_queue_member
     FROM ticket_queues q
     WHERE q.id = $1
       AND q.is_active = true`,
    [queueId, identity.id],
  )
  if (queueAccess.rowCount === 0) throw createHttpError(404, 'Queue tidak ditemukan.')
  if (!canListQueueAdmins(identity, queueAccess.rows[0])) {
    throw createHttpError(403, 'Anda tidak memiliki akses ke direktori admin queue ini.')
  }

  const result = await pool.query(
    `SELECT DISTINCT u.id, u.nama
     FROM users u
     LEFT JOIN user_ticket_queues utq ON utq.user_id = u.id AND utq.queue_id = $1
     WHERE u.is_active = true
       AND LOWER(TRIM(u.role)) IN ('admin', 'superadmin', 'super admin')
       AND (
         (
           LOWER(TRIM(u.role)) = 'admin'
           AND utq.queue_id = $1
           AND (
             LOWER(TRIM(u.permissions ->> 'tickets')) = 'full'
             OR u.permissions -> 'tickets' = 'true'::jsonb
           )
         )
          OR (
            $2 = TRUE
            AND LOWER(TRIM(u.role)) IN ('superadmin', 'super admin')
          )
        )
     ORDER BY u.nama ASC`,
    [queueId, identity.role === TICKET_ROLES.SUPERADMIN]
  )
  res.json(result.rows.map((row) => ({ id: row.id, nama: row.nama })))
}

// POST /api/ticket-queues/:queueId/admins
export async function addAdminToQueue(req, res) {
  if (!isSuperAdmin(req.user.role)) throw createHttpError(403, 'Hanya superadmin yang dapat mengatur mapping admin.')
  const queueId = parseInt(req.params.queueId, 10)
  const { user_id, is_primary } = req.body
  if (isNaN(queueId) || !user_id) throw createHttpError(400, 'queue_id dan user_id wajib diisi.')
  const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND is_active = true', [user_id])
  if (userCheck.rowCount === 0) throw createHttpError(404, 'User tidak ditemukan atau tidak aktif.')
  await pool.query(
    `INSERT INTO user_ticket_queues (user_id, queue_id, is_primary) VALUES ($1, $2, $3) ON CONFLICT (user_id, queue_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
    [user_id, queueId, is_primary === true]
  )
  res.status(201).json({ message: 'Admin berhasil ditambahkan ke queue.' })
}

// DELETE /api/ticket-queues/:queueId/admins/:userId
export async function removeAdminFromQueue(req, res) {
  if (!isSuperAdmin(req.user.role)) throw createHttpError(403, 'Hanya superadmin yang dapat mengatur mapping admin.')
  const queueId = parseInt(req.params.queueId, 10)
  const userId  = parseInt(req.params.userId, 10)
  if (isNaN(queueId) || isNaN(userId)) throw createHttpError(400, 'ID tidak valid.')
  const result = await pool.query('DELETE FROM user_ticket_queues WHERE user_id = $1 AND queue_id = $2 RETURNING *', [userId, queueId])
  if (result.rowCount === 0) throw createHttpError(404, 'Mapping tidak ditemukan.')
  res.json({ message: 'Admin berhasil dihapus dari queue.' })
}
