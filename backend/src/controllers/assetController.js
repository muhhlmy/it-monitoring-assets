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
    return req.user?.username || req.user?.email || "Super Administrator";
  }
  return actorName;
}

async function recordAssetLog(databaseClient, idAset, labelAset, aksi, perubahan, olehPengguna) {
  try {
    const client = databaseClient || pool;
    await client.query(
      `INSERT INTO log_riwayat_aset (id_aset, label_aset, aksi, perubahan, oleh_pengguna, dibuat_pada)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [idAset, labelAset || `Aset #${idAset}`, aksi, perubahan, olehPengguna || 'Sistem']
    );
  } catch (err) {
    console.error('Error recording asset log:', err);
  }
}

// PUT /api/assets/:id
export async function replaceAsset(req, res) {
  try {
    const id = validateAssetId(req.params.id);
    const auditActor = requireAssetAuditActor(req);
    const asset = validateAssetPayload(req.body);

    async function updateInsideTransaction(databaseClient) {
      const lockResult = await databaseClient.query(
        "SELECT * FROM aset_ti WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [id]
      );

      if (lockResult.rowCount === 0) throw createHttpError(404, "Aset tidak ditemukan.");

      const oldAsset = lockResult.rows[0];
      const oldNik = oldAsset.nik_pemegang_asset;
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
      const updatedAsset = updateResult.rows[0];

      await syncDeviceCycle(databaseClient, id, oldNik, asset.nik_pemegang_asset, updatedAsset);

      // Record Audit Log
      const diffs = [];
      if (oldAsset.hostname !== updatedAsset.hostname) diffs.push(`Hostname: ${oldAsset.hostname || '-'} -> ${updatedAsset.hostname || '-'}`);
      if (oldAsset.serial_number !== updatedAsset.serial_number) diffs.push(`Serial Number: ${oldAsset.serial_number || '-'} -> ${updatedAsset.serial_number || '-'}`);
      if (oldAsset.status !== updatedAsset.status) diffs.push(`Status: ${oldAsset.status || '-'} -> ${updatedAsset.status || '-'}`);
      if (oldAsset.kondisi !== updatedAsset.kondisi) diffs.push(`Kondisi: ${oldAsset.kondisi || '-'} -> ${updatedAsset.kondisi || '-'}`);
      if (oldAsset.nik_pemegang_asset !== updatedAsset.nik_pemegang_asset) diffs.push(`NIK Pemegang: ${oldAsset.nik_pemegang_asset || '-'} -> ${updatedAsset.nik_pemegang_asset || '-'}`);
      if (oldAsset.nama_karyawan_pemegang_asset !== updatedAsset.nama_karyawan_pemegang_asset) diffs.push(`Pemegang: ${oldAsset.nama_karyawan_pemegang_asset || '-'} -> ${updatedAsset.nama_karyawan_pemegang_asset || '-'}`);
      if (oldAsset.departemen_pemegang_asset !== updatedAsset.departemen_pemegang_asset) diffs.push(`Departemen: ${oldAsset.departemen_pemegang_asset || '-'} -> ${updatedAsset.departemen_pemegang_asset || '-'}`);
      if (oldAsset.lokasi_asset !== updatedAsset.lokasi_asset) diffs.push(`Lokasi: ${oldAsset.lokasi_asset || '-'} -> ${updatedAsset.lokasi_asset || '-'}`);
      if (oldAsset.tipe_perangkat !== updatedAsset.tipe_perangkat) diffs.push(`Tipe: ${oldAsset.tipe_perangkat || '-'} -> ${updatedAsset.tipe_perangkat || '-'}`);
      if (oldAsset.brand_merek !== updatedAsset.brand_merek) diffs.push(`Merek: ${oldAsset.brand_merek || '-'} -> ${updatedAsset.brand_merek || '-'}`);
      if (oldAsset.model !== updatedAsset.model) diffs.push(`Model: ${oldAsset.model || '-'} -> ${updatedAsset.model || '-'}`);

      const changeSummary = diffs.length > 0 ? `Perubahan data: ${diffs.join(', ')}` : 'Informasi aset diperbarui';
      await recordAssetLog(databaseClient, id, updatedAsset.hostname, 'UBAH', changeSummary, auditActor);

      return updatedAsset;
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
    const auditActor = requireAssetAuditActor(req);
    const asset = await findAssetById(id);
    if (!asset) throw createHttpError(404, "Aset tidak ditemukan.");

    await withTransaction(async (databaseClient) => {
      await databaseClient.query("UPDATE aset_ti SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
      await recordAssetLog(databaseClient, id, asset.hostname, 'HAPUS', `Aset ${asset.hostname} (${asset.serial_number}) dihapus dari sistem.`, auditActor);
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
      await recordAssetLog(databaseClient, newAsset.id, newAsset.hostname, 'TAMBAH', `Aset baru didaftarkan dengan nomor seri ${newAsset.serial_number}, tipe: ${newAsset.tipe_perangkat || '-'}, merek: ${newAsset.brand_merek || '-'}, status: ${newAsset.status}, kondisi: ${newAsset.kondisi}.`, auditActor);
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
  }
}

// GET /api/assets/my
export async function listMyAssets(req, res) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    
    let sql = `SELECT ` + assetColumns + ` FROM aset_ti WHERE deleted_at IS NULL`;
    const params = [];

    const queryNik = req.query.nik;
    if (queryNik) {
      sql += ` AND nik_pemegang_asset = $1`;
      params.push(queryNik);
    } else if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      let userNik = req.user.nik;
      if (!userNik && req.user.email) {
        const empRes = await pool.query(
          `SELECT nik FROM karyawan WHERE LOWER(TRIM(email_kantor)) = LOWER(TRIM($1)) OR LOWER(TRIM(nama_karyawan)) = LOWER(TRIM($2)) LIMIT 1`,
          [req.user.email, req.user.nama || '']
        );
        if (empRes.rows.length > 0 && empRes.rows[0].nik) {
          userNik = empRes.rows[0].nik;
        }
      }

      if (userNik) {
        sql += ` AND nik_pemegang_asset = $1`;
        params.push(userNik);
      } else {
        sql += ` AND (LOWER(TRIM(nama_karyawan_pemegang_asset)) = LOWER(TRIM($1)) OR LOWER(TRIM(nik_pemegang_asset)) = LOWER(TRIM($2)))`;
        params.push(req.user.nama || '', req.user.email || '');
      }
    }
    sql += ` ORDER BY created_at DESC`;

    const results = await pool.query(sql, params);
    res.json(results.rows);
  } catch (error) {
    console.error('Error listing my assets:', error);
    res.status(500).json({ error: 'Failed to list my assets' });
  }
}

// GET /api/assets/stats
export async function showAssetStats(req, res) {
  try {
    // 1. Total Assets
    const totalResult = await pool.query(`
      SELECT COUNT(*)::int AS total FROM aset_ti WHERE deleted_at IS NULL
    `);
    const totalAssets = totalResult.rows[0]?.total || 0;

    // 2. By Status
    const statusResult = await pool.query(`
      SELECT status, COUNT(*)::int AS count
      FROM aset_ti
      WHERE deleted_at IS NULL
      GROUP BY status
    `);
    const byStatus = statusResult.rows.map((r) => ({ status: r.status, count: r.count }));

    // 3. By Type / Tipe
    const typeResult = await pool.query(`
      SELECT COALESCE(tipe_perangkat, 'Lainnya') AS type, COUNT(*)::int AS count
      FROM aset_ti
      WHERE deleted_at IS NULL
      GROUP BY tipe_perangkat
    `);
    const byType = typeResult.rows.map((r) => ({
      type: r.type,
      tipe: r.type,
      device_type: r.type,
      count: r.count,
    }));

    // 4. By Condition / Kondisi
    const conditionResult = await pool.query(`
      SELECT COALESCE(kondisi, 'Normal') AS condition, COUNT(*)::int AS count
      FROM aset_ti
      WHERE deleted_at IS NULL
      GROUP BY kondisi
    `);
    const byCondition = conditionResult.rows.map((r) => ({ condition: r.condition, count: r.count }));

    // 5. By Location
    const locationResult = await pool.query(`
      SELECT COALESCE(lokasi_asset, 'Belum ditentukan') AS location, COUNT(*)::int AS count
      FROM aset_ti
      WHERE deleted_at IS NULL
      GROUP BY lokasi_asset
    `);
    const byLocation = locationResult.rows.map((r) => ({ location: r.location, count: r.count }));

    // 6. Recent Assets (5 terbaru)
    const recentResult = await pool.query(`
      SELECT id AS id_aset, hostname AS label_aset, serial_number AS nomor_seri,
             tipe_perangkat, brand_merek AS merek, model, status AS status_aset,
             kondisi AS kondisi_aset, nama_karyawan_pemegang_asset AS nama_karyawan,
             departemen_pemegang_asset AS departemen, lokasi_asset AS lokasi_kerja,
             created_at AS dibuat_pada
      FROM aset_ti
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 5
    `);
    const recentAssets = recentResult.rows;

    // 7. Monthly Trend (6 bulan terakhir)
    const trendResult = await pool.query(`
      SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month,
        COUNT(*)::int AS count
      FROM aset_ti
      WHERE deleted_at IS NULL
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) ASC
      LIMIT 6
    `);
    const monthlyTrend = trendResult.rows;

    res.json({
      totalAssets,
      byStatus,
      byType,
      byCondition,
      byLocation,
      recentAssets,
      monthlyTrend,
    });
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

