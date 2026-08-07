import { EventEmitter } from 'events'
import {
  canReceiveTicketEvent,
  createTicketIdentity,
  isCanonicalTicketIdentity,
} from './ticketAccessService.js'
import { handleTicketEventNotification } from './emailNotificationService.js'

export const realtimeEmitter = new EventEmitter()

const SUPPORTED_TICKET_EVENTS = new Set([
  'TICKET_CREATED',
  'TICKET_UPDATED',
  'COMMENT_CREATED',
])

// Events that represent a change to an existing ticket (not creation)
const TICKET_CHANGE_EVENTS = new Set([
  'TICKET_UPDATED',
  'COMMENT_CREATED',
])

const sseClients = new Set()
const DEFAULT_MAX_SSE_CLIENTS = 500
const DEFAULT_MAX_SSE_CONNECTIONS_PER_USER = 10
const DEFAULT_HEARTBEAT_INTERVAL_MS = 25_000

function createSseCapacityError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function countUserConnections(userId) {
  const normalizedUserId = Number(userId)
  if (!Number.isSafeInteger(normalizedUserId) || normalizedUserId <= 0) return 0

  let count = 0
  for (const client of sseClients) {
    if (client.__ticketEventContext?.identity?.id === normalizedUserId) count += 1
  }
  return count
}

export function assertSseCapacity(
  userOrIdentity,
  {
    maxClients = DEFAULT_MAX_SSE_CLIENTS,
    maxConnectionsPerUser = DEFAULT_MAX_SSE_CONNECTIONS_PER_USER,
  } = {},
) {
  const identity = isCanonicalTicketIdentity(userOrIdentity)
    ? userOrIdentity
    : createTicketIdentity(userOrIdentity)

  if (sseClients.size >= maxClients) {
    throw createSseCapacityError(503, 'Kapasitas koneksi realtime sedang penuh. Coba lagi nanti.')
  }
  if (identity.valid && countUserConnections(identity.id) >= maxConnectionsPerUser) {
    throw createSseCapacityError(429, 'Terlalu banyak koneksi realtime untuk akun ini.')
  }

  return identity
}

function normalizeQueueIds(queueIds) {
  if (!Array.isArray(queueIds)) return new Set()
  return new Set(
    queueIds
      .map((queueId) => Number(queueId))
      .filter((queueId) => Number.isSafeInteger(queueId) && queueId > 0)
      .map(String),
  )
}

/**
 * Register a client with the canonical identity. Queue membership is resolved
 * again from the database for every broadcast so revocation takes effect
 * without waiting for a reconnect.
 */
export function addSseClient(res, userOrIdentity, queueIds = [], options = {}) {
  const identity = assertSseCapacity(userOrIdentity, options)

  res.__ticketEventContext = {
    identity,
    queueIds: normalizeQueueIds(queueIds),
  }
  sseClients.add(res)

  let expirationTimer = null
  let heartbeatTimer = null
  let removed = false
  const removeClient = () => {
    if (removed) return
    removed = true
    if (expirationTimer) clearTimeout(expirationTimer)
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    expirationTimer = null
    heartbeatTimer = null
    sseClients.delete(res)
    res.off?.('close', removeClient)
    res.off?.('error', removeClient)
  }
  res.__ticketEventCleanup = removeClient

  const expiresAt = Number(options.expiresAt)
  const expirationDelay =
    Number.isFinite(expiresAt) && expiresAt > Date.now() ? expiresAt - Date.now() : null
  expirationTimer =
    expirationDelay === null
      ? null
      : setTimeout(() => {
          if (typeof res.end === 'function') res.end()
          removeClient()
        }, Math.min(expirationDelay, 2_147_483_647))
  expirationTimer?.unref?.()

  const heartbeatIntervalMs = Number(options.heartbeatIntervalMs)
  const normalizedHeartbeatIntervalMs =
    Number.isFinite(heartbeatIntervalMs) && heartbeatIntervalMs > 0
      ? heartbeatIntervalMs
      : DEFAULT_HEARTBEAT_INTERVAL_MS
  heartbeatTimer = setInterval(() => {
    try {
      if (res.write(': heartbeat\n\n') === false) endSseClient(res)
    } catch {
      endSseClient(res)
    }
  }, normalizedHeartbeatIntervalMs)
  heartbeatTimer.unref?.()

  res.on('close', removeClient)
  res.on('error', removeClient)
  return removeClient
}

