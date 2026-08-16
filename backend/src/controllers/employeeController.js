import { pool, withTransaction } from "../config/database.js";
import { hashPassword } from "../security/passwordService.js";

// Validasi ENUM status karyawan & Job Level sesuai spesifikasi
const VALID_KARYAWAN_STATUSES = ["Active", "Outsource", "Resigned"];
const VALID_EMPLOYEEMENT_STATUSES = ["Permanent", "Contract"];
const VALID_JOB_LEVELS = [
  "C-Level", "L1", "L1a", "L2", "L2b", "L3", "L3b",
  "L4", "L4c", "L5", "L6", "LS1", "LS2", "LS3"
];

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

export async function listEmployees(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, id AS id_karyawan, nik, nama_karyawan, status, status AS status_karyawan,
              title, title AS jabatan, job_level, job_level AS tingkat_jabatan, departemen,
              directorate, directorate AS direktorat, tanggal_mulai_bekerja, employeement_status,
              employeement_status AS status_kepegawaian, nik_atasan_langsung, email_kantor, lokasi_kerja
       FROM karyawan
       ORDER BY nama_karyawan`,
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error listing employees:", error);
    res.status(500).json({ error: "Failed to list employees" });
  }
}

// GET /api/karyawan/with-assets
export async function listEmployeesWithAssets(req, res) {
  try {
    const result = await pool.query(
      `SELECT
         k.id,
         k.id AS id_karyawan,
         k.nik,
         k.nama_karyawan,
         k.email_kantor,
         k.departemen,
         k.lokasi_kerja,
         k.status,
         k.status AS status_karyawan,
         k.title,
         k.title AS jabatan,
         k.job_level,
         k.job_level AS tingkat_jabatan,
         k.directorate,
         k.directorate AS direktorat,
         k.tanggal_mulai_bekerja,
         k.employeement_status,
         k.employeement_status AS status_kepegawaian,
         k.nik_atasan_langsung,
         COUNT(a.id) AS jumlah_aset
       FROM karyawan AS k
       LEFT JOIN aset_ti AS a ON a.nik_pemegang_asset = k.nik AND a.deleted_at IS NULL
       GROUP BY k.id, k.nik, k.nama_karyawan, k.email_kantor, k.departemen,
                k.lokasi_kerja, k.status, k.title, k.job_level, k.directorate,
                k.tanggal_mulai_bekerja, k.employeement_status, k.nik_atasan_langsung
       ORDER BY nama_karyawan`,
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error listing employees with assets:", error);
    res.status(500).json({ error: "Failed to list employees with assets" });
  }
}

export async function listLocations(req, res) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT lokasi_kerja
       FROM karyawan
       WHERE lokasi_kerja IS NOT NULL AND lokasi_kerja <> ''
       ORDER BY lokasi_kerja`,
    );
    res.json(result.rows.map((row) => row.lokasi_kerja));
  } catch (error) {
    console.error("Error listing locations:", error);
    res.status(500).json({ error: "Failed to list locations" });
  }
}

export async function fetchEmployee(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID karyawan tidak valid." });
    }

    const result = await pool.query(
      `SELECT id, id AS id_karyawan, nik, nama_karyawan, status, status AS status_karyawan,
              title, title AS jabatan, job_level, job_level AS tingkat_jabatan, departemen,
              directorate, directorate AS direktorat, tanggal_mulai_bekerja, employeement_status,
              employeement_status AS status_kepegawaian, nik_atasan_langsung, email_kantor, lokasi_kerja
       FROM karyawan WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Karyawan tidak ditemukan." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({ error: "Gagal mengambil data karyawan." });
  }
}

export async function storeEmployee(req, res) {
  try {
    const nik = cleanText(req.body.nik);
    const nama_karyawan = cleanText(req.body.nama_karyawan);
    const email_kantor = cleanText(req.body.email_kantor) || `${nik?.toLowerCase()}@esb.co.id`;
    const lokasi_kerja = cleanText(req.body.lokasi_kerja);
    
    let status = cleanText(req.body.status || req.body.status_karyawan) || "Active";
    if (!VALID_KARYAWAN_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status tidak valid. Harus salah satu dari: ${VALID_KARYAWAN_STATUSES.join(", ")}` });
    }
    
    let title = cleanText(req.body.title || req.body.jabatan) || "Staff";
    if (title.length > 150) {
      return res.status(400).json({ error: "Title tidak boleh lebih dari 150 karakter." });
    }
    
    let jobLevel = cleanText(req.body.job_level || req.body.tingkat_jabatan) || "L3";
    if (!VALID_JOB_LEVELS.includes(jobLevel)) {
      return res.status(400).json({ error: `Job level tidak valid. Harus salah satu dari: ${VALID_JOB_LEVELS.join(", ")}` });
    }
    
    const departemen = cleanText(req.body.departemen);
    const directorate = cleanText(req.body.directorate || req.body.direktorat);
    const tanggal_mulai_bekerja = cleanText(req.body.tanggal_mulai_bekerja);
    
    let employeementStatus = cleanText(req.body.employeement_status || req.body.status_kepegawaian) || "Permanent";
    if (!VALID_EMPLOYEEMENT_STATUSES.includes(employeementStatus)) {
      return res.status(400).json({ error: `Employeement status tidak valid. Harus salah satu dari: ${VALID_EMPLOYEEMENT_STATUSES.join(", ")}` });
    }
    
    const nik_atasan_langsung = cleanText(req.body.nik_atasan_langsung);

    if (!nik) return res.status(400).json({ error: "NIK wajib diisi." });
    if (!nama_karyawan) return res.status(400).json({ error: "Nama karyawan wajib diisi." });
    if (!email_kantor) return res.status(400).json({ error: "Email kantor wajib diisi." });
    if (!departemen) return res.status(400).json({ error: "Departemen wajib diisi." });
    if (!directorate) return res.status(400).json({ error: "Direktorat wajib diisi." });
    if (!tanggal_mulai_bekerja) return res.status(400).json({ error: "Tanggal mulai bekerja wajib diisi." });

    const createdEmployee = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO karyawan (
           nik, nama_karyawan, email_kantor, lokasi_kerja, status, title, job_level,
           departemen, directorate, tanggal_mulai_bekerja, employeement_status, nik_atasan_langsung
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          nik,
          nama_karyawan,
          email_kantor,
          lokasi_kerja,
          status,
          title,
          jobLevel,
          departemen,
          directorate,
          tanggal_mulai_bekerja,
          employeementStatus,
          nik_atasan_langsung,
        ],
      );

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
          `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
           VALUES ($1, $2, $3, 'user', $4::jsonb, true)`,
          [nama_karyawan, email_kantor, defaultPasswordHash, defaultPermissions],
        );
      }

      return result.rows[0];
    });

    res.status(201).json(createdEmployee);
  } catch (error) {
    if (error.code === '23505') {
      if (error.detail?.includes('email_kantor')) {
        return res.status(400).json({ error: "Email kantor sudah digunakan oleh karyawan lain." });
      }
      if (error.detail?.includes('nik')) {
        return res.status(400).json({ error: "NIK sudah terdaftar." });
      }
      return res.status(400).json({ error: "NIK atau Email kantor sudah terdaftar." });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("Error storing employee:", error);
    res.status(500).json({ error: "Gagal menambahkan data karyawan." });
  }
}

