import { pool, withTransaction } from "../config/database.js";
import { hashPassword } from "../security/passwordService.js";

export async function listEmployees(req, res) {
  const result = await pool.query(
    `SELECT id_karyawan, nik, nama_karyawan, email_kantor, departemen,
            lokasi_kerja, status_karyawan, jabatan, tingkat_jabatan, direktorat,
            tanggal_mulai_bekerja, status_kepegawaian, jenis_perjanjian_kerja, id_atasan_langsung
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
       k.tingkat_jabatan,
       k.direktorat,
       k.tanggal_mulai_bekerja,
       k.status_kepegawaian,
       k.jenis_perjanjian_kerja,
       k.id_atasan_langsung,
       COUNT(a.id_aset) AS jumlah_aset
     FROM karyawan AS k
     LEFT JOIN aset_ti AS a ON a.id_karyawan = k.id_karyawan
     GROUP BY k.id_karyawan, k.nik, k.nama_karyawan, k.email_kantor,
              k.departemen, k.lokasi_kerja, k.status_karyawan, k.jabatan,
              k.tingkat_jabatan, k.direktorat, k.tanggal_mulai_bekerja,
              k.status_kepegawaian, k.jenis_perjanjian_kerja, k.id_atasan_langsung
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

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export async function storeEmployee(req, res) {
  const nik = cleanText(req.body.nik);
  const nama_karyawan = cleanText(req.body.nama_karyawan);
  const email_kantor = cleanText(req.body.email_kantor) || `${nik.toLowerCase()}@esb.co.id`;
  const lokasi_kerja = cleanText(req.body.lokasi_kerja);
  const status_karyawan = cleanText(req.body.status_karyawan) || "Active";
  const jabatan = cleanText(req.body.jabatan);
  const tingkat_jabatan = cleanText(req.body.tingkat_jabatan);
  const departemen = cleanText(req.body.departemen);
  const direktorat = cleanText(req.body.direktorat);
  const tanggal_mulai_bekerja = cleanText(req.body.tanggal_mulai_bekerja);
  const status_kepegawaian = cleanText(req.body.status_kepegawaian) || "Permanent";
  const jenis_perjanjian_kerja = status_kepegawaian;
  const id_atasan_langsung = req.body.id_atasan_langsung ? Number(req.body.id_atasan_langsung) : null;

  if (!nik) {
    throw createHttpError(400, "NIK wajib diisi.");
  }
  if (!nama_karyawan) {
    throw createHttpError(400, "Nama karyawan wajib diisi.");
  }

  const createdEmployee = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO karyawan (
         nik, nama_karyawan, email_kantor, lokasi_kerja, status_karyawan,
         jabatan, tingkat_jabatan, departemen, direktorat, tanggal_mulai_bekerja,
         status_kepegawaian, jenis_perjanjian_kerja, id_atasan_langsung
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id_karyawan, nik, nama_karyawan, email_kantor, departemen, lokasi_kerja, status_karyawan, jabatan`,
      [
        nik,
        nama_karyawan,
        email_kantor,
        lokasi_kerja,
        status_karyawan,
        jabatan,
        tingkat_jabatan,
        departemen,
        direktorat,
        tanggal_mulai_bekerja,
        status_kepegawaian,
        jenis_perjanjian_kerja,
        id_atasan_langsung,
      ],
    );

    // Otomatis buatkan akun default User jika email belum ada di tabel users
    const existingUser = await client.query(
      `SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND deleted_at IS NULL`,
      [email_kantor],
    );

    if (existingUser.rowCount === 0) {
      const defaultPasswordHash = await hashPassword("Password123!");
      const defaultPermissions = JSON.stringify({
        dashboard: "none",
        assets: "none",
        my_assets: "read_only",
        tickets: "read_only",
        submissions: "none",
        users: "none",
        logs: "none",
        karyawan: "none",
      });

      await client.query(
        `INSERT INTO users (nama, email, password, role, permissions, is_active)
         VALUES ($1, $2, $3, 'user', $4::jsonb, true)`,
        [nama_karyawan, email_kantor, defaultPasswordHash, defaultPermissions],
      );
    }

    return result.rows[0];
  });

  res.status(201).json(createdEmployee);
}

export async function updateEmployee(req, res) {
  const id_karyawan = Number(req.params.id);
  if (!Number.isSafeInteger(id_karyawan) || id_karyawan <= 0) {
    throw createHttpError(400, "ID karyawan tidak valid.");
  }

  const nik = cleanText(req.body.nik);
  const nama_karyawan = cleanText(req.body.nama_karyawan);
  const email_kantor = cleanText(req.body.email_kantor);
  const lokasi_kerja = cleanText(req.body.lokasi_kerja);
  const status_karyawan = cleanText(req.body.status_karyawan);
  const jabatan = cleanText(req.body.jabatan);
  const tingkat_jabatan = cleanText(req.body.tingkat_jabatan);
  const departemen = cleanText(req.body.departemen);
  const direktorat = cleanText(req.body.direktorat);
  const tanggal_mulai_bekerja = cleanText(req.body.tanggal_mulai_bekerja);
  const status_kepegawaian = cleanText(req.body.status_kepegawaian);
  const jenis_perjanjian_kerja = status_kepegawaian;
  const id_atasan_langsung = req.body.id_atasan_langsung ? Number(req.body.id_atasan_langsung) : null;

  if (!nik) {
    throw createHttpError(400, "NIK wajib diisi.");
  }
  if (!nama_karyawan) {
    throw createHttpError(400, "Nama karyawan wajib diisi.");
  }

  const result = await pool.query(
    `UPDATE karyawan
        SET nik = $1,
            nama_karyawan = $2,
            email_kantor = $3,
            lokasi_kerja = $4,
            status_karyawan = $5,
            jabatan = $6,
            tingkat_jabatan = $7,
            departemen = $8,
            direktorat = $9,
            tanggal_mulai_bekerja = $10,
            status_kepegawaian = $11,
            jenis_perjanjian_kerja = $12,
            id_atasan_langsung = $13,
            diperbarui_pada = CURRENT_TIMESTAMP
      WHERE id_karyawan = $14
  RETURNING id_karyawan, nik, nama_karyawan, email_kantor, departemen, lokasi_kerja, status_karyawan, jabatan`,
    [
      nik,
      nama_karyawan,
      email_kantor,
      lokasi_kerja,
      status_karyawan,
      jabatan,
      tingkat_jabatan,
      departemen,
      direktorat,
      tanggal_mulai_bekerja,
      status_kepegawaian,
      jenis_perjanjian_kerja,
      id_atasan_langsung,
      id_karyawan,
    ],
  );

  if (result.rowCount === 0) {
    throw createHttpError(404, "Karyawan tidak ditemukan.");
  }

  res.json(result.rows[0]);
}

export async function deleteEmployee(req, res) {
  const id_karyawan = Number(req.params.id);
  if (!Number.isSafeInteger(id_karyawan) || id_karyawan <= 0) {
    throw createHttpError(400, "ID karyawan tidak valid.");
  }

  const result = await pool.query("DELETE FROM karyawan WHERE id_karyawan = $1", [id_karyawan]);
  if (result.rowCount === 0) {
    throw createHttpError(404, "Karyawan tidak ditemukan.");
  }

  res.json({ message: "Data karyawan berhasil dihapus." });
}
