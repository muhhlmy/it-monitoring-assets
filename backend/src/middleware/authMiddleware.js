import { env } from '../config/env.js';
import { pool } from '../config/database.js';
import jwt from 'jsonwebtoken';
import {
  DEFAULT_USER_PERMISSIONS,
  SUPERADMIN_PERMISSIONS,
  hasReadPermissionLevel,
  hasWritePermissionLevel,
  normalizePermissions,
} from '../services/permissionService.js';

const BEARER_TOKEN_PATTERN =
  /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
const MAX_BEARER_TOKEN_LENGTH = 4096;

function rejectAuthentication(res) {
  return res.status(401).json({
    message: 'Sesi tidak valid atau sudah berakhir. Silakan login kembali.',
  });
}

function readBearerToken(req) {
  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string') return null;

  const match = BEARER_TOKEN_PATTERN.exec(authorization);
  if (!match || match[1].length > MAX_BEARER_TOKEN_LENGTH) return null;
  return match[1];
}

function normalizeAuthenticatedRole(value) {
  if (typeof value !== 'string') return null;
  const role = value.trim().toLowerCase();
  if (role === 'user' || role === 'admin') return role;
  if (role === 'superadmin' || role === 'super admin') return 'superadmin';
  return null;
}

export async function authenticateToken(req, res, next) {
  const token = readBearerToken(req);
  if (!token) return rejectAuthentication(res);

  let claims;
  try {
    claims = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] });
  } catch {
    return rejectAuthentication(res);
  }

  const userId = Number(claims?.id);
  if (
    !claims ||
    typeof claims !== 'object' ||
    !Number.isSafeInteger(userId) ||
    userId <= 0 ||
    !Number.isFinite(claims.exp)
  ) {
    return rejectAuthentication(res);
  }

  try {
    const result = await pool.query(
      `/* canonical-auth-user */
       SELECT
         u.id,
         u.nama,
         u.email,
         u.role,
         u.permissions,
         u.is_active,
         COALESCE(k.nik, '') AS nik,
         COALESCE(k.title, u.role) AS jabatan
       FROM users u
       LEFT JOIN karyawan k
         ON LOWER(TRIM(u.email)) = LOWER(TRIM(k.email_kantor))
       WHERE u.id = $1
         AND u.deleted_at IS NULL
         AND u.is_active = true`,
      [userId],
    );

    if (result.rowCount !== 1) return rejectAuthentication(res);

    const user = result.rows[0];
    const role = normalizeAuthenticatedRole(user.role);
    if (!role) return rejectAuthentication(res);
    const permissions =
      role === 'superadmin'
        ? { ...SUPERADMIN_PERMISSIONS }
        : normalizePermissions(user.permissions, { defaults: DEFAULT_USER_PERMISSIONS });

    req.user = {
      id: userId,
      nama: typeof user.nama === 'string' ? user.nama : '',
      email: typeof user.email === 'string' ? user.email : '',
      role,
      permissions,
      nik: typeof user.nik === 'string' ? user.nik : '',
      jabatan: typeof user.jabatan === 'string' ? user.jabatan : '',
      iat: claims.iat,
      exp: claims.exp,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function authorizeRoles(...allowedRoles) {
  const normalizedAllowed = allowedRoles.map(r => r.trim().toLowerCase());
  
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: 'Akses ditolak.' });
    }

    const userRole = req.user.role.trim().toLowerCase();

    // super admin boleh mengakses semuanya
    if (userRole === 'super admin' || userRole === 'superadmin' || normalizedAllowed.includes(userRole)) {
      next();
    } else {
      return res.status(403).json({ message: 'Anda tidak memiliki hak akses untuk endpoint ini.' });
    }
  };
}

export function hasReadFeaturePermission(value) {
  return hasReadPermissionLevel(value);
}

export function hasWriteFeaturePermission(value) {
  return hasWritePermissionLevel(value);
}

export function authorizeAnyPermission(featureKeys, access = 'read') {
  const keys = Array.isArray(featureKeys) ? featureKeys : [];
  const hasValidKeys =
    keys.length > 0 &&
    keys.every((key) => typeof key === 'string' && key.trim().length > 0);
  const permissionCheck =
    access === 'read'
      ? hasReadFeaturePermission
      : access === 'write'
        ? hasWriteFeaturePermission
        : null;

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Akses ditolak.' });
    }

    if (!hasValidKeys || !permissionCheck) {
      return res.status(403).json({ message: 'Konfigurasi permission tidak valid.' });
    }

    const userRole = normalizeAuthenticatedRole(req.user.role);
    if (userRole === 'superadmin') {
      return next();
    }

    if (userRole !== 'admin' && userRole !== 'user') {
      return res.status(403).json({ message: 'Akses ditolak.' });
    }

    const perms = req.user.permissions;
    if (
      perms &&
      typeof perms === 'object' &&
      !Array.isArray(perms) &&
      keys.some((key) => permissionCheck(perms[key]))
    ) {
      return next();
    }

    return res.status(403).json({
      message: `Anda tidak memiliki permission ${access} yang diperlukan.`,
    });
  };
}

export function authorizePermission(featureKey, access = 'read') {
  return authorizeAnyPermission([featureKey], access);
}
