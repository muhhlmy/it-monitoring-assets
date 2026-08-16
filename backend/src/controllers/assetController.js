// This is a minimal controller that re-exports all functions from the main implementation
// The actual implementation is in assetController.js main file - this ensures exports work

import { pool, withTransaction } from "../config/database.js";

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireAssetAuditActor(req) {
  const actorId = Number(req.user?.id);
  const actorName = typeof req.user?.nama === "string" ? req.user.nama.trim() : "";
  if (!Number.isSafeInteger(actorId) || actorId <= 0 || !actorName) {
    throw createHttpError(403, "Identitas actor aset tidak valid.");
  }
  const stablePrefix = `user:${actorId} `;
  return stablePrefix + actorName.slice(0, 150 - stablePrefix.length);
}

function validateAssetPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createHttpError(400, "Payload aset harus berupa object JSON.");
  }

  function cleanText(value) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text === "" ? null : text;
  }

  function checkMaximumLength(fieldName, value, maximumLength) {
    if (value && value.length > maximumLength) {
      throw createHttpError(400, fieldName + " maksimal " + maximumLength + " karakter.");
    }
  }

  const hostnameClean = cleanText(body.hostname || body.label_aset);
  const serialNumberClean = cleanText(body.serial_number || body.nomor_seri);

  const asset = {
    hostname: hostnameClean,
    serial_number: serialNumberClean,
    spesifikasi: cleanText(body.spesifikasi),
    nik_pemegang_asset: cleanText(body.nik_pemegang_asset || body.nik),
    nama_karyawan_pemegang_asset: cleanText(body.nama_karyawan_pemegang_asset || body.nama_karyawan),
    departemen_pemegang_asset: cleanText(body.departemen_pemegang_asset || body.departemen),
    lokasi_asset: cleanText(body.lokasi_asset || body.lokasi_kerja),
    tipe_perangkat: cleanText(body.tipe_perangkat),
    brand_merek: cleanText(body.brand_merek || body.merek),
    model: cleanText(body.model),
    status: cleanText(body.status || body.status_aset) || 'In Use',
    kondisi: cleanText(body.kondisi || body.kondisi_aset) || 'Normal',
    note_asset: cleanText(body.note_asset || body.catatan_aset),
  };

  if (!asset.hostname) {
    throw createHttpError(400, "Hostname wajib diisi.");
  }

  if (!asset.serial_number) {
    throw createHttpError(400, "Serial number wajib diisi.");
  }

  checkMaximumLength("hostname", asset.hostname, 50);
  checkMaximumLength("serial_number", asset.serial_number, 50);
  checkMaximumLength("spesifikasi", asset.spesifikasi, 1000);
  checkMaximumLength("nik_pemegang_asset", asset.nik_pemegang_asset, 20);
  checkMaximumLength("nama_karyawan_pemegang_asset", asset.nama_karyawan_pemegang_asset, 150);
  checkMaximumLength("departemen_pemegang_asset", asset.departemen_pemegang_asset, 100);
  checkMaximumLength("lokasi_asset", asset.lokasi_asset, 100);
  checkMaximumLength("tipe_perangkat", asset.tipe_perangkat, 50);
  checkMaximumLength("brand_merek", asset.brand_merek, 50);
  checkMaximumLength("model", asset.model, 100);
  checkMaximumLength("status", asset.status, 20);
  checkMaximumLength("kondisi", asset.kondisi, 20);
  checkMaximumLength("note_asset", asset.note_asset, 255);

  const validStatuses = ["In Use", "Stock", "Damaged", "In Service", "Disposal"];
  if (asset.status && !validStatuses.includes(asset.status)) {
    throw createHttpError(400, `Status tidak valid. Harus salah satu dari: ${validStatuses.join(", ")}`);
  }

  const validConditions = ["Baru", "Normal", "Rusak Ringan", "Rusak Sedang", "Rusak Berat"];
  if (asset.kondisi && !validConditions.includes(asset.kondisi)) {
    throw createHttpError(400, `Kondisi tidak valid. Harus salah satu dari: ${validConditions.join(", ")}`);
  }

  return asset;
}

function validateAssetId(value) {
  const containsOnlyNumbers = /^\d+$/.test(value);
  if (!containsOnlyNumbers || value === "0") {
    throw createHttpError(400, "ID aset tidak valid.");
  }
  return value;
}

