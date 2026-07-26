import { pool, withTransaction } from "../config/database.js";

// Daftar kolom ini sama dengan view daftar_aset_ti_lengkap di Schema.sql.
const assetColumns = `
  id_aset, nomor_seri, label_aset, spesifikasi, nik, nama_karyawan,
  departemen, lokasi_kerja, tipe_perangkat, merek, model, status_aset,
  kondisi_aset, catatan_aset, lokasi_aset
`;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Mengubah input menjadi text yang sudah dibersihkan dari spasi.
// Nilai kosong diubah menjadi null agar cocok dengan PostgreSQL.
function cleanText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  if (text === "") {
    return null;
  }

  return text;
}

function checkMaximumLength(fieldName, value, maximumLength) {
  if (value && value.length > maximumLength) {
    throw createHttpError(
      400,
      fieldName + " maksimal " + maximumLength + " karakter.",
    );
  }
}

// Fungsi ini diekspor agar bisa diuji tanpa menjalankan server.
export function validateAssetPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createHttpError(400, "Payload aset harus berupa object JSON.");
  }

  // Ambil hanya field yang diperbolehkan.
  const asset = {
    nomor_seri: cleanText(body.nomor_seri),
    label_aset: cleanText(body.label_aset),
    spesifikasi: cleanText(body.spesifikasi),
    nik: cleanText(body.nik),
    lokasi_aset: cleanText(body.lokasi_aset),
    tipe_perangkat: cleanText(body.tipe_perangkat),
    merek: cleanText(body.merek),
    model: cleanText(body.model),
    status_aset: cleanText(body.status_aset),
    kondisi_aset: cleanText(body.kondisi_aset),
    catatan_aset: cleanText(body.catatan_aset),
  };

  if (asset.nik) {
    asset.lokasi_aset = null;
  }

  if (!asset.label_aset) {
    throw createHttpError(400, "Label aset wajib diisi.");
  }

  checkMaximumLength("nomor_seri", asset.nomor_seri, 100);
  checkMaximumLength("label_aset", asset.label_aset, 100);
  checkMaximumLength("nik", asset.nik, 30);
  checkMaximumLength("lokasi_aset", asset.lokasi_aset, 100);
  checkMaximumLength("tipe_perangkat", asset.tipe_perangkat, 50);
  checkMaximumLength("merek", asset.merek, 100);
  checkMaximumLength("model", asset.model, 100);
  checkMaximumLength("status_aset", asset.status_aset, 30);
  checkMaximumLength("kondisi_aset", asset.kondisi_aset, 30);

  return asset;
}

export function validateAssetId(value) {
  const containsOnlyNumbers = /^\d+$/.test(value);

  if (!containsOnlyNumbers || value === "0") {
    throw createHttpError(400, "ID aset tidak valid.");
  }

  return value;
}

