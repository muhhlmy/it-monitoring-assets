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

// GET /api/karyawan/with-assets
// Mengembalikan semua karyawan beserta jumlah aset yang di-assign ke mereka.
// Digunakan untuk tampilan admin "Aset Karyawan".
export async function listEmployeesWithAssets(req, res) {
  const result = await pool.query(
    `SELECT
       k.id_karyawan,
       k.nik,
       k.nama_karyawan,
       k.email_kantor,
       k.departemen,
       k.lokasi_kerja,
       k.status_karyawan,
       k.jabatan,
       COUNT(a.id_aset) AS jumlah_aset
     FROM karyawan AS k
     LEFT JOIN aset_ti AS a ON a.id_karyawan = k.id_karyawan
     GROUP BY k.id_karyawan, k.nik, k.nama_karyawan, k.email_kantor,
              k.departemen, k.lokasi_kerja, k.status_karyawan, k.jabatan
     ORDER BY nama_karyawan`,
  );
  res.json(result.rows);
}

export async function listLocations(req, res) {
  const result = await pool.query(
    `SELECT DISTINCT lokasi_kerja
       FROM karyawan
      WHERE lokasi_kerja IS NOT NULL AND lokasi_kerja <> ''
      ORDER BY lokasi_kerja`,
  );
  res.json(result.rows.map((row) => row.lokasi_kerja));
}