async function findEmployeeByNik(nik, databaseClient) {
  if (!nik) return null;

  const result = await databaseClient.query(
    "SELECT id, nik, nama_karyawan, departemen, lokasi_kerja FROM karyawan WHERE nik = $1",
    [nik],
  );

  if (result.rowCount === 0) {
    throw createHttpError(400, "Karyawan dengan NIK " + nik + " tidak ditemukan.");
  }

  return result.rows[0];
}

const assetColumns = `
  id, hostname, serial_number, spesifikasi, nik_pemegang_asset, nama_karyawan_pemegang_asset,
  departemen_pemegang_asset, lokasi_asset, tipe_perangkat, brand_merek, model, status,
  kondisi, note_asset, created_at, updated_at
`;

async function findAssetById(id, databaseClient) {
  if (!databaseClient) databaseClient = pool;

  const sql = "SELECT " + assetColumns + " FROM aset_ti WHERE id = $1 AND deleted_at IS NULL";
  const result = await databaseClient.query(sql, [id]);

  if (result.rowCount === 0) return null;
  return result.rows[0];
}

async function syncDeviceCycle(databaseClient, idAset, oldNik, newNik, assetInfo) {
  const newHasEmployee = Boolean(newNik);
  const employeeChanged = oldNik !== newNik;
  if (!employeeChanged) return;

  await databaseClient.query(
    `UPDATE riwayat_pemakaian_aset SET tanggal_selesai = CURRENT_TIMESTAMP WHERE id_aset = $1 AND tanggal_selesai IS NULL`,
    [idAset]
  );

  if (newHasEmployee) {
    await databaseClient.query(
      `INSERT INTO riwayat_pemakaian_aset (id_aset, nik_pemegang, tanggal_mulai, catatan) 
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3)`,
      [idAset, newNik, `Aset dialokasikan ke ${newNik}`]
    );
  } else {
    await databaseClient.query(
      `INSERT INTO riwayat_pemakaian_aset (id_aset, nik_pemegang, tanggal_mulai, catatan) 
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3)`,
      [idAset, null, "Aset dikembalikan ke stock"]
    );
  }
}

// GET /api/assets/my
export async function listMyAssets(req, res) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    
    const sql = `SELECT ` + assetColumns + `
                 FROM aset_ti 
                 WHERE deleted_at IS NULL
                 ORDER BY created_at DESC`;
                 
    const results = await pool.query(sql);
    res.json(results.rows);
  } catch (error) {
    console.error('Error listing my assets:', error);
    res.status(500).json({ error: 'Failed to list my assets' });
  }
}

