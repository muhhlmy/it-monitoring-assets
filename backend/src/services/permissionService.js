export const FEATURE_PERMISSION_KEYS = Object.freeze([
  'dashboard',
  'assets',
  'my_assets',
  'tickets',
  'submissions',
  'users',
  'logs',
  'karyawan',
  'export',
])

export const DEFAULT_USER_PERMISSIONS = Object.freeze({
  dashboard: 'none',
  assets: 'none',
  my_assets: 'read_only',
  tickets: 'read_only',
  submissions: 'none',
  users: 'none',
  logs: 'none',
  karyawan: 'none',
  export: 'none',
})

export const SUPERADMIN_PERMISSIONS = Object.freeze(
  Object.fromEntries(FEATURE_PERMISSION_KEYS.map((key) => [key, 'full'])),
)

const PERMISSION_LEVELS = new Set(['none', 'read_only', 'full'])
const PERMISSION_KEYS = new Set(FEATURE_PERMISSION_KEYS)

export function normalizePermissionLevel(value) {
  if (value === true) return 'full'
  if (value === false) return 'none'
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  return PERMISSION_LEVELS.has(normalized) ? normalized : null
}

export function hasReadPermissionLevel(value) {
  const level = normalizePermissionLevel(value)
  return level === 'read_only' || level === 'full'
}

export function hasWritePermissionLevel(value) {
  return normalizePermissionLevel(value) === 'full'
}

export function isValidPermissionPayload(value, { allowUndefined = true } = {}) {
  if (value === undefined) return allowUndefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  return Object.entries(value).every(
    ([key, level]) => PERMISSION_KEYS.has(key) && normalizePermissionLevel(level) !== null,
  )
}

export function normalizePermissions(value, { defaults = DEFAULT_USER_PERMISSIONS } = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const normalized = {}

  for (const key of FEATURE_PERMISSION_KEYS) {
    normalized[key] = Object.prototype.hasOwnProperty.call(source, key)
      ? normalizePermissionLevel(source[key]) ?? 'none'
      : normalizePermissionLevel(defaults?.[key]) ?? 'none'
  }

  return normalized
}
