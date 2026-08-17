import crypto from 'node:crypto';
import { pool, withTransaction } from "../config/database.js";
import { hashPassword } from "../security/passwordService.js";

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function getPropCaseInsensitive(row, keys) {
  if (!row || typeof row !== 'object') return null;
  const rowKeys = Object.keys(row);
  for (const key of keys) {
    const foundKey = rowKeys.find(k => k.trim().toLowerCase() === key.toLowerCase());
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
      const val = cleanText(row[foundKey]);
      if (val !== null) return val;
    }
  }
  return null;
}

export async function importExcelData(req, res) {
  try {
    let karyawanRows = req.body?.karyawanRows || [];
    let assetRows = req.body?.assetRows || [];

    let importedKaryawanCount = 0;
    let updatedKaryawanCount = 0;
    let createdUserCount = 0;
    let importedAssetCount = 0;
    let updatedAssetCount = 0;
    const warnings = [];

    // Process Karyawan Rows
    for (let i = 0; i < karyawanRows.length; i++) {
      const row = karyawanRows[i];
      const nik = getPropCaseInsensitive(row, ['NIK', 'nik', 'nomor_induk']);
      const nama = getPropCaseInsensitive(row, ['Nama Karyawan', 'Nama', 'nama_karyawan', 'nama']);
      const email = getPropCaseInsensitive(row, ['Email Kantor', 'Email', 'email_kantor', 'email']) || (nik ? `${nik.toLowerCase()}@esb.co.id` : null);
      const lokasi = getPropCaseInsensitive(row, ['Lokasi Kerja', 'Lokasi', 'lokasi_kerja', 'lokasi']);
      const title = getPropCaseInsensitive(row, ['Title', 'Jabatan', 'title']) || 'User';
      const jobLevel = getPropCaseInsensitive(row, ['Job Level', 'Level', 'job_level']) || 'S1';
      const departemen = getPropCaseInsensitive(row, ['Departemen', 'Department', 'departemen']);
      const direktorat = getPropCaseInsensitive(row, ['Directorate', 'Direktorat', 'directorate']);
      const tanggalMulai = getPropCaseInsensitive(row, ['Tanggal Mulai Bekerja', 'Tanggal Mulai', 'tanggal_mulai_bekerja']) || new Date().toISOString().split('T')[0];
      const status = getPropCaseInsensitive(row, ['Status', 'status']) || 'Active';

      if (!nik || !nama) continue;

      try {
        await withTransaction(async (client) => {
          const existingEmpRes = await client.query(`SELECT id FROM karyawan WHERE nik = $1`, [nik]);

          if (existingEmpRes.rows.length > 0) {
            await client.query(
              `UPDATE karyawan SET
                nama_karyawan = $2, email_kantor = $3, lokasi_kerja = $4,
                title = $5, job_level = $6, departemen = $7, directorate = $8,
                status = $9, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [existingEmpRes.rows[0].id, nama, email, lokasi, title, jobLevel, departemen, direktorat, status]
            );
            updatedKaryawanCount++;
          } else {
            await client.query(
              `INSERT INTO karyawan (nik, nama_karyawan, email_kantor, lokasi_kerja, 
                                     title, job_level, departemen, directorate, status,
                                     tanggal_mulai_bekerja, employeement_status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Permanent')`,
              [nik, nama, email, lokasi, title, jobLevel, departemen, direktorat, status, tanggalMulai]
            );
            importedKaryawanCount++;
          }

          // Auto-create user account if not exists
          if (email) {
            const existingUserRes = await client.query(
              `SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`,
              [email]
            );
            if (existingUserRes.rows.length === 0) {
              const randomTempPassword = crypto.randomBytes(16).toString('hex');
              const defaultPasswordHash = await hashPassword(randomTempPassword);
              await client.query(
                `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
                 VALUES ($1, $2, $3, 'user', '{}'::jsonb, true)`,
                [nama, email, defaultPasswordHash]
              );
              createdUserCount++;
            }
          }
        });
      } catch (err) {
        warnings.push(`Karyawan ${nik} (${nama}) gagal: ${err.message}`);
      }
    }

    // Process Asset Rows
    for (let i = 0; i < assetRows.length; i++) {
      const row = assetRows[i];
      const hostname = getPropCaseInsensitive(row, ['Hostname', 'Label Aset', 'Label', 'hostname', 'label_aset']);
      const serialNumber = getPropCaseInsensitive(row, ['Serial Number', 'Serial', 'SN', 'serial_number', 'nomor_seri']);
      const spesifikasi = getPropCaseInsensitive(row, ['Spesifikasi', 'Spec', 'spesifikasi']);
      const nikPemegang = getPropCaseInsensitive(row, ['NIK Pemegang', 'NIK', 'nik_pemegang_asset', 'nik']);
      const namaPemegang = getPropCaseInsensitive(row, ['Nama Karyawan Pemegang', 'Nama Karyawan', 'nama_karyawan_pemegang_asset', 'nama_karyawan']);
      const deptPemegang = getPropCaseInsensitive(row, ['Departemen Pemegang', 'Departemen', 'departemen_pemegang_asset', 'departemen']);
      const lokasiAset = getPropCaseInsensitive(row, ['Lokasi Aset', 'Lokasi', 'lokasi_asset', 'lokasi_kerja']);
      const tipePerangkat = getPropCaseInsensitive(row, ['Tipe Perangkat', 'Tipe', 'tipe_perangkat']) || 'Laptop';
      const brandMerek = getPropCaseInsensitive(row, ['Brand/Merek', 'Merek', 'Brand', 'brand_merek']);
      const model = getPropCaseInsensitive(row, ['Model', 'model']);
      const status = getPropCaseInsensitive(row, ['Status', 'status']) || 'In Use';
      const kondisi = getPropCaseInsensitive(row, ['Kondisi', 'kondisi']) || 'Normal';
      const noteAsset = getPropCaseInsensitive(row, ['Note Asset', 'Catatan', 'note_asset']);

      const hostnameFinal = hostname || serialNumber;
      const serialFinal = serialNumber || hostname;

      if (!hostnameFinal && !serialFinal) continue;

      try {
        await withTransaction(async (client) => {
          // Verify employee info if NIK provided
          let resolvedNama = namaPemegang;
          let resolvedDept = deptPemegang;
          let resolvedLokasi = lokasiAset;

          if (nikPemegang) {
            const empRes = await client.query(`SELECT nama_karyawan, departemen, lokasi_kerja FROM karyawan WHERE nik = $1`, [nikPemegang]);
            if (empRes.rows.length > 0) {
              resolvedNama = empRes.rows[0].nama_karyawan;
              resolvedDept = empRes.rows[0].departemen;
              if (!resolvedLokasi) resolvedLokasi = empRes.rows[0].lokasi_kerja;
            }
          }

          const existingAssetRes = await client.query(
            `SELECT id FROM aset_ti WHERE (hostname = $1 OR serial_number = $2) AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
            [hostnameFinal, serialFinal]
          );

          if (existingAssetRes.rows.length > 0) {
            await client.query(
              `UPDATE aset_ti SET
                hostname = $2, serial_number = $3, spesifikasi = $4, nik_pemegang_asset = $5,
                nama_karyawan_pemegang_asset = $6, departemen_pemegang_asset = $7, lokasi_asset = $8,
                tipe_perangkat = $9, brand_merek = $10, model = $11, status = $12, kondisi = $13,
                note_asset = $14, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [existingAssetRes.rows[0].id, hostnameFinal, serialFinal, spesifikasi, nikPemegang,
               resolvedNama, resolvedDept, resolvedLokasi, tipePerangkat, brandMerek, model,
               status, kondisi, noteAsset]
            );
            updatedAssetCount++;
          } else {
            await client.query(
              `INSERT INTO aset_ti (hostname, serial_number, spesifikasi, nik_pemegang_asset,
                                    nama_karyawan_pemegang_asset, departemen_pemegang_asset, lokasi_asset,
                                    tipe_perangkat, brand_merek, model, status, kondisi, note_asset)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
              [hostnameFinal, serialFinal, spesifikasi, nikPemegang,
               resolvedNama, resolvedDept, resolvedLokasi, tipePerangkat, brandMerek, model,
               status, kondisi, noteAsset]
            );
            importedAssetCount++;
          }
        });
      } catch (err) {
        warnings.push(`Aset ${hostnameFinal} (${serialFinal}) gagal: ${err.message}`);
      }
    }

    const totalKaryawan = importedKaryawanCount + updatedKaryawanCount;
    const totalAssets = importedAssetCount + updatedAssetCount;

    res.json({
      success: true,
      message: `Proses import sukses! ${totalKaryawan} Karyawan dan ${totalAssets} Aset IT berhasil diproses.`,
      details: {
        importedKaryawanCount,
        updatedKaryawanCount,
        createdUserCount,
        importedAssetCount,
        updatedAssetCount,
        warnings,
      },
    });

  } catch (error) {
    console.error('[Import Excel Error]', error);
    res.status(500).json({ error: error.message || 'Gagal memproses import data Excel.' });
  }
}
