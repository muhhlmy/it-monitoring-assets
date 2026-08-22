import {
  hasReadPermissionLevel,
  hasWritePermissionLevel,
} from '../services/permissionService.js'

/**
 * Resource-level authorization policy module.
 * Provides canonical, deny-by-default resource access policies for IT Assets, GA Assets, and OPS Assets.
 */

export function isSuperadmin(user) {
  if (!user || typeof user !== 'object') return false
  const role = String(user.role || '').trim().toLowerCase()
  return role === 'superadmin' || role === 'super admin'
}

export function isAdmin(user) {
  if (!user || typeof user !== 'object') return false
  const role = String(user.role || '').trim().toLowerCase()
  return isSuperadmin(user) || role === 'admin'
}

/**
 * Checks if the user is authorized to READ a specific IT Asset.
 * - Superadmin & Admins with 'assets' read_only/full permission: Authorized.
 * - Regular Users: Authorized ONLY IF asset.nik_pemegang_asset matches user's NIK or email/nama.
 */
export function canReadITAsset(user, asset) {
  if (!user || !asset) return false
  if (isSuperadmin(user)) return true

  if (isAdmin(user)) {
    const perm = user.permissions?.assets
    if (hasReadPermissionLevel(perm)) return true
  }

  // Regular user (or user checking asset assignment): check resource ownership/holder
  const userNik = (user.nik || user.employee?.nik || '').trim().toLowerCase()
  const assetNik = (asset.nik_pemegang_asset || '').trim().toLowerCase()
  if (userNik && assetNik && userNik === assetNik) return true

  const userNama = (user.nama || '').trim().toLowerCase()
  const assetNama = (asset.nama_karyawan_pemegang_asset || '').trim().toLowerCase()
  if (userNama && assetNama && userNama === assetNama) return true

  const userEmail = (user.email || '').trim().toLowerCase()
  if (userEmail && assetNama && userEmail === assetNama) return true

  return false
}

/**
 * Checks if the user is authorized to WRITE (Create, Update, Delete) an IT Asset.
 * - Restricted to Superadmin & Admins with 'assets' full permission.
 * - Regular users CANNOT mutate IT Assets.
 */
export function canWriteITAsset(user, _asset) {
  if (!user) return false
  if (isSuperadmin(user)) return true

  if (isAdmin(user)) {
    return hasWritePermissionLevel(user.permissions?.assets)
  }

  return false
}

/**
 * Checks if the user is authorized to READ a General Affairs (GA) Asset.
 */
export function canReadGAAsset(user, _gaAsset) {
  if (!user) return false
  if (isSuperadmin(user)) return true
  const perm = user.permissions?.assets_ga || user.permissions?.assets
  return hasReadPermissionLevel(perm)
}

/**
 * Checks if the user is authorized to WRITE a General Affairs (GA) Asset.
 */
export function canWriteGAAsset(user, _gaAsset) {
  if (!user) return false
  if (isSuperadmin(user)) return true
  const perm = user.permissions?.assets_ga || user.permissions?.assets
  return hasWritePermissionLevel(perm)
}

/**
 * Checks if the user is authorized to READ an Operational (OPS) Asset.
 */
export function canReadOPSAsset(user, _opsAsset) {
  if (!user) return false
  if (isSuperadmin(user)) return true
  const perm = user.permissions?.assets_ops || user.permissions?.assets
  return hasReadPermissionLevel(perm)
}

/**
 * Checks if the user is authorized to WRITE an Operational (OPS) Asset.
 */
export function canWriteOPSAsset(user, _opsAsset) {
  if (!user) return false
  if (isSuperadmin(user)) return true
  const perm = user.permissions?.assets_ops || user.permissions?.assets
  return hasWritePermissionLevel(perm)
}
