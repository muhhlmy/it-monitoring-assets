import { pool, withTransaction } from "../config/database.js";
import { normalizeLocation } from "../utils/locationNormalizer.js";
import { canReadGAAsset, canWriteGAAsset } from "../security/resourceAuthorizationPolicy.js";
import { parsePaginationQuery, setPaginationHeaders } from "../security/requestValidation.js";

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
      [idAset, labelAset || `Aset GA #${idAset}`, aksi, perubahan, olehPengguna || 'Sistem']
    );
  } catch (err) {
    console.error('Error recording GA asset log:', err);
  }
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

function parseQuantity(value) {
  const qty = parseInt(value, 10);
  return isNaN(qty) || qty <= 0 ? null : qty;
}

function normalizeGaRecord(row) {
  if (!row) return null;
  const loc = row.lokasi ? normalizeLocation(row.lokasi) : '';
  return {
    ...row,
    id_aset: row.id,
    lokasi: loc,
  };
}

export async function listGaAssets(req, res) {
  try {
    const { page, limit, offset } = parsePaginationQuery(req.query)

    const countRes = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM aset_ga
      WHERE deleted_at IS NULL
    `)
    const totalCount = countRes.rows[0]?.count || 0

    const result = await pool.query(
      `SELECT id, hostname, quantity, tipe_fasilitas, nama_asset, ukuran, detail, lokasi, lokasi_detail, kondisi, created_at, updated_at
       FROM aset_ga
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    const records = result.rows.map(normalizeGaRecord)
    setPaginationHeaders(res, totalCount, page, limit)
    res.json(records)
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ error: error.message })
    }
    console.error("Error listing GA assets:", error)
    res.status(500).json({ error: "Gagal memuat daftar Aset GA." })
  }
}

export async function fetchGaAsset(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw createHttpError(400, "ID Aset GA tidak valid.");

    const result = await pool.query(
      `SELECT * FROM aset_ga WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (result.rowCount === 0) throw createHttpError(404, "Aset GA tidak ditemukan.");
    const assetRecord = result.rows[0];

    if (!canReadGAAsset(req.user, assetRecord)) {
      return res.status(403).json({ error: "Anda tidak memiliki akses ke Aset GA ini." });
    }

    res.json(normalizeGaRecord(assetRecord));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error("Error fetching GA asset:", error);
    res.status(500).json({ error: "Gagal mengambil data Aset GA." });
  }
}

export async function addGaAsset(req, res) {
  try {
    const body = req.body || {};
    const hostname = cleanText(body.hostname);
    const quantity = parseQuantity(body.quantity);
    const tipeFasilitas = cleanText(body.tipe_fasilitas);
    const namaAsset = cleanText(body.nama_asset || body.nama);
    const ukuran = cleanText(body.ukuran);
    const detail = cleanText(body.detail);
    const lokasi = normalizeLocation(cleanText(body.lokasi));
    const lokasiDetail = cleanText(body.lokasi_detail);
    const kondisi = cleanText(body.kondisi || body.kondisi_aset) || 'Baik';

    if (!hostname) throw createHttpError(400, "Hostname wajib diisi.");
    if (!quantity) throw createHttpError(400, "Quantity harus berupa angka lebih dari 0.");
    if (!tipeFasilitas) throw createHttpError(400, "Tipe Fasilitas wajib diisi.");
    if (!namaAsset) throw createHttpError(400, "Nama Asset wajib diisi.");
    if (!lokasi) throw createHttpError(400, "Lokasi wajib diisi.");

    const actor = requireAuditActor(req);

    const inserted = await withTransaction(async (client) => {
      const sql = `
        INSERT INTO aset_ga (hostname, quantity, tipe_fasilitas, nama_asset, ukuran, detail, lokasi, lokasi_detail, kondisi)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;
      const resQuery = await client.query(sql, [
        hostname, quantity, tipeFasilitas, namaAsset, ukuran, detail, lokasi, lokasiDetail, kondisi
      ]);
      const newAsset = resQuery.rows[0];

      await recordAssetLog(
        client,
        newAsset.id,
        `${newAsset.hostname} - ${newAsset.nama_asset}`,
        'TAMBAH',
        `Menambahkan Aset GA baru: ${newAsset.nama_asset} (Qty: ${newAsset.quantity}, Tipe: ${newAsset.tipe_fasilitas}, Lokasi: ${newAsset.lokasi})`,
        actor
      );

      return newAsset;
    });

    res.status(201).json(normalizeGaRecord(inserted));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ message: "Hostname Aset GA sudah digunakan." });
    console.error("Error adding GA asset:", error);
    res.status(500).json({ error: "Gagal menambahkan Aset GA." });
  }
}

