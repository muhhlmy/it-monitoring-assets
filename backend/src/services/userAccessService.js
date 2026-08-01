import {
  hasReadPermissionLevel,
  isValidPermissionPayload,
} from './permissionService.js'

export const USER_MANAGEMENT_ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
  UNKNOWN: 'unknown'
})

const SENSITIVE_PERMISSION_KEYS = ['users', 'export']

export function normalizeUserManagementRole(value) {
  if (typeof value !== 'string') return USER_MANAGEMENT_ROLES.UNKNOWN

  const role = value.trim().toLowerCase()
  if (role === 'user') return USER_MANAGEMENT_ROLES.USER
  if (role === 'admin') return USER_MANAGEMENT_ROLES.ADMIN
  if (role === 'superadmin' || role === 'super admin') {
    return USER_MANAGEMENT_ROLES.SUPERADMIN
  }

  return USER_MANAGEMENT_ROLES.UNKNOWN
}

export function isSuperAdminRole(value) {
  return normalizeUserManagementRole(value) === USER_MANAGEMENT_ROLES.SUPERADMIN
}

export function isValidUserPermissionPayload(value) {
  return isValidPermissionPayload(value)
}

export function hasSensitiveUserPermission(permissions) {
  if (!permissions || typeof permissions !== 'object') return false

  return SENSITIVE_PERMISSION_KEYS.some((key) => {
    return hasReadPermissionLevel(permissions[key])
  })
}

export function canCreateManagedUser(actorRole, requestedRole, permissions) {
  const actor = normalizeUserManagementRole(actorRole)
  const target = normalizeUserManagementRole(requestedRole)

  if (actor === USER_MANAGEMENT_ROLES.SUPERADMIN) {
    return target !== USER_MANAGEMENT_ROLES.UNKNOWN
  }

  return (
    actor === USER_MANAGEMENT_ROLES.ADMIN &&
    target === USER_MANAGEMENT_ROLES.USER &&
    !hasSensitiveUserPermission(permissions)
  )
}

export function canUpdateManagedUser(
  actorRole,
  currentTargetRole,
  requestedRole,
  permissions
) {
  const actor = normalizeUserManagementRole(actorRole)
  const currentTarget = normalizeUserManagementRole(currentTargetRole)
  const requested = normalizeUserManagementRole(requestedRole)

  if (actor === USER_MANAGEMENT_ROLES.SUPERADMIN) {
    return requested !== USER_MANAGEMENT_ROLES.UNKNOWN
  }

  return (
    actor === USER_MANAGEMENT_ROLES.ADMIN &&
    currentTarget === USER_MANAGEMENT_ROLES.USER &&
    requested === USER_MANAGEMENT_ROLES.USER &&
    !hasSensitiveUserPermission(permissions)
  )
}

export function canDeleteManagedUser(actorRole, currentTargetRole) {
  return (
    normalizeUserManagementRole(actorRole) ===
      USER_MANAGEMENT_ROLES.SUPERADMIN &&
    normalizeUserManagementRole(currentTargetRole) !==
      USER_MANAGEMENT_ROLES.SUPERADMIN
  )
}
