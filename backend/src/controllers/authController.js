import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import jwt from 'jsonwebtoken';
import {
  DEFAULT_USER_PERMISSIONS,
  SUPERADMIN_PERMISSIONS,
  normalizePermissions,
} from '../services/permissionService.js';
import { verifyPassword } from '../security/passwordService.js';
import { parseRequiredEmail } from '../security/requestValidation.js';

const UNKNOWN_LOGIN_ACTOR = 'Tidak Diketahui'
const MAX_LOGIN_EMAIL_LENGTH = 150
const MAX_LOGIN_PASSWORD_LENGTH = 255

export function normalizeLoginCredentials(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  if (typeof body.email !== 'string' || typeof body.password !== 'string') return null

  let email
  try {
    email = parseRequiredEmail(body.email)
  } catch {
    return null
  }
  if (
    !email ||
    email.length > MAX_LOGIN_EMAIL_LENGTH ||
    body.password.length === 0 ||
    body.password.length > MAX_LOGIN_PASSWORD_LENGTH
  ) {
    return null
  }

  return { email, password: body.password }
}

export async function login(req, res) {
  try {
    const credentials = normalizeLoginCredentials(req.body)
    if (!credentials) {
      return res.status(400).json({ message: 'Format email atau password tidak valid.' })
    }
    const { email, password } = credentials

    // Cari user berdasarkan email beserta NIK & Jabatan dari tabel karyawan (jika terhubung)
    const result = await pool.query(`
      SELECT 
        u.id,
        u.nama,
        u.email,
        u.password,
        u.role,
        u.permissions,
        u.is_active,
        COALESCE(k.nik, '') AS nik,
        COALESCE(k.jabatan, u.role) AS jabatan
      FROM users u
      LEFT JOIN karyawan k ON LOWER(TRIM(u.email)) = LOWER(TRIM(k.email_kantor))
      WHERE u.email = $1
        AND u.deleted_at IS NULL
    `, [email]);
    
    if (result.rowCount === 0) {
      // Catat log gagal
      await pool.query(
        'INSERT INTO log_audit_login (nama_pengguna, email, aktifitas, ip_address, browser) VALUES ($1, $2, $3, $4, $5)',
        [
          UNKNOWN_LOGIN_ACTOR,
          UNKNOWN_LOGIN_ACTOR,
          'GAGAL_LOGIN',
          req.ip,
          req.headers['user-agent']
        ]
      );
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    const user = result.rows[0];

    // Cek apakah akun aktif
    if (!user.is_active) {
      return res.status(403).json({ message: 'Akun Anda telah dinonaktifkan.' });
    }

    const isPasswordValid = await verifyPassword(password, user.password);
    
    if (!isPasswordValid) {
      await pool.query(
        'INSERT INTO log_audit_login (nama_pengguna, email, aktifitas, ip_address, browser) VALUES ($1, $2, $3, $4, $5)',
        [user.nama, user.email, 'GAGAL_LOGIN', req.ip, req.headers['user-agent']]
      );
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    const userRole = (user.role || '').trim().toLowerCase()
    const isSuper = userRole === 'superadmin' || userRole === 'super admin'
    const permissions = isSuper
      ? { ...SUPERADMIN_PERMISSIONS }
      : normalizePermissions(user.permissions, { defaults: DEFAULT_USER_PERMISSIONS })

    // Buat JWT Token dengan NIK & Jabatan
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

    // Catat log sukses
    await pool.query(
      'INSERT INTO log_audit_login (nama_pengguna, email, aktifitas, ip_address, browser) VALUES ($1, $2, $3, $4, $5)',
      [user.nama, user.email, 'LOGIN', req.ip, req.headers['user-agent']]
    );

    res.json({
      message: 'Login berhasil.',
      token,
      user: payload
    });
  } catch (error) {
    console.error('Error saat login:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
}

export async function getMe(req, res) {
  try {
    // req.user disisipkan oleh middleware authenticateToken
    const result = await pool.query(`
      SELECT 
        u.id, u.nama, u.email, u.role, u.permissions, u.is_active, u.dibuat_pada,
        COALESCE(k.nik, '') AS nik,
        COALESCE(k.jabatan, u.role) AS jabatan
      FROM users u
      LEFT JOIN karyawan k ON LOWER(TRIM(u.email)) = LOWER(TRIM(k.email_kantor))
      WHERE u.id = $1
        AND u.deleted_at IS NULL
    `, [req.user.id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }

    const user = result.rows[0];
    const userRole = (user.role || '').trim().toLowerCase()
    const isSuper = userRole === 'superadmin' || userRole === 'super admin'
    user.permissions = isSuper
      ? { ...SUPERADMIN_PERMISSIONS }
      : normalizePermissions(user.permissions, { defaults: DEFAULT_USER_PERMISSIONS })

    res.json(user);
  } catch (error) {
    console.error('Error getMe:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
}
