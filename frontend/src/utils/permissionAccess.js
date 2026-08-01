export const TICKET_ROLES = Object.freeze({
  REPORTER: 'reporter',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
  UNKNOWN: 'unknown',
})

export function normalizeTicketRole(value) {
  if (typeof value !== 'string') return TICKET_ROLES.UNKNOWN

  const role = value.trim().toLowerCase()
  if (role === 'user' || role === 'reporter') return TICKET_ROLES.REPORTER
  if (role === 'admin') return TICKET_ROLES.ADMIN
  if (role === 'superadmin' || role === 'super admin') {
    return TICKET_ROLES.SUPERADMIN
  }
  return TICKET_ROLES.UNKNOWN
}

export function isSuperAdminRole(value) {
  return normalizeTicketRole(value) === TICKET_ROLES.SUPERADMIN
}

export function canReadPermission(value) {
  if (value === true) return true
  if (typeof value !== 'string') return false
  const level = value.trim().toLowerCase()
  return level === 'read_only' || level === 'full'
}

export function canWritePermission(value) {
  if (value === true) return true
  return typeof value === 'string' && value.trim().toLowerCase() === 'full'
}

export function getTicketEligibility(user) {
  const role = normalizeTicketRole(user?.role)
  if (role === TICKET_ROLES.UNKNOWN) {
    return { role, canRead: false, canWrite: false }
  }

  if (role === TICKET_ROLES.SUPERADMIN) {
    return { role, canRead: true, canWrite: true }
  }

  const permissions =
    user?.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
      ? user.permissions
      : {}
  const ticketPermission = permissions.tickets

  return {
    role,
    canRead: canReadPermission(ticketPermission),
    canWrite: canWritePermission(ticketPermission),
  }
}

export function canAccessFrontendFeature(user, featureKey) {
  if (!featureKey) return true

  const ticketEligibility = getTicketEligibility(user)
  if (featureKey === 'export') {
    return ticketEligibility.role === TICKET_ROLES.SUPERADMIN
  }
  if (featureKey === 'tickets') return ticketEligibility.canRead
  if (ticketEligibility.role === TICKET_ROLES.SUPERADMIN) return true

  const permissions =
    user?.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
      ? user.permissions
      : {}
  return canReadPermission(permissions[featureKey])
}

export function findFirstAllowedRoute(user, routeMap) {
  if (!Array.isArray(routeMap)) return null
  return routeMap.find((route) => route?.name && canAccessFrontendFeature(user, route.key)) || null
}
