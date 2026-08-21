import { pool, withTransaction } from "../config/database.js";
import { normalizeLocation } from "../utils/locationNormalizer.js";

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireAuditActor(req) {
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
      [idAset, labelAset || `Aset OPS #${idAset}`, aksi, perubahan, olehPengguna || 'Sistem']
    );
  } catch (err) {
    console.error('Error recording OPS asset log:', err);
  }
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

function parseAmount(value) {
  if (value === undefined || value === null || value === '') return 0;
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

function normalizeOpsRecord(row) {
  if (!row) return null;
  const loc = row.lokasi ? normalizeLocation(row.lokasi) : '';
  return {
    ...row,
    id_aset: row.id,
    lokasi: loc,
    total_asset_amount: parseFloat(row.total_asset_amount || 0),
  };
}

export async function listOpsAssets(req, res) {
  try {
    const result = await pool.query(`
      SELECT id, hostname, nama_asset, kategori, lokasi, pic, tanggal_beli, total_asset_amount, kondisi, status, created_at, updated_at
      FROM aset_ops
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);

    const records = result.rows.map(normalizeOpsRecord);
    res.json(records);
  } catch (error) {
    console.error("Error listing OPS assets:", error);
    res.status(500).json({ error: "Gagal memuat daftar Aset OPS." });
  }
}

export async function fetchOpsAsset(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw createHttpError(400, "ID Aset OPS tidak valid.");

    const result = await pool.query(
      `SELECT * FROM aset_ops WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (result.rowCount === 0) throw createHttpError(404, "Aset OPS tidak ditemukan.");
    res.json(normalizeOpsRecord(result.rows[0]));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error("Error fetching OPS asset:", error);
    res.status(500).json({ error: "Gagal mengambil data Aset OPS." });
  }
}

export async function addOpsAsset(req, res) {
  try {
    const body = req.body || {};
    const hostname = cleanText(body.hostname);
    const namaAsset = cleanText(body.nama_asset || body.nama);
    const kategori = cleanText(body.kategori);
    const lokasi = normalizeLocation(cleanText(body.lokasi));
    const pic = cleanText(body.pic);
    const tanggalBeli = parseDate(body.tanggal_beli);
    const totalAssetAmount = parseAmount(body.total_asset_amount);
    const kondisi = cleanText(body.kondisi || body.kondisi_aset) || 'Baik';
    const status = cleanText(body.status || body.status_aset) || 'Aktif';

    if (!hostname) throw createHttpError(400, "Hostname wajib diisi.");
    if (!namaAsset) throw createHttpError(400, "Nama Asset wajib diisi.");
    if (!kategori) throw createHttpError(400, "Kategori wajib diisi.");
    if (!lokasi) throw createHttpError(400, "Lokasi wajib diisi.");

    const actor = requireAuditActor(req);

    const inserted = await withTransaction(async (client) => {
      const sql = `
        INSERT INTO aset_ops (hostname, nama_asset, kategori, lokasi, pic, tanggal_beli, total_asset_amount, kondisi, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;
      const resQuery = await client.query(sql, [
        hostname, namaAsset, kategori, lokasi, pic, tanggalBeli, totalAssetAmount, kondisi, status
      ]);
      const newAsset = resQuery.rows[0];

      await recordAssetLog(
        client,
        newAsset.id,
        `${newAsset.hostname} - ${newAsset.nama_asset}`,
        'TAMBAH',
        `Menambahkan Aset OPS baru: ${newAsset.nama_asset} (Kategori: ${newAsset.kategori}, Amount: ${newAsset.total_asset_amount}, Lokasi: ${newAsset.lokasi})`,
        actor
      );

      return newAsset;
    });

    res.status(201).json(normalizeOpsRecord(inserted));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ message: "Hostname Aset OPS sudah digunakan." });
    console.error("Error adding OPS asset:", error);
    res.status(500).json({ error: "Gagal menambahkan Aset OPS." });
  }
}

export async function replaceOpsAsset(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw createHttpError(400, "ID Aset OPS tidak valid.");

    const body = req.body || {};
    const hostname = cleanText(body.hostname);
    const namaAsset = cleanText(body.nama_asset || body.nama);
    const kategori = cleanText(body.kategori);
    const lokasi = normalizeLocation(cleanText(body.lokasi));
    const pic = cleanText(body.pic);
    const tanggalBeli = parseDate(body.tanggal_beli);
    const totalAssetAmount = parseAmount(body.total_asset_amount);
    const kondisi = cleanText(body.kondisi || body.kondisi_aset) || 'Baik';
    const status = cleanText(body.status || body.status_aset) || 'Aktif';

    if (!hostname) throw createHttpError(400, "Hostname wajib diisi.");
    if (!namaAsset) throw createHttpError(400, "Nama Asset wajib diisi.");
    if (!kategori) throw createHttpError(400, "Kategori wajib diisi.");
    if (!lokasi) throw createHttpError(400, "Lokasi wajib diisi.");

    const actor = requireAuditActor(req);

    const updated = await withTransaction(async (client) => {
      const existingRes = await client.query(
        `SELECT * FROM aset_ops WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id]
      );
      if (existingRes.rowCount === 0) throw createHttpError(404, "Aset OPS tidak ditemukan.");

      const oldAsset = existingRes.rows[0];

      const sql = `
        UPDATE aset_ops
        SET hostname = $2, nama_asset = $3, kategori = $4, lokasi = $5,
            pic = $6, tanggal_beli = $7, total_asset_amount = $8, kondisi = $9, status = $10,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *
      `;

      const resQuery = await client.query(sql, [
        id, hostname, namaAsset, kategori, lokasi, pic, tanggalBeli, totalAssetAmount, kondisi, status
      ]);

      const resAsset = resQuery.rows[0];

      await recordAssetLog(
        client,
        resAsset.id,
        `${resAsset.hostname} - ${resAsset.nama_asset}`,
        'UBAH',
        `Memperbarui Aset OPS #${id}: ${oldAsset.nama_asset} -> ${resAsset.nama_asset}`,
        actor
      );

      return resAsset;
    });

    res.json(normalizeOpsRecord(updated));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ message: "Hostname Aset OPS sudah digunakan." });
    console.error("Error updating OPS asset:", error);
    res.status(500).json({ error: "Gagal memperbarui Aset OPS." });
  }
}

export async function deleteOpsAsset(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw createHttpError(400, "ID Aset OPS tidak valid.");

    const actor = requireAuditActor(req);

    await withTransaction(async (client) => {
      const existingRes = await client.query(
        `SELECT * FROM aset_ops WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id]
      );
      if (existingRes.rowCount === 0) throw createHttpError(404, "Aset OPS tidak ditemukan.");

      const target = existingRes.rows[0];

      await client.query(
        `UPDATE aset_ops SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );

      await recordAssetLog(
        client,
        id,
        `${target.hostname} - ${target.nama_asset}`,
        'HAPUS',
        `Menghapus Aset OPS #${id} (${target.nama_asset})`,
        actor
      );
    });

    res.json({ message: "Aset OPS berhasil dihapus." });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error("Error deleting OPS asset:", error);
    res.status(500).json({ error: "Gagal menghapus Aset OPS." });
  }
}