export async function replaceGaAsset(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw createHttpError(400, "ID Aset GA tidak valid.");

    if (!canWriteGAAsset(req.user, null)) {
      return res.status(403).json({ error: "Anda tidak memiliki akses untuk mengubah Aset GA." });
    }

    const body = req.body || {};
    const hostname = cleanText(body.hostname);
    const quantity = parseQuantity(body.quantity);
    const tipeFasilitas = cleanText(body.tipe_fasilitas);
    const namaAsset = cleanText(body.nama_asset || body.nama);
    const ukuran = cleanText(body.ukuran);
    const detail = cleanText(body.detail);
    const lokasi = normalizeLocation(cleanText(body.lokasi));
    const lokasiDetail = cleanText(body.lokasi_detail);
    const kondisi = cleanText(body.kondisi || body.kondisi_aset) || 'Baik';

    if (!hostname) throw createHttpError(400, "Hostname wajib diisi.");
    if (!quantity) throw createHttpError(400, "Quantity harus berupa angka lebih dari 0.");
    if (!tipeFasilitas) throw createHttpError(400, "Tipe Fasilitas wajib diisi.");
    if (!namaAsset) throw createHttpError(400, "Nama Asset wajib diisi.");
    if (!lokasi) throw createHttpError(400, "Lokasi wajib diisi.");

    const actor = requireAuditActor(req);

    const updated = await withTransaction(async (client) => {
      const existingRes = await client.query(
        `SELECT * FROM aset_ga WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id]
      );
      if (existingRes.rowCount === 0) throw createHttpError(404, "Aset GA tidak ditemukan.");

      const oldAsset = existingRes.rows[0];

      const sql = `
        UPDATE aset_ga
        SET hostname = $2, quantity = $3, tipe_fasilitas = $4, nama_asset = $5,
            ukuran = $6, detail = $7, lokasi = $8, lokasi_detail = $9, kondisi = $10,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *
      `;

      const resQuery = await client.query(sql, [
        id, hostname, quantity, tipeFasilitas, namaAsset, ukuran, detail, lokasi, lokasiDetail, kondisi
      ]);

      const resAsset = resQuery.rows[0];

      await recordAssetLog(
        client,
        resAsset.id,
        `${resAsset.hostname} - ${resAsset.nama_asset}`,
        'UBAH',
        `Memperbarui Aset GA #${id}: ${oldAsset.nama_asset} -> ${resAsset.nama_asset}`,
        actor
      );

      return resAsset;
    });

    res.json(normalizeGaRecord(updated));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ message: "Hostname Aset GA sudah digunakan." });
    console.error("Error updating GA asset:", error);
    res.status(500).json({ error: "Gagal memperbarui Aset GA." });
  }
}

export async function deleteGaAsset(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) throw createHttpError(400, "ID Aset GA tidak valid.");

    if (!canWriteGAAsset(req.user, null)) {
      return res.status(403).json({ error: "Anda tidak memiliki akses untuk menghapus Aset GA." });
    }

    const actor = requireAuditActor(req);

    await withTransaction(async (client) => {
      const existingRes = await client.query(
        `SELECT * FROM aset_ga WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id]
      );
      if (existingRes.rowCount === 0) throw createHttpError(404, "Aset GA tidak ditemukan.");

      const target = existingRes.rows[0];

      await client.query(
        `UPDATE aset_ga SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );

      await recordAssetLog(
        client,
        id,
        `${target.hostname} - ${target.nama_asset}`,
        'HAPUS',
        `Menghapus Aset GA #${id} (${target.nama_asset})`,
        actor
      );
    });

    res.json({ message: "Aset GA berhasil dihapus." });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error("Error deleting GA asset:", error);
    res.status(500).json({ error: "Gagal menghapus Aset GA." });
  }
}
