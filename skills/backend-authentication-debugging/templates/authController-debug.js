import { pool } from '../config/database.js';
import bcrypt from 'bcryptjs'
import { env } from '../config/env.js';
import jwt from 'jsonwebtoken';
import {
  DEFAULT_USER_PERMISSIONS,
  SUPERADMIN_PERMISSIONS,
  normalizePermissions,
} from '../services/permissionService.js';
import { verifyPassword, hashPassword } from '../security/passwordService.js';
import { parseRequiredEmail } from '../security/requestValidation.js';
import fs from 'fs';

// Force flush stdout on every log
function log(msg) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] LOGIN: ${msg}`);
  process.stdout.flush();
  
  // Write to local log file using relative path (Windows compatible)
  try {
    fs.appendFileSync('./login_debug.log', `[${timestamp}] LOGIN: ${msg}\n`);
  } catch (e) {
    // Ignore file write errors
  }
}

export async function login(req, res) {
  log('=== LOGIN REQUEST STARTED ===');
  
  try {
    log('Step 1: Checking credentials...');
    
    const credentials = normalizeLoginCredentials(req.body);
    log('Step 2: Credentials normalized:', credentials ? 'OK' : 'NULL');
    
    if (!credentials) {
      log('FAILED - Invalid credentials');
      return res.status(400).json({ message: 'Format email atau password tidak valid.' });
    }
    
    const { email, password } = credentials;
    log(`Email=${email}, Password length=${password?.length || 0}`);

    log('Running database query...');

    const result = await pool.query(`
      SELECT 
        u.id, u.nama, u.email, u.password_hash, u.role,
        u.permissions, u.is_active,
        COALESCE(k.nik, '') AS nik,
        COALESCE(k.title, u.role) AS jabatan
      FROM users u
      LEFT JOIN karyawan k ON LOWER(TRIM(u.email)) = LOWER(TRIM(k.email_kantor))
      WHERE u.email = $1 AND u.deleted_at IS NULL
    `, [email]);
    
    log('Query returned ' + result.rowCount + ' rows');
    
    if (result.rowCount === 0) {
      log('FAILED - User not found');
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    const user = result.rows[0];
    log('User found: id=' + user.id + ', role=' + user.role + ', is_active=' + user.is_active);
    
    if (!user.is_active) {
      log('FAILED - Account inactive');
      return res.status(403).json({ message: 'Akun Anda telah dinonaktifkan.' });
    }

    log('Verifying password...');
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    log('verifyPassword result: ' + isPasswordValid);
    
    if (!isPasswordValid) {
      log('FAILED - Password invalid');
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    log('SUCCESS! Creating JWT token...');
    
    const userRole = (user.role || '').trim().toLowerCase();
    const isSuper = userRole === 'superadmin' || userRole === 'super admin';
    const permissions = isSuper
      ? { ...SUPERADMIN_PERMISSIONS }
      : normalizePermissions(user.permissions, { defaults: DEFAULT_USER_PERMISSIONS });

    const payload = {
      id: user.id,
      nama: user.nama,
      email: user.email,
      role: user.role,
      nik: user.nik || '',
      jabatan: user.jabatan || user.role,
      permissions
    };

    const token = jwt.sign(payload, env.jwt.secret, { expiresIn: '12h' });

    res.json({ message: 'Login berhasil.', token, user: payload });
    
  } catch (error) {
    log('FATAL ERROR: ' + error.message);
    log(error.stack);
    res.status(500).json({ 
      message: 'Terjadi kesalahan pada server.',
      error: error.message
    });
  }
}

export async function getMe(req, res) {
  try {
    const result = await pool.query(`
      SELECT u.id, u.nama, u.email, u.role, u.permissions, u.is_active, u.created_at,
        COALESCE(k.nik, '') AS nik, COALESCE(k.jabatan, u.role) AS jabatan
      FROM users u
      LEFT JOIN karyawan k ON LOWER(TRIM(u.email)) = LOWER(TRIM(k.email_kantor))
      WHERE u.id = $1 AND u.deleted_at IS NULL
    `, [req.user.id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }

    const user = result.rows[0];
    const userRole = (user.role || '').trim().toLowerCase();
    const isSuper = userRole === 'superadmin' || userRole === 'super admin';
    user.permissions = isSuper
      ? { ...SUPERADMIN_PERMISSIONS }
      : normalizePermissions(user.permissions, { defaults: DEFAULT_USER_PERMISSIONS });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
}

export async function changePassword(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Pengguna tidak terotentikasi.' });
    }

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({ message: 'Password saat ini wajib diisi.' });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ message: 'Password baru minimal harus 8 karakter.' });
    }

    const userResult = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId],
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
    }

    const user = userResult.rows[0];
    const isValid = await verifyPassword(currentPassword, user.password_hash);

    if (!isValid) {
      return res.status(400).json({ message: 'Password saat ini salah.' });
    }

    const newHashedPassword = await hashPassword(newPassword);
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHashedPassword, userId],
    );

    res.json({ message: 'Password berhasil diperbarui.' });
  } catch (error) {
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
}

export function normalizeLoginCredentials(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (typeof body.email !== 'string' || typeof body.password !== 'string') return null;
  
  const MAX_EMAIL = 150, MAX_PASS = 255;
  let email;
  try {
    email = parseRequiredEmail(body.email);
  } catch { return null; }
  
  if (!email || email.length > MAX_EMAIL || !body.password || body.password.length > MAX_PASS) {
    return null;
  }
  
  return { email, password: body.password };
}
