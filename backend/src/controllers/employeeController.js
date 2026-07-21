import { pool } from "../config/database.js";

export async function listEmployees(req, res) {
  const result = await pool.query(
    `SELECT id_karyawan, nik, nama_karyawan, email_kantor, departemen,
            lokasi_kerja, status_karyawan, jabatan
       FROM karyawan
      ORDER BY nama_karyawan`,
  );
  res.json(result.rows);
}
