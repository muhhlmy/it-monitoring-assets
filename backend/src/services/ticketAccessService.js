/**
 * Canonical, deny-by-default authorization policy for ticket resources.
 *
 * Controllers and realtime delivery must pass only server-authenticated identity
 * data and resource facts into this module. The policy itself has no mutation
 * side effects.
 */

export const TICKET_ROLES = Object.freeze({
  REPORTER: 'reporter',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
  UNKNOWN: 'unknown',
})

export const TICKET_ACTIONS = Object.freeze({
  CREATE: 'create',
  READ: 'read',
  READ_CASP: 'read_casp',
  COMMENT: 'comment',
  MANAGE: 'manage',
  DELETE: 'delete',
  RATE: 'rate',
  CLAIM: 'claim',
  REASSIGN: 'reassign',
  EVENT: 'event',
})

const TERMINAL_TICKET_STATUSES = new Set(['closed', 'resolved', 'cancelled'])
const READ_PERMISSION_LEVELS = new Set(['read_only', 'full'])
const TICKET_IDENTITY = Symbol('ticketIdentity')

const TICKET_STATUS_TRANSITIONS = Object.freeze({
  open: new Set(['in progress', 'pending', 'resolved', 'cancelled']),
  'in progress': new Set(['open', 'pending', 'resolved', 'cancelled']),
  pending: new Set(['open', 'in progress', 'resolved', 'cancelled']),
  resolved: new Set(['in progress', 'closed']),
  closed: new Set(['in progress']),
  cancelled: new Set(['open']),
})

