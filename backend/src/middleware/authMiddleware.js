import { env } from '../config/env.js';
import jwt from 'jsonwebtoken';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Token berbentuk: "Bearer <token>"
  let token = authHeader && authHeader.split(' ')[1];

  // Fallback: baca token dari query param.
  // Diperlukan untuk SSE/EventSource yang tidak bisa mengirim custom header
  // (lihat frontend/src/composables/useTicketEvents.js -> ?token=...).
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Akses ditolak. Token tidak ditemukan.' });
  }

  jwt.verify(token, env.jwt.secret, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token tidak valid atau sudah kedaluwarsa.' });
    }
    req.user = user; // Menyimpan data user (id, nama, email, role) ke request
    next();
  });
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

export function authorizePermission(featureKey) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Akses ditolak.' });
    }

    const userRole = (req.user.role || '').trim().toLowerCase();
    if (userRole === 'super admin' || userRole === 'superadmin') {
      return next();
    }

    const perms = req.user.permissions;
    if (perms && typeof perms === 'object') {
      const level = perms[featureKey];
      // Support new string levels ('full', 'read_only') AND legacy boolean
      if (level === 'full' || level === 'read_only' || level === true) {
        return next();
      }
    }

    return res.status(403).json({ message: `Anda tidak memiliki hak akses ke fitur '${featureKey}'.` });
  };
}