function endSseClient(client) {
  client.__ticketEventCleanup?.()
  try {
    if (typeof client.end === 'function') client.end()
  } catch {
    // Client sudah terputus; cleanup lokal di atas tetap berlaku.
  }
}

function eventTicketFacts(ticket, clientContext) {
  if (!ticket || !clientContext) return null
  const queueId = Number(ticket.queue_id)
  const isQueueMember =
    Number.isSafeInteger(queueId) &&
    queueId > 0 &&
    clientContext.queueIds.has(String(queueId))

  return {
    id: ticket.id,
    status_tiket: ticket.status_tiket,
    queue_id: ticket.queue_id,
    pelapor_user_id: ticket.pelapor_user_id,
    assigned_to_user_id: ticket.assigned_to_user_id,
    is_queue_member: isQueueMember,
  }
}

/**
 * Role-based notification delivery:
 * - superadmin: receives ALL ticket events EXCEPT those they triggered themselves
 * - admin: receives ALL ticket events for tickets they can read (queue membership or
 *   assigned to them), EXCEPT those they triggered themselves. Admin/superadmin both
 *   act as ticket handlers, so they must see new tickets, status changes, and comments
 *   in realtime to respond promptly.
 * - user (reporter): receives ONLY change events (TICKET_UPDATED, COMMENT_CREATED)
 *   on tickets they reported — never TICKET_CREATED (no "new ticket" spam for users).
 */
export function shouldDeliverTicketEvent(eventType, ticket, clientContext) {
  if (!SUPPORTED_TICKET_EVENTS.has(eventType)) return false
  if (!clientContext?.identity?.valid) return false

  const scopedTicket = eventTicketFacts(ticket, clientContext)
  if (scopedTicket === null) return false

  const identity = clientContext.identity
  const role = identity.role
  const actorUserId = ticket?._actor_user_id != null ? Number(ticket._actor_user_id) : null
  const isSelfAction = actorUserId !== null && actorUserId === identity.id

  // ── SUPERADMIN ──
  // Receives all events on all tickets, except self-triggered actions.
  if (role === 'superadmin') {
    if (isSelfAction) return false
    return canReceiveTicketEvent(identity, scopedTicket)
  }

  // ── ADMIN ──
  // Receives ALL event types (created, updated, comment) for tickets they can read
  // (queue membership or assigned to them). Self-triggered actions are excluded so
  // an admin doesn't get notified about their own update/comment.
  if (role === 'admin') {
    if (isSelfAction) return false
    return canReceiveTicketEvent(identity, scopedTicket)
  }

  // ── USER / REPORTER ──
  // Only receives change events (TICKET_UPDATED, COMMENT_CREATED) on tickets they
  // reported. Does NOT receive TICKET_CREATED. Self-triggered actions (e.g. the
  // reporter commenting on their own ticket) are excluded.
  if (role === 'reporter') {
    if (isSelfAction) return false
    if (!TICKET_CHANGE_EVENTS.has(eventType)) return false
    // Must be the reporter of this ticket
    const reporterUserId = Number(scopedTicket.pelapor_user_id)
    if (reporterUserId !== identity.id) return false
    return canReceiveTicketEvent(identity, scopedTicket)
  }

  return false
}

/**
 * Public event payloads are invalidation/notification DTOs, never database rows.
 * Routing facts remain server-side and are not serialized.
 */
export function buildTicketEventDto(eventType, ticket) {
  if (!SUPPORTED_TICKET_EVENTS.has(eventType) || !ticket) return null

  // Include actor_user_id in all event payloads so the frontend knows who triggered the event
  const actorUserId = ticket._actor_user_id ?? null
  const changes = Array.isArray(ticket._changes) && ticket._changes.length > 0
    ? ticket._changes
    : null

  if (eventType === 'COMMENT_CREATED') {
    return { ticketId: ticket.id, actor_user_id: actorUserId, changes: ['Komentar baru ditambahkan'] }
  }

  return {
    id: ticket.id,
    nomor_tiket: ticket.nomor_tiket ?? null,
    judul: ticket.judul ?? null,
    status_tiket: ticket.status_tiket ?? null,
    prioritas: ticket.prioritas ?? null,
    dibuat_pada: ticket.dibuat_pada ?? null,
    diperbarui_pada: ticket.diperbarui_pada ?? null,
    pelapor: ticket.pelapor_nama ?? ticket.pelapor ?? null,
    actor_user_id: actorUserId,
    changes,
  }
}

