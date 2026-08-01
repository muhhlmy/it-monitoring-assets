import { EventEmitter } from 'events'
import {
  canReceiveTicketEvent,
  createTicketIdentity,
  isCanonicalTicketIdentity,
} from './ticketAccessService.js'

export const realtimeEmitter = new EventEmitter()

const SUPPORTED_TICKET_EVENTS = new Set([
  'TICKET_CREATED',
  'TICKET_UPDATED',
  'COMMENT_CREATED',
])

const sseClients = new Set()

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
  const identity = isCanonicalTicketIdentity(userOrIdentity)
    ? userOrIdentity
    : createTicketIdentity(userOrIdentity)

  res.__ticketEventContext = {
    identity,
    queueIds: normalizeQueueIds(queueIds),
  }
  sseClients.add(res)

  let expirationTimer = null
  const removeClient = () => {
    if (expirationTimer) clearTimeout(expirationTimer)
    expirationTimer = null
    sseClients.delete(res)
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

  res.on('close', removeClient)
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

export function shouldDeliverTicketEvent(eventType, ticket, clientContext) {
  if (!SUPPORTED_TICKET_EVENTS.has(eventType)) return false
  if (!clientContext?.identity?.valid) return false

  const scopedTicket = eventTicketFacts(ticket, clientContext)
  return scopedTicket !== null && canReceiveTicketEvent(clientContext.identity, scopedTicket)
}

/**
 * Public event payloads are invalidation/notification DTOs, never database rows.
 * Routing facts remain server-side and are not serialized.
 */
export function buildTicketEventDto(eventType, ticket) {
  if (!SUPPORTED_TICKET_EVENTS.has(eventType) || !ticket) return null

  if (eventType === 'COMMENT_CREATED') {
    return { ticketId: ticket.id }
  }

  return {
    id: ticket.id,
    nomor_tiket: ticket.nomor_tiket ?? null,
    judul: ticket.judul ?? null,
    status_tiket: ticket.status_tiket ?? null,
    prioritas: ticket.prioritas ?? null,
    dibuat_pada: ticket.dibuat_pada ?? null,
    pelapor: ticket.pelapor_nama ?? ticket.pelapor ?? null,
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

export async function broadcastTicketEvent(eventType, ticket, { queryable } = {}) {
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
    const liveContext = liveClients.contexts.get(String(storedContext?.identity?.id))
    if (!liveContext && liveClients.resolved) {
      endSseClient(client)
      continue
    }
    if (!shouldDeliverTicketEvent(eventType, ticket, liveContext)) continue
    try {
      client.write(`data: ${data}\n\n`)
      delivered += 1
    } catch {
      endSseClient(client)
    }
  }

  return delivered
}

// Compatibility export for extensions that imported the old function name.
export const broadcastEvent = broadcastTicketEvent