async function findAssetById(id, databaseClient) {
  // Gunakan pool jika fungsi dipanggil tanpa client transaction.
  if (!databaseClient) {
    databaseClient = pool;
  }

  const sql =
    "SELECT " +
    assetColumns +
    " FROM daftar_aset_ti_lengkap WHERE id_aset = $1";
  const result = await databaseClient.query(sql, [id]);

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

async function findEmployeeId(nik, databaseClient) {
  // Aset boleh belum memiliki karyawan.
  if (!nik) {
    return null;
  }

  const result = await databaseClient.query(
    "SELECT id_karyawan FROM karyawan WHERE nik = $1",
    [nik],
  );

  if (result.rowCount === 0) {
    throw createHttpError(
      400,
      "Karyawan dengan NIK " + nik + " tidak ditemukan.",
    );
  }

  return result.rows[0].id_karyawan;
}

// Sinkronisasi tabel riwayat_pemakaian_aset setiap kali pemegang aset berubah.
// dipanggil di dalam transaksi (client wajib diteruskan).
async function syncDeviceCycle(databaseClient, idAset, oldNik, newNik, assetInfo) {
  const oldHasEmployee = Boolean(oldNik);
  const newHasEmployee = Boolean(newNik);
  const employeeChanged = oldNik !== newNik;

  if (!employeeChanged) return; // Tidak ada perubahan pemegang, tidak perlu sync

  // 1. Tutup record aktif milik pemegang lama (jika ada)
  if (oldHasEmployee) {
    await databaseClient.query(
      `UPDATE riwayat_pemakaian_aset
         SET tanggal_selesai = CURRENT_TIMESTAMP
       WHERE id_aset = $1
         AND nik = $2
         AND tanggal_selesai IS NULL`,
      [idAset, oldNik]
    );
  }

  // 2. Buat record baru untuk pemegang baru (jika ada)
  if (newHasEmployee) {
    // Ambil data karyawan baru
    const empResult = await databaseClient.query(
      `SELECT id_karyawan, nik, nama_karyawan FROM karyawan WHERE nik = $1`,
      [newNik]
    );
    if (empResult.rowCount > 0) {
      const emp = empResult.rows[0];
      await databaseClient.query(
        `INSERT INTO riwayat_pemakaian_aset
           (id_aset, label_aset, nomor_seri, tipe_perangkat, merek, model,
            id_karyawan, nik, nama_karyawan, tanggal_mulai)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
        [
          idAset,
          assetInfo.label_aset,
          assetInfo.nomor_seri,
          assetInfo.tipe_perangkat,
          assetInfo.merek,
          assetInfo.model,
          emp.id_karyawan,
          emp.nik,
          emp.nama_karyawan,
        ]
      );
    }
  }
}

// Tutup semua record aktif saat aset dihapus dari sistem.
async function closeAllDeviceCycleRecords(databaseClient, idAset) {
  await databaseClient.query(
    `UPDATE riwayat_pemakaian_aset
       SET tanggal_selesai = CURRENT_TIMESTAMP
     WHERE id_aset = $1 AND tanggal_selesai IS NULL`,
    [idAset]
  );
}

// GET /api/assets/cycle/:nik — riwayat seluruh perangkat yang pernah dipakai karyawan
export async function getDeviceCycleByNik(req, res) {
  const nik = req.params.nik ? String(req.params.nik).trim() : null;
  if (!nik) {
    throw createHttpError(400, "NIK wajib diisi.");
  }

  // Verifikasi karyawan ada
  const empCheck = await pool.query(
    "SELECT nik FROM karyawan WHERE nik = $1",
    [nik]
  );
  if (empCheck.rowCount === 0) {
    throw createHttpError(404, "Karyawan dengan NIK tersebut tidak ditemukan.");
  }

  const result = await pool.query(
    `SELECT
       r.id,
       r.id_aset,
       r.label_aset,
       r.nomor_seri,
       r.tipe_perangkat,
       r.merek,
       r.model,
       r.tanggal_mulai,
       r.tanggal_selesai,
       r.catatan,
       CASE WHEN r.tanggal_selesai IS NULL THEN 'Aktif' ELSE 'Selesai' END AS status_pemakaian
     FROM riwayat_pemakaian_aset AS r
     WHERE r.nik = $1
     ORDER BY r.tanggal_mulai DESC`,
    [nik]
  );

  res.json(result.rows);
}

// GET /api/assets
export async function listAssets(req, res) {
  const sql =
    "SELECT " +
    assetColumns +
    " FROM daftar_aset_ti_lengkap ORDER BY id_aset DESC";
  const result = await pool.query(sql);

  res.json(result.rows);
}

export async function listMyAssets(req, res) {
  const userEmail = req.user.email;
  const userRole = req.user.role ? req.user.role.trim().toLowerCase() : '';
  let nik = null;

  // Jika admin/superadmin dan mengirimkan query nik, gunakan nik tersebut
  if ((userRole === 'admin' || userRole === 'super admin' || userRole === 'superadmin') && req.query.nik) {
    nik = String(req.query.nik).trim();
  } else {
    // Jika bukan admin, atau admin tidak mengirimkan query nik, gunakan email login
    if (!userEmail) {
      const error = new Error("Token tidak memiliki informasi email.");
      error.statusCode = 400;
      throw error;
    }

    const employeeCheck = await pool.query(
      "SELECT nik FROM karyawan WHERE email_kantor = $1",
      [userEmail]
    );

    if (employeeCheck.rowCount === 0) {
      return res.json([]);
    }
    nik = employeeCheck.rows[0].nik;
  }

  const sql =
    "SELECT " +
    assetColumns +
    " FROM daftar_aset_ti_lengkap WHERE nik = $1 ORDER BY id_aset DESC";
  const result = await pool.query(sql, [nik]);

  res.json(result.rows);
}


// GET /api/assets/:id
export async function showAsset(req, res) {
  const id = validateAssetId(req.params.id);
  const asset = await findAssetById(id);

  if (!asset) {
    throw createHttpError(404, "Aset tidak ditemukan.");
  }

  res.json(asset);
}

// GET /api/assets/stats
export async function showAssetStats(req, res) {
  // Query dijalankan satu per satu agar alurnya mudah diikuti.
  const totals = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM aset_ti) AS total_assets,
      (SELECT COUNT(*) FROM karyawan) AS total_employees
  `);

  const usersCount = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN is_active = true THEN 1 END) AS active
    FROM users
  `);

  const byStatus = await pool.query(`
    SELECT COALESCE(status_aset, 'Belum ditentukan') AS status, COUNT(*) AS count
    FROM aset_ti
    GROUP BY status_aset
    ORDER BY count DESC
  `);

  const byCondition = await pool.query(`
    SELECT COALESCE(kondisi_aset, 'Belum ditentukan') AS condition, COUNT(*) AS count
    FROM aset_ti
    GROUP BY kondisi_aset
    ORDER BY count DESC
  `);

  const byType = await pool.query(`
    SELECT COALESCE(tipe_perangkat, 'Belum ditentukan') AS device_type, COUNT(*) AS count
    FROM aset_ti
    GROUP BY tipe_perangkat
    ORDER BY count DESC
  `);

  const byLocation = await pool.query(`
    SELECT COALESCE(lokasi_kerja, 'Belum ditentukan') AS location, COUNT(*) AS count
    FROM daftar_aset_ti_lengkap
    GROUP BY lokasi_kerja
    ORDER BY count DESC
  `);

  const recentAssets = await pool.query(`
    SELECT view_aset.*, aset.dibuat_pada
    FROM daftar_aset_ti_lengkap AS view_aset
    JOIN aset_ti AS aset USING (id_aset)
    ORDER BY aset.dibuat_pada DESC, view_aset.id_aset DESC
    LIMIT 5
  `);

  res.json({
    totalAssets: totals.rows[0].total_assets,
    totalEmployees: totals.rows[0].total_employees,
    totalUsers: parseInt(usersCount.rows[0]?.total || 0, 10),
    activeUsers: parseInt(usersCount.rows[0]?.active || 0, 10),
    byStatus: byStatus.rows,
    byCondition: byCondition.rows,
    byType: byType.rows,
    byLocation: byLocation.rows,
    recentAssets: recentAssets.rows,
  });
}

// Helper untuk menyimpan log perubahan aset otomatis
async function logAssetChange(databaseClient, idAset, labelAset, aksi, oldAsset, newAsset, olehPengguna = 'Admin IT') {
  let perubahan = '';

  if (aksi === 'TAMBAH') {
    perubahan = `Aset baru didaftarkan dengan nomor seri ${newAsset.nomor_seri || '(kosong)'}, tipe: ${newAsset.tipe_perangkat || '(kosong)'}, merek: ${newAsset.merek || '(kosong)'}, status: ${newAsset.status_aset || 'Tersedia'}, kondisi: ${newAsset.kondisi_aset || 'Baik'}.`;
  } else if (aksi === 'HAPUS') {
    perubahan = `Aset dengan label ${labelAset} (Nomor Seri: ${oldAsset?.nomor_seri || '(kosong)'}) dihapus dari sistem.`;
  } else if (aksi === 'UBAH') {
    const changes = [];
    const keys = [
      { key: 'nomor_seri', label: 'Nomor Seri' },
      { key: 'label_aset', label: 'Label Aset' },
      { key: 'spesifikasi', label: 'Spesifikasi' },
      { key: 'nama_karyawan', label: 'Pemegang Aset' },
      { key: 'lokasi_aset', label: 'Lokasi Perangkat' },
      { key: 'tipe_perangkat', label: 'Tipe' },
      { key: 'merek', label: 'Merek' },
      { key: 'model', label: 'Model' },
      { key: 'status_aset', label: 'Status' },
      { key: 'kondisi_aset', label: 'Kondisi' },
      { key: 'catatan_aset', label: 'Catatan' }
    ];
    for (const item of keys) {
      const oldVal = oldAsset[item.key];
      const newVal = newAsset[item.key];
      if (String(oldVal || '').trim() !== String(newVal || '').trim()) {
        changes.push(`${item.label}: ${oldVal || '(kosong)'} -> ${newVal || '(kosong)'}`);
      }
    }
    if (changes.length > 0) {
      perubahan = `Perubahan data: ${changes.join(', ')}`;
    } else {
      perubahan = 'Tidak ada perubahan data.';
    }
  }

  await databaseClient.query(
    `INSERT INTO log_riwayat_aset (id_aset, label_aset, aksi, perubahan, oleh_pengguna)
     VALUES ($1, $2, $3, $4, $5)`,
    [idAset, labelAset, aksi, perubahan, olehPengguna]
  );
}

// POST /api/assets
export async function storeAsset(req, res) {
  const asset = validateAssetPayload(req.body);

  async function insertInsideTransaction(databaseClient) {
    const employeeId = await findEmployeeId(asset.nik, databaseClient);

    const sql = `
      INSERT INTO aset_ti (
        nomor_seri, label_aset, spesifikasi, id_karyawan, lokasi_aset,
        tipe_perangkat, merek, model, status_aset, kondisi_aset, catatan_aset
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id_aset
    `;

    const values = [
      asset.nomor_seri,
      asset.label_aset,
      asset.spesifikasi,
      employeeId,
      asset.lokasi_aset,
      asset.tipe_perangkat,
      asset.merek,
      asset.model,
      asset.status_aset,
      asset.kondisi_aset,
      asset.catatan_aset,
    ];

    const insertResult = await databaseClient.query(sql, values);
    const newAssetId = insertResult.rows[0].id_aset;

    const created = await findAssetById(newAssetId, databaseClient);
    await logAssetChange(databaseClient, created.id_aset, created.label_aset, 'TAMBAH', null, created);
    // Catat ke riwayat pemakaian jika langsung di-assign ke karyawan
    await syncDeviceCycle(databaseClient, created.id_aset, null, asset.nik, created);
    return created;
  }

  const createdAsset = await withTransaction(insertInsideTransaction);
  res.status(201).json(createdAsset);
}

// PUT /api/assets/:id
export async function replaceAsset(req, res) {
  const id = validateAssetId(req.params.id);
  const asset = validateAssetPayload(req.body);

  const oldAsset = await findAssetById(id);
  if (!oldAsset) {
    throw createHttpError(404, "Aset tidak ditemukan.");
  }

  async function updateInsideTransaction(databaseClient) {
    const employeeId = await findEmployeeId(asset.nik, databaseClient);

    const sql = `
      UPDATE aset_ti SET
        nomor_seri = $1,
        label_aset = $2,
        spesifikasi = $3,
        id_karyawan = $4,
        lokasi_aset = $5,
        tipe_perangkat = $6,
        merek = $7,
        model = $8,
        status_aset = $9,
        kondisi_aset = $10,
        catatan_aset = $11,
        diperbarui_pada = CURRENT_TIMESTAMP
      WHERE id_aset = $12
    `;

    const values = [
      asset.nomor_seri,
      asset.label_aset,
      asset.spesifikasi,
      employeeId,
      asset.lokasi_aset,
      asset.tipe_perangkat,
      asset.merek,
      asset.model,
      asset.status_aset,
      asset.kondisi_aset,
      asset.catatan_aset,
      id,
    ];

    const updateResult = await databaseClient.query(sql, values);

    if (updateResult.rowCount === 0) {
      throw createHttpError(404, "Aset tidak ditemukan.");
    }

    const updated = await findAssetById(id, databaseClient);
    await logAssetChange(databaseClient, id, updated.label_aset, 'UBAH', oldAsset, updated);
    // Sync riwayat pemakaian jika pemegang berubah
    await syncDeviceCycle(databaseClient, id, oldAsset.nik || null, asset.nik, updated);
    return updated;
  }

  const updatedAsset = await withTransaction(updateInsideTransaction);
  res.json(updatedAsset);
}

// DELETE /api/assets/:id
export async function destroyAsset(req, res) {
  const id = validateAssetId(req.params.id);

  const oldAsset = await findAssetById(id);
  if (!oldAsset) {
    throw createHttpError(404, "Aset tidak ditemukan.");
  }

  async function deleteInsideTransaction(databaseClient) {
    const result = await databaseClient.query("DELETE FROM aset_ti WHERE id_aset = $1", [
      id,
    ]);

    if (result.rowCount === 0) {
      throw createHttpError(404, "Aset tidak ditemukan.");
    }

    await logAssetChange(databaseClient, id, oldAsset.label_aset, 'HAPUS', oldAsset, null);
    // Tutup semua record riwayat aktif sebelum aset dihapus
    await closeAllDeviceCycleRecords(databaseClient, id);
    return true;
  }

  await withTransaction(deleteInsideTransaction);
  res.status(204).end();
}