function isLiveSessionRole(role) {
  if (typeof role !== 'string') return false
  const normalized = role.trim().toLowerCase()
  return (
    normalized === 'user' ||
    normalized === 'admin' ||
    normalized === 'superadmin' ||
    normalized === 'super admin'
  )
}

async function resolveLiveClientContexts(ticket, queryable) {
  const queueId = Number(ticket?.queue_id)
  const normalizedQueueId =
    Number.isSafeInteger(queueId) && queueId > 0 ? queueId : null
  const clientIds = [
    ...new Set(
      [...sseClients]
        .map((client) => client.__ticketEventContext?.identity)
        .filter(
          (identity) =>
            identity?.valid &&
            Number.isSafeInteger(identity.id) &&
            identity.id > 0,
        )
        .map((identity) => identity.id),
    ),
  ]
  if (clientIds.length === 0) {
    return { resolved: true, contexts: new Map() }
  }

  try {
    const liveUserQueryable = queryable || (await import('../config/database.js')).pool
    const result = await liveUserQueryable.query(
      `/* canonical-sse-users */
       SELECT
         u.id,
         u.nama,
         u.role,
         u.permissions,
         EXISTS (
           SELECT 1
           FROM user_ticket_queues utq
           WHERE utq.user_id = u.id
             AND utq.queue_id = $1
         ) AS is_queue_member
       FROM users u
       WHERE u.is_active = true
         AND u.id = ANY($2::bigint[])`,
      [normalizedQueueId, clientIds],
    )

    const contexts = new Map()
    for (const row of result.rows) {
      if (!isLiveSessionRole(row.role)) continue
      const identity = createTicketIdentity(row)
      if (!identity.valid) continue

      contexts.set(String(identity.id), {
        identity,
        queueIds:
          row.is_queue_member === true && normalizedQueueId !== null
            ? new Set([String(normalizedQueueId)])
            : new Set(),
      })
    }
    return { resolved: true, contexts }
  } catch {
    // Realtime tetap fail closed, tetapi error lookup sementara tidak dianggap
    // sebagai bukti bahwa akun harus diputus permanen.
    return { resolved: false, contexts: new Map() }
  }
}

export async function broadcastTicketEvent(eventType, ticket, { queryable, actorUserId, changes, comment } = {}) {
  // Trigger email notification asynchronously in background (non-blocking)
  setImmediate(() => {
    handleTicketEventNotification(eventType, ticket, { queryable, actorUserId, changes, comment })
  })

  // Attach actor info and change descriptions to the ticket object for delivery/DTO
  const extra = {}
  if (actorUserId != null) extra._actor_user_id = actorUserId
  if (Array.isArray(changes) && changes.length > 0) extra._changes = changes
  if (Object.keys(extra).length > 0) ticket = { ...ticket, ...extra }
  const payload = buildTicketEventDto(eventType, ticket)
  if (payload === null) return 0
  if (sseClients.size === 0) return 0

  const data = JSON.stringify({
    type: eventType,
    data: payload,
    timestamp: Date.now(),
  })
  const liveClients = await resolveLiveClientContexts(ticket, queryable)
  let delivered = 0

  for (const client of sseClients) {
    const storedContext = client.__ticketEventContext
    const lookupKey = String(storedContext?.identity?.id)
    const liveContext = liveClients.contexts.get(lookupKey)
    if (!liveContext && liveClients.resolved) {
      endSseClient(client)
      continue
    }
    const shouldDeliver = shouldDeliverTicketEvent(eventType, ticket, liveContext)
    if (!shouldDeliver) continue
    try {
      if (client.write(`data: ${data}\n\n`) === false) {
        endSseClient(client)
        continue
      }
      delivered += 1
    } catch {
      endSseClient(client)
    }
  }

  return delivered
}

export function closeAllSseClients() {
  const clients = [...sseClients]
  for (const client of clients) endSseClient(client)
  return clients.length
}

// Compatibility export for extensions that imported the old function name.
export const broadcastEvent = broadcastTicketEvent
