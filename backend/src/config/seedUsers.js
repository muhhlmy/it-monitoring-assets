import { pool } from './database.js';
import bcrypt from 'bcryptjs';

async function seedUsers() {
  try {
    const adminPassword = await bcrypt.hash('admin123', 10);
    const userPassword = await bcrypt.hash('user123', 10);

    const users = [
      {
        nama: 'Super Admin',
        email: 'admin@esb.co.id',
        password: adminPassword,
        role: 'super admin',
      },
      {
        nama: 'Budi (Karyawan)',
        email: 'budi@esb.co.id',
        password: userPassword,
        role: 'user',
      },
    ];

    for (const user of users) {
      await pool.query(
        `INSERT INTO users (nama, email, password, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [user.nama, user.email, user.password, user.role]
      );
    }

    console.log(
      'User seed berhasil. Admin (admin@esb.co.id / admin123) dan User (budi@esb.co.id / user123) telah dibuat.'
    );
  } catch (error) {
    console.error('Gagal seed user:', error);
  } finally {
    pool.end();
  }
}

seedUsers();