// GET /api/assets/stats
export async function showAssetStats(req, res) {
  try {
    const statsSql = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'In Use') AS in_use_count,
        COUNT(*) FILTER (WHERE status = 'Stock') AS stock_count,
        COUNT(*) FILTER (WHERE status = 'Damaged') AS damaged_count,
        COUNT(*) FILTER (WHERE status IS NOT NULL) AS total_assets
      FROM aset_ti WHERE deleted_at IS NULL
    `;
    
    const result = await pool.query(statsSql);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting asset stats:', error);
    res.status(500).json({ error: 'Failed to get asset stats' });
  }
}

// GET /api/assets/cycle/:nik
export async function getDeviceCycleByNik(req, res) {
  try {
    const cycleSql = `
      SELECT rpa.*, a.hostname, a.serial_number, a.model, a.brand_merek
      FROM riwayat_pemakaian_aset rpa
      LEFT JOIN aset_ti a ON rpa.id_aset = a.id
      WHERE rpa.nik_pemegang = $1 AND rpa.tanggal_selesai IS NULL
      ORDER BY rpa.tanggal_mulai DESC
    `;
    
    const result = await pool.query(cycleSql, [req.params.nik]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting device cycle:', error);
    res.status(500).json({ error: 'Failed to get device cycle' });
  }
}

// GET /api/assets/:id
export async function fetchAsset(req, res) {
  try {
    const id = validateAssetId(req.params.id);
    const asset = await findAssetById(id);
    if (!asset) throw createHttpError(404, "Aset tidak ditemukan.");
    res.json(asset);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error fetching asset:', error);
    res.status(500).json({ error: 'Gagal mengambil data aset.' });
  }
}

// PUT /api/assets/:id
export async function replaceAsset(req, res) {
  try {
    const id = validateAssetId(req.params.id);
    const asset = validateAssetPayload(req.body);

    async function updateInsideTransaction(databaseClient) {
      const lockResult = await databaseClient.query(
        "SELECT id, nik_pemegang_asset FROM aset_ti WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [id]
      );

      if (lockResult.rowCount === 0) throw createHttpError(404, "Aset tidak ditemukan.");

      const oldNik = lockResult.rows[0].nik_pemegang_asset;
      if (asset.nik_pemegang_asset) {
        const emp = await findEmployeeByNik(asset.nik_pemegang_asset, databaseClient);
        asset.nama_karyawan_pemegang_asset = emp.nama_karyawan;
        asset.departemen_pemegang_asset = emp.departemen;
        if (!asset.lokasi_asset) {
          asset.lokasi_asset = emp.lokasi_kerja || null;
        }
      } else {
        asset.nama_karyawan_pemegang_asset = null;
        asset.departemen_pemegang_asset = null;
      }

      const sql = `UPDATE aset_ti SET
          hostname = $2, serial_number = $3, spesifikasi = $4, nik_pemegang_asset = $5,
          nama_karyawan_pemegang_asset = $6, departemen_pemegang_asset = $7, lokasi_asset = $8,
          tipe_perangkat = $9, brand_merek = $10, model = $11, status = $12, kondisi = $13,
          note_asset = $14, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *`;

      const values = [id, asset.hostname, asset.serial_number, asset.spesifikasi,
        asset.nik_pemegang_asset, asset.nama_karyawan_pemegang_asset, asset.departemen_pemegang_asset,
        asset.lokasi_asset, asset.tipe_perangkat, asset.brand_merek, asset.model,
        asset.status, asset.kondisi, asset.note_asset];

      const updateResult = await databaseClient.query(sql, values);
      await syncDeviceCycle(databaseClient, id, oldNik, asset.nik_pemegang_asset, updateResult.rows[0]);
      return updateResult.rows[0];
    }

    const updatedAsset = await withTransaction(updateInsideTransaction);
    res.json(updatedAsset);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Hostname atau Serial Number sudah digunakan oleh aset lain.' });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error updating asset:', error);
    res.status(500).json({ error: 'Gagal memperbarui aset.' });
  }
}

// DELETE /api/assets/:id
export async function deleteAsset(req, res) {
  try {
    const id = validateAssetId(req.params.id);
    const asset = await findAssetById(id);
    if (!asset) throw createHttpError(404, "Aset tidak ditemukan.");

    await withTransaction(async (databaseClient) => {
      await databaseClient.query("UPDATE aset_ti SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
    });
    res.status(204).send();
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error deleting asset:', error);
    res.status(500).json({ error: 'Gagal menghapus aset.' });
  }
}

// POST /api/assets
export async function addAsset(req, res) {
  try {
    const auditActor = requireAssetAuditActor(req);
    const asset = validateAssetPayload(req.body);

    async function insertInsideTransaction(databaseClient) {
      if (asset.nik_pemegang_asset) {
        const emp = await findEmployeeByNik(asset.nik_pemegang_asset, databaseClient);
        asset.nama_karyawan_pemegang_asset = emp.nama_karyawan;
        asset.departemen_pemegang_asset = emp.departemen;
        if (!asset.lokasi_asset) {
          asset.lokasi_asset = emp.lokasi_kerja || null;
        }
      }

      const sql = `INSERT INTO aset_ti (hostname, serial_number, spesifikasi, nik_pemegang_asset,
                nama_karyawan_pemegang_asset, departemen_pemegang_asset, lokasi_asset, tipe_perangkat,
                brand_merek, model, status, kondisi, note_asset)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`;

      const values = [asset.hostname, asset.serial_number, asset.spesifikasi,
        asset.nik_pemegang_asset, asset.nama_karyawan_pemegang_asset, asset.departemen_pemegang_asset,
        asset.lokasi_asset, asset.tipe_perangkat, asset.brand_merek, asset.model,
        asset.status, asset.kondisi, asset.note_asset];

      const insertResult = await databaseClient.query(sql, values);
      const newAsset = insertResult.rows[0];
      await syncDeviceCycle(databaseClient, newAsset.id, null, asset.nik_pemegang_asset, newAsset);
      return newAsset;
    }

    const createdAsset = await withTransaction(insertInsideTransaction);
    res.status(201).json(createdAsset);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Hostname atau Serial Number sudah terdaftar.' });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error adding asset:', error);
    res.status(500).json({ error: 'Gagal menambahkan aset.' });
  }
}

// GET /api/assets (list all assets)
export async function listAssets(req, res) {
  try {
    const results = await pool.query(`
      SELECT ` + assetColumns + `
      FROM aset_ti
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);
    res.json(results.rows);
  } catch (error) {
    console.error('Error listing assets:', error);
    res.status(500).json({ error: 'Gagal memuat daftar aset.' });
  }
}
