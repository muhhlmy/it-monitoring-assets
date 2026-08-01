import { pool, withTransaction } from '../config/database.js'
import {
  TICKET_ROLES,
  canListQueueAdmins,
  createTicketIdentity,
  isSuperAdmin,
  normalizeTicketRole,
} from '../services/ticketAccessService.js'
import { hasWritePermissionLevel } from '../services/permissionService.js'
import {
  assertAllowedFields,
  assertPlainObject,
  parseOptionalBoolean,
  parsePositiveInteger,
  parsePositiveIntegerParam,
} from '../security/requestValidation.js'

const QUEUE_ADMIN_CREATE_FIELDS = new Set(['user_id', 'is_primary'])

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

  const queueId = parsePositiveIntegerParam(req.params.queueId, 'Queue ID')

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
       AND u.deleted_at IS NULL
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

  assertPlainObject(req.body, 'Payload mapping queue harus berupa object JSON.')
  assertAllowedFields(req.body, QUEUE_ADMIN_CREATE_FIELDS, 'Payload mapping queue')
  const queueId = parsePositiveIntegerParam(req.params.queueId, 'Queue ID')
  const userId = parsePositiveInteger(req.body.user_id, 'User ID')
  const isPrimary = parseOptionalBoolean(req.body.is_primary, 'is_primary') ?? false

  await withTransaction(async (client) => {
    const queueCheck = await client.query(
      `SELECT id
         FROM ticket_queues
        WHERE id = $1
          AND is_active = true
          AND deleted_at IS NULL
        FOR UPDATE`,
      [queueId],
    )
    if (queueCheck.rowCount === 0) {
      throw createHttpError(404, 'Queue tidak ditemukan atau tidak aktif.')
    }

    const userCheck = await client.query(
      `SELECT id, role, permissions
         FROM users
        WHERE id = $1
          AND is_active = true
        FOR UPDATE`,
      [userId],
    )
    if (userCheck.rowCount === 0) {
      throw createHttpError(404, 'User tidak ditemukan atau tidak aktif.')
    }

    const target = userCheck.rows[0]
    if (
      normalizeTicketRole(target.role) !== TICKET_ROLES.ADMIN ||
      !hasWritePermissionLevel(target.permissions?.tickets)
    ) {
      throw createHttpError(403, 'Target wajib admin aktif dengan permission tickets full.')
    }

    if (isPrimary) {
      await client.query(
        `UPDATE user_ticket_queues
            SET is_primary = false
          WHERE user_id = $1
            AND is_primary = true`,
        [userId],
      )
    }

    await client.query(
      `INSERT INTO user_ticket_queues (user_id, queue_id, is_primary)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, queue_id)
       DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [userId, queueId, isPrimary],
    )
  })
  res.status(201).json({ message: 'Admin berhasil ditambahkan ke queue.' })
}

// DELETE /api/ticket-queues/:queueId/admins/:userId
export async function removeAdminFromQueue(req, res) {
  if (!isSuperAdmin(req.user.role)) throw createHttpError(403, 'Hanya superadmin yang dapat mengatur mapping admin.')
  const queueId = parsePositiveIntegerParam(req.params.queueId, 'Queue ID')
  const userId = parsePositiveIntegerParam(req.params.userId, 'User ID')
  const result = await pool.query('DELETE FROM user_ticket_queues WHERE user_id = $1 AND queue_id = $2 RETURNING *', [userId, queueId])
  if (result.rowCount === 0) throw createHttpError(404, 'Mapping tidak ditemukan.')
  res.json({ message: 'Admin berhasil dihapus dari queue.' })
}