function normalizeId(value) {
  const id = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function normalizePermissionValue(value) {
  if (value === true || value === false) return value
  return typeof value === 'string' ? value.trim().toLowerCase() : null
}

export function normalizeTicketRole(role) {
  if (typeof role !== 'string') return TICKET_ROLES.UNKNOWN

  const normalized = role.trim().toLowerCase()
  if (normalized === 'user' || normalized === 'reporter') {
    return TICKET_ROLES.REPORTER
  }
  if (normalized === 'admin') return TICKET_ROLES.ADMIN
  if (normalized === 'superadmin' || normalized === 'super admin') {
    return TICKET_ROLES.SUPERADMIN
  }
  return TICKET_ROLES.UNKNOWN
}

export function createTicketIdentity(user) {
  const id = normalizeId(user?.id)
  const role = normalizeTicketRole(user?.role)
  const name = typeof user?.nama === 'string' ? user.nama.trim() : ''
  const permissions =
    user?.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
      ? user.permissions
      : {}

  const identity = {
    id,
    name,
    role,
    permissions,
    valid: id !== null && role !== TICKET_ROLES.UNKNOWN,
  }
  Object.defineProperty(identity, TICKET_IDENTITY, { value: true })
  return Object.freeze(identity)
}

function asTicketIdentity(userOrIdentity) {
  if (userOrIdentity?.[TICKET_IDENTITY] === true) {
    return userOrIdentity
  }
  return createTicketIdentity(userOrIdentity)
}

export function isCanonicalTicketIdentity(value) {
  return value?.[TICKET_IDENTITY] === true
}

export function hasTicketReadPermission(userOrIdentity) {
  const identity = asTicketIdentity(userOrIdentity)
  if (!identity.valid) return false
  if (identity.role === TICKET_ROLES.SUPERADMIN) return true

  const permission = normalizePermissionValue(identity.permissions.tickets)
  return permission === true || READ_PERMISSION_LEVELS.has(permission)
}

export function hasTicketWritePermission(userOrIdentity) {
  const identity = asTicketIdentity(userOrIdentity)
  if (!identity.valid) return false
  if (identity.role === TICKET_ROLES.SUPERADMIN) return true

  const permission = normalizePermissionValue(identity.permissions.tickets)
  return permission === true || permission === 'full'
}

export function isSuperAdmin(role) {
  return normalizeTicketRole(role) === TICKET_ROLES.SUPERADMIN
}

export function isAdmin(role) {
  const normalized = normalizeTicketRole(role)
  return normalized === TICKET_ROLES.ADMIN || normalized === TICKET_ROLES.SUPERADMIN
}

export function sameTicketActorId(left, right) {
  const normalizedLeft = normalizeId(left)
  const normalizedRight = normalizeId(right)
  return normalizedLeft !== null && normalizedLeft === normalizedRight
}

export function isTicketReporter(userOrIdentity, ticket) {
  const identity = asTicketIdentity(userOrIdentity)
  return (
    identity.valid &&
    ticket?.pelapor_user_id != null &&
    sameTicketActorId(identity.id, ticket.pelapor_user_id)
  )
}

export function isTicketAssignee(userOrIdentity, ticket) {
  const identity = asTicketIdentity(userOrIdentity)
  return (
    identity.valid &&
    ticket?.assigned_to_user_id != null &&
    sameTicketActorId(identity.id, ticket.assigned_to_user_id)
  )
}

export function isTicketOpenForComment(ticket) {
  const status =
    typeof ticket?.status_tiket === 'string' ? ticket.status_tiket.trim().toLowerCase() : ''
  return status !== '' && !TERMINAL_TICKET_STATUSES.has(status)
}

export function normalizeTicketStatus(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isTicketResolutionStatus(value) {
  const status = normalizeTicketStatus(value)
  return status === 'resolved' || status === 'closed'
}

export function canTransitionTicketStatus(currentStatus, requestedStatus) {
  const current = normalizeTicketStatus(currentStatus)
  const requested = normalizeTicketStatus(requestedStatus)
  if (!current || !requested) return false
  if (current === requested) return true
  return TICKET_STATUS_TRANSITIONS[current]?.has(requested) === true
}

function hasQueueMembership(ticket) {
  return ticket?.is_queue_member === true
}

export function canReadTicket(userOrIdentity, ticket) {
  const identity = asTicketIdentity(userOrIdentity)
  if (!hasTicketReadPermission(identity) || !ticket) return false

  if (identity.role === TICKET_ROLES.SUPERADMIN) return true
  if (identity.role === TICKET_ROLES.REPORTER) {
    // Legacy display-name ownership is intentionally not an authorization source.
    return isTicketReporter(identity, ticket)
  }
  if (identity.role === TICKET_ROLES.ADMIN) {
    return hasQueueMembership(ticket) || isTicketAssignee(identity, ticket)
  }
  return false
}

export function canCommentTicket(userOrIdentity, ticket) {
  const identity = asTicketIdentity(userOrIdentity)
  if (!canReadTicket(identity, ticket) || !isTicketOpenForComment(ticket)) return false
  if (identity.role === TICKET_ROLES.REPORTER) return isTicketReporter(identity, ticket)
  if (identity.role === TICKET_ROLES.SUPERADMIN) return true
  return identity.role === TICKET_ROLES.ADMIN && hasTicketWritePermission(identity)
}

export function canCreateTicket(userOrIdentity) {
  const identity = asTicketIdentity(userOrIdentity)
  if (!hasTicketReadPermission(identity)) return false
  if (identity.role === TICKET_ROLES.REPORTER) return true
  return (
    identity.role === TICKET_ROLES.SUPERADMIN ||
    (identity.role === TICKET_ROLES.ADMIN && hasTicketWritePermission(identity))
  )
}

export function canReadTicketCasp(userOrIdentity, ticket) {
  const identity = asTicketIdentity(userOrIdentity)
  if (!hasTicketReadPermission(identity) || !ticket) return false
  if (identity.role === TICKET_ROLES.SUPERADMIN) return true
  if (identity.role === TICKET_ROLES.REPORTER) return isTicketReporter(identity, ticket)
  return identity.role === TICKET_ROLES.ADMIN && hasQueueMembership(ticket)
}

export function canManageTicket(userOrIdentity, ticket) {
  const identity = asTicketIdentity(userOrIdentity)
  if (!hasTicketWritePermission(identity) || !ticket) return false
  if (identity.role === TICKET_ROLES.SUPERADMIN) return true
  return identity.role === TICKET_ROLES.ADMIN && canReadTicket(identity, ticket)
}

export function canDeleteTicket(userOrIdentity, ticket = {}) {
  const identity = asTicketIdentity(userOrIdentity)
  return (
    identity.valid &&
    identity.role === TICKET_ROLES.SUPERADMIN &&
    hasTicketWritePermission(identity) &&
    Boolean(ticket)
  )
}

export function canRateTicket(userOrIdentity, ticket) {
  const identity = asTicketIdentity(userOrIdentity)
  if (!canReadTicketCasp(identity, ticket)) return false
  if (identity.role !== TICKET_ROLES.REPORTER && identity.role !== TICKET_ROLES.SUPERADMIN) {
    return false
  }
  return isTicketReporter(identity, ticket) && !isTicketAssignee(identity, ticket)
}

export function canClaimTicket(userOrIdentity, ticket) {
  const identity = asTicketIdentity(userOrIdentity)
  if (!hasTicketWritePermission(identity) || !ticket) return false
  if (ticket.assigned_to_user_id != null || !isTicketOpenForComment(ticket)) return false
  if (identity.role === TICKET_ROLES.SUPERADMIN) return true
  return identity.role === TICKET_ROLES.ADMIN && hasQueueMembership(ticket)
}

export function canReassignTicket(userOrIdentity, ticket) {
  const identity = asTicketIdentity(userOrIdentity)
  if (!hasTicketWritePermission(identity) || !ticket || !isTicketOpenForComment(ticket)) {
    return false
  }
  if (identity.role === TICKET_ROLES.SUPERADMIN) return true
  return identity.role === TICKET_ROLES.ADMIN && isTicketAssignee(identity, ticket)
}

export function canReceiveTicketEvent(userOrIdentity, ticket) {
  return canReadTicket(userOrIdentity, ticket)
}

export function canListQueueAdmins(userOrIdentity, queueFacts = {}) {
  const identity = asTicketIdentity(userOrIdentity)
  if (!hasTicketWritePermission(identity)) return false
  if (identity.role === TICKET_ROLES.SUPERADMIN) return true
  return identity.role === TICKET_ROLES.ADMIN && queueFacts.is_queue_member === true
}

export function decideTicketAction(action, userOrIdentity, ticket) {
  switch (action) {
    case TICKET_ACTIONS.CREATE:
      return canCreateTicket(userOrIdentity)
    case TICKET_ACTIONS.READ:
    case TICKET_ACTIONS.EVENT:
      return canReadTicket(userOrIdentity, ticket)
    case TICKET_ACTIONS.READ_CASP:
      return canReadTicketCasp(userOrIdentity, ticket)
    case TICKET_ACTIONS.COMMENT:
      return canCommentTicket(userOrIdentity, ticket)
    case TICKET_ACTIONS.MANAGE:
      return canManageTicket(userOrIdentity, ticket)
    case TICKET_ACTIONS.DELETE:
      return canDeleteTicket(userOrIdentity, ticket)
    case TICKET_ACTIONS.RATE:
      return canRateTicket(userOrIdentity, ticket)
    case TICKET_ACTIONS.CLAIM:
      return canClaimTicket(userOrIdentity, ticket)
    case TICKET_ACTIONS.REASSIGN:
      return canReassignTicket(userOrIdentity, ticket)
    default:
      return false
  }
}

function safeSqlAlias(alias) {
  return typeof alias === 'string' && /^[a-z][a-z0-9_]*$/i.test(alias) ? alias : 't'
}

/**
 * Build a parameterized base scope for ticket list and aggregate queries.
 * Tabs may only narrow the actor's base scope; they never widen it.
 */
export function buildTicketScopeQuery(userOrIdentity, query = {}) {
  const identity = asTicketIdentity(userOrIdentity)
  const alias = safeSqlAlias(query.alias)
  const mode = query.mode === 'aggregate' ? 'aggregate' : 'read'
  const tab = typeof query.tab === 'string' ? query.tab.trim().toLowerCase() : ''
  const params = []
  const conditions = []

  const bind = (value) => {
    params.push(value)
    return `$${params.length}`
  }

  if (!hasTicketReadPermission(identity)) {
    return { scope: 'denied', params, conditions: ['FALSE'] }
  }

  conditions.push(`${alias}.deleted_at IS NULL`)

  if (identity.role === TICKET_ROLES.REPORTER) {
    conditions.push(`${alias}.pelapor_user_id = ${bind(identity.id)}`)
  } else if (identity.role === TICKET_ROLES.ADMIN) {
    const userParam = bind(identity.id)
    const queueCondition =
      `EXISTS (SELECT 1 FROM user_ticket_queues utq ` +
      `WHERE utq.user_id = ${userParam} AND utq.queue_id = ${alias}.queue_id)`

    if (mode === 'aggregate') {
      conditions.push(queueCondition)
    } else {
      conditions.push(`(${alias}.assigned_to_user_id = ${userParam} OR ${queueCondition})`)
    }
  } else if (identity.role !== TICKET_ROLES.SUPERADMIN) {
    return { scope: 'denied', params: [], conditions: ['FALSE'] }
  }

  if (
    identity.role !== TICKET_ROLES.REPORTER &&
    (tab === 'assigned' || tab === 'mine')
  ) {
    conditions.push(`${alias}.assigned_to_user_id = ${bind(identity.id)}`)
  } else if (
    identity.role !== TICKET_ROLES.REPORTER &&
    (tab === 'reported' || tab === 'created')
  ) {
    conditions.push(`${alias}.pelapor_user_id = ${bind(identity.id)}`)
  } else if (tab === 'unassigned') {
    conditions.push(`${alias}.assigned_to_user_id IS NULL`)
  }

  return {
    scope: identity.role,
    params,
    conditions,
  }
}

/**
 * Load only the facts needed by the policy. The correlated membership flag is
 * never treated as a privilege for reporter/unknown roles.
 */
export async function loadTicketAccessContext(
  queryable,
  userOrIdentity,
  ticketId,
  { forUpdate = false } = {},
) {
  const identity = asTicketIdentity(userOrIdentity)
  if (!identity.valid) return null

  const lockClause = forUpdate ? 'FOR UPDATE OF t' : ''
  const result = await queryable.query(
    `SELECT
       t.id,
       t.nomor_tiket,
       t.status_tiket,
       t.queue_id,
       t.pelapor_user_id,
       t.assigned_to_user_id,
       t.pelapor,
       t.assigned_to,
       EXISTS (
         SELECT 1
         FROM user_ticket_queues utq
         WHERE utq.user_id = $2
           AND utq.queue_id = t.queue_id
       ) AS is_queue_member
     FROM tickets t
     WHERE t.id = $1
       AND t.deleted_at IS NULL
     ${lockClause}`,
    [ticketId, identity.id],
  )

  if (result.rowCount === 0) return null
  return {
    ...result.rows[0],
    is_queue_member: result.rows[0].is_queue_member === true,
  }
}

/**
 * Backward-compatible helper for callers/tests that need a single read result.
 */
export async function canAccessTicket(queryable, user, ticketId) {
  const identity = createTicketIdentity(user)
  const ticket = await loadTicketAccessContext(queryable, identity, ticketId)
  return {
    canAccess: canReadTicket(identity, ticket),
    isReporter: isTicketReporter(identity, ticket),
    isAssignee: isTicketAssignee(identity, ticket),
    isQueueAdmin: ticket?.is_queue_member === true && identity.role === TICKET_ROLES.ADMIN,
    isSuperAdmin: identity.role === TICKET_ROLES.SUPERADMIN,
    notFound: ticket === null,
    ticket,
  }
}

export function checkCaspEligibility(user, ticket, existingCasp = null) {
  if (!canRateTicket(user, ticket)) {
    return { eligible: false, reason: 'Hanya pelapor tiket yang berhak memberikan penilaian CASP.' }
  }

  const status =
    typeof ticket?.status_tiket === 'string' ? ticket.status_tiket.trim().toLowerCase() : ''
  if (status !== 'resolved' && status !== 'closed') {
    return { eligible: false, reason: 'CASP hanya dapat diisi setelah tiket diselesaikan.' }
  }
  if (existingCasp) {
    return {
      eligible: false,
      reason: 'Penilaian CASP untuk tiket ini sudah dikirim.',
      rating: existingCasp,
    }
  }
  return { eligible: true, reason: null }
}
