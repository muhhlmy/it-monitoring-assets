import { pool } from '../config/database.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_super_aman_esb_it';

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email dan password wajib diisi.' });
    }

    // Cari user berdasarkan email
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rowCount === 0) {
      // Catat log gagal
      await pool.query(
        'INSERT INTO log_audit_login (nama_pengguna, email, aktifitas, ip_address, browser) VALUES ($1, $2, $3, $4, $5)',
        ['Tidak Diketahui', email, 'GAGAL_LOGIN', req.ip, req.headers['user-agent']]
      );
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    const user = result.rows[0];

    // Cek apakah akun aktif
    if (!user.is_active) {
      return res.status(403).json({ message: 'Akun Anda telah dinonaktifkan.' });
    }

    // Verifikasi password (sementara menggunakan plain text sesuai permintaan)
    const isPasswordValid = (password === user.password);
    
    if (!isPasswordValid) {
      await pool.query(
        'INSERT INTO log_audit_login (nama_pengguna, email, aktifitas, ip_address, browser) VALUES ($1, $2, $3, $4, $5)',
        [user.nama, email, 'GAGAL_LOGIN', req.ip, req.headers['user-agent']]
      );
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    // Buat JWT Token
    const payload = {
      id: user.id,
      nama: user.nama,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

    // Catat log sukses
    await pool.query(
      'INSERT INTO log_audit_login (nama_pengguna, email, aktifitas, ip_address, browser) VALUES ($1, $2, $3, $4, $5)',
      [user.nama, email, 'LOGIN', req.ip, req.headers['user-agent']]
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
    const result = await pool.query('SELECT id, nama, email, role, is_active, dibuat_pada FROM users WHERE id = $1', [req.user.id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getMe:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
}
