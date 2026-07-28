import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_super_aman_esb_it';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Token berbentuk: "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Akses ditolak. Token tidak ditemukan.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
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

    if (req.user.permissions && req.user.permissions[featureKey] === true) {
      return next();
    }

    return res.status(403).json({ message: `Anda tidak memiliki hak akses ke fitur '${featureKey}'.` });
  };
}