export async function updateEmployee(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID karyawan tidak valid." });
    }

    const nik = cleanText(req.body.nik);
    const nama_karyawan = cleanText(req.body.nama_karyawan);
    const email_kantor = cleanText(req.body.email_kantor);
    const lokasi_kerja = cleanText(req.body.lokasi_kerja);
    
    let status = cleanText(req.body.status || req.body.status_karyawan) || "Active";
    if (!VALID_KARYAWAN_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status tidak valid. Harus salah satu dari: ${VALID_KARYAWAN_STATUSES.join(", ")}` });
    }
    
    let title = cleanText(req.body.title || req.body.jabatan) || "Staff";
    
    let jobLevel = cleanText(req.body.job_level || req.body.tingkat_jabatan) || "L3";
    if (!VALID_JOB_LEVELS.includes(jobLevel)) {
      return res.status(400).json({ error: `Job level tidak valid. Harus salah satu dari: ${VALID_JOB_LEVELS.join(", ")}` });
    }
    
    const departemen = cleanText(req.body.departemen);
    const directorate = cleanText(req.body.directorate || req.body.direktorat);
    const tanggal_mulai_bekerja = cleanText(req.body.tanggal_mulai_bekerja);
    
    let employeementStatus = cleanText(req.body.employeement_status || req.body.status_kepegawaian) || "Permanent";
    if (!VALID_EMPLOYEEMENT_STATUSES.includes(employeementStatus)) {
      return res.status(400).json({ error: `Employeement status tidak valid. Harus salah satu dari: ${VALID_EMPLOYEEMENT_STATUSES.join(", ")}` });
    }
    
    const nik_atasan_langsung = cleanText(req.body.nik_atasan_langsung);

    if (!nik) return res.status(400).json({ error: "NIK wajib diisi." });
    if (!nama_karyawan) return res.status(400).json({ error: "Nama karyawan wajib diisi." });
    if (!departemen) return res.status(400).json({ error: "Departemen wajib diisi." });
    if (!directorate) return res.status(400).json({ error: "Direktorat wajib diisi." });
    if (!tanggal_mulai_bekerja) return res.status(400).json({ error: "Tanggal mulai bekerja wajib diisi." });

    const result = await pool.query(
      `UPDATE karyawan
        SET nik = $1,
            nama_karyawan = $2,
            email_kantor = $3,
            lokasi_kerja = $4,
            status = $5,
            title = $6,
            job_level = $7,
            departemen = $8,
            directorate = $9,
            tanggal_mulai_bekerja = $10,
            employeement_status = $11,
            nik_atasan_langsung = $12,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *`,
      [
        nik,
        nama_karyawan,
        email_kantor,
        lokasi_kerja,
        status,
        title,
        jobLevel,
        departemen,
        directorate,
        tanggal_mulai_bekerja,
        employeementStatus,
        nik_atasan_langsung,
        id,
      ],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Karyawan tidak ditemukan." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      if (error.detail?.includes('email_kantor')) {
        return res.status(400).json({ error: "Email kantor sudah digunakan oleh karyawan lain." });
      }
      if (error.detail?.includes('nik')) {
        return res.status(400).json({ error: "NIK sudah digunakan oleh karyawan lain." });
      }
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("Error updating employee:", error);
    res.status(500).json({ error: "Gagal memperbarui data karyawan." });
  }
}

export async function deleteEmployee(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID karyawan tidak valid." });
    }

    const result = await pool.query(`UPDATE karyawan SET status = 'Resigned' WHERE id = $1 RETURNING *`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Karyawan tidak ditemukan." });
    }

    res.json({ message: "Data karyawan telah diubah statusnya menjadi Resigned." });
  } catch (error) {
    console.error("Error deleting employee:", error);
    res.status(500).json({ error: "Gagal menghapus data karyawan." });
  }
}

