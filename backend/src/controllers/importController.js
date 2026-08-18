import crypto from 'node:crypto';
import { pool, withTransaction } from "../config/database.js";
import { hashPassword } from "../security/passwordService.js";

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (
    text === "" ||
    text === "-" ||
    text === "--" ||
    text === "---" ||
    text.toLowerCase() === "n/a" ||
    text.toLowerCase() === "null" ||
    text.toLowerCase() === "undefined" ||
    text.toLowerCase() === "none"
  ) {
    return null;
  }
  return text;
}

function extractNik(value) {
  const text = cleanText(value);
  if (!text) return null;

  // Format like "20140002 - Muhammad Helmy"
  if (text.includes(" - ")) {
    const nikPart = text.split(" - ")[0].trim();
    if (nikPart) return nikPart;
  }

  // Format like "20140002-Muhammad Helmy" (dash followed by letters)
  const dashIndex = text.search(/-\s*[A-Za-z]/);
  if (dashIndex > 0) {
    const nikPart = text.substring(0, dashIndex).trim();
    if (nikPart) return nikPart;
  }

  // Format like "20140002 (Muhammad Helmy)"
  const parenIndex = text.indexOf('(');
  if (parenIndex > 0) {
    const nikPart = text.substring(0, parenIndex).trim();
    if (nikPart) return nikPart;
  }

  return text;
}

function extractName(value) {
  const text = cleanText(value);
  if (!text) return null;
  if (text.includes(" - ")) {
    const parts = text.split(" - ");
    if (parts.length > 1 && parts[1].trim()) {
      return parts.slice(1).join(" - ").trim();
    }
  }
  return text;
}

const MONTH_MAP = {
  jan: '01', januari: '01', january: '01',
  feb: '02', februari: '02', february: '02',
  mar: '03', maret: '03', march: '03',
  apr: '04', april: '04',
  may: '05', mei: '05',
  jun: '06', juni: '06', june: '06',
  jul: '07', juli: '07', july: '07',
  aug: '08', agu: '08', agst: '08', agustus: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', okt: '10', oktober: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', des: '12', desember: '12', december: '12'
};

function normalizeDate(val) {
  if (val === undefined || val === null) return null;

  // JS Date object
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }

  // Excel Serial Number (e.g. 41904)
  if (typeof val === 'number' || (typeof val === 'string' && /^\d{5}(\.\d+)?$/.test(val.trim()))) {
    const num = Number(val);
    if (!isNaN(num) && num > 1000 && num < 100000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const dateObj = new Date(excelEpoch.getTime() + num * 86400 * 1000);
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toISOString().split('T')[0];
      }
    }
  }

  let str = cleanText(val);
  if (!str) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(str)) {
    const [y, m, d] = str.split(/[\/\-]/);
    const dateObj = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().split('T')[0];
    }
  }

  // DD-MMM-YY or DD-MMM-YYYY (e.g. "22-Sep-14", "22-Sep-2014")
  const mmmMatch = str.match(/^(\d{1,2})[\s\/\-\._]+([A-Za-z]+)[\s\/\-\._]+(\d{2,4})$/);
  if (mmmMatch) {
    const day = mmmMatch[1].padStart(2, '0');
    const monthStr = mmmMatch[2].toLowerCase();
    let year = mmmMatch[3];
    if (year.length === 2) {
      const yNum = Number(year);
      year = yNum >= 70 ? `19${year}` : `20${year}`;
    }
    const monthNum = MONTH_MAP[monthStr];
    if (monthNum) {
      return `${year}-${monthNum}-${day}`;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) {
      const yNum = Number(year);
      year = yNum >= 70 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  // Fallback Date.parse
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    return d.toISOString().split('T')[0];
  }

  return null;
}

function normalizeStatus(val, defaultVal = 'Active') {
  const cleaned = cleanText(val);
  if (!cleaned) return defaultVal;
  const lower = cleaned.toLowerCase();
  if (lower === 'active' || lower === 'aktif') return 'Active';
  if (lower === 'outsource' || lower === 'outsourcing') return 'Outsource';
  if (lower === 'resigned' || lower === 'resign' || lower === 'non-aktif' || lower === 'non aktif') return 'Resigned';
  return defaultVal;
}

function normalizeEmploymentStatus(val, defaultVal = 'Permanent') {
  const cleaned = cleanText(val);
  if (!cleaned) return defaultVal;
  const lower = cleaned.toLowerCase();
  if (lower.includes('permanent') || lower.includes('tetap') || lower.includes('pkwtt')) return 'Permanent';
  if (lower.includes('contract') || lower.includes('kontrak') || lower.includes('pkwt')) return 'Contract';
  if (lower.includes('freelance') || lower.includes('freelancer')) return 'Freelance';
  if (lower.includes('intern') || lower.includes('magang')) return 'Intern';
  return defaultVal;
}

function normalizeAssetStatus(val, defaultVal = 'In Use') {
  const cleaned = cleanText(val);
  if (!cleaned) return defaultVal;
  const lower = cleaned.toLowerCase();
  if (lower.includes('use') || lower.includes('pakai') || lower.includes('digunakan')) return 'In Use';
  if (lower.includes('stock') || lower.includes('stok') || lower.includes('tersedia')) return 'Stock';
  if (lower.includes('damaged') || lower.includes('rusak')) return 'Damaged';
  if (lower.includes('service') || lower.includes('perbaikan')) return 'In Service';
  if (lower.includes('disposal') || lower.includes('afkir')) return 'Disposal';
  return defaultVal;
}

function normalizeAssetKondisi(val, defaultVal = 'Normal') {
  const cleaned = cleanText(val);
  if (!cleaned) return defaultVal;
  const lower = cleaned.toLowerCase();
  if (lower.includes('baru') || lower.includes('new')) return 'Baru';
  if (lower.includes('normal') || lower.includes('baik') || lower.includes('good')) return 'Normal';
  if (lower.includes('rusak ringan') || lower.includes('ringan')) return 'Rusak Ringan';
  if (lower.includes('rusak sedang') || lower.includes('sedang')) return 'Rusak Sedang';
  if (lower.includes('rusak berat') || lower.includes('berat')) return 'Rusak Berat';
  return defaultVal;
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
      const nikRaw = getPropCaseInsensitive(row, ['NIK', 'nik', 'nomor_induk']);
      const nik = extractNik(nikRaw);
      const nama = getPropCaseInsensitive(row, ['Nama Karyawan', 'Nama', 'nama_karyawan', 'nama']);
      const emailRaw = getPropCaseInsensitive(row, ['Email Kantor', 'Email', 'email_kantor', 'email']);
      const email = emailRaw || (nik ? `${nik.toLowerCase()}@esb.co.id` : null);
      const lokasi = getPropCaseInsensitive(row, ['Lokasi Kerja', 'Lokasi', 'lokasi_kerja', 'lokasi']);
      const title = getPropCaseInsensitive(row, ['Title', 'Jabatan', 'title']) || 'User';
      const jobLevel = getPropCaseInsensitive(row, ['Job Level', 'Level', 'job_level']) || 'S1';
      const departemen = getPropCaseInsensitive(row, ['Departemen', 'Department', 'departemen']);
      const direktorat = getPropCaseInsensitive(row, ['Directorate', 'Direktorat', 'directorate']);
      
      const tglMulaiRaw = getPropCaseInsensitive(row, ['Tanggal Mulai Bekerja', 'Tanggal Mulai', 'tanggal_mulai_bekerja']);
      const tanggalMulai = normalizeDate(tglMulaiRaw) || new Date().toISOString().split('T')[0];

      const empStatusRaw = getPropCaseInsensitive(row, ['Employeement Status', 'Status Kepegawaian', 'employeement_status', 'status_kepegawaian']);
      const employeementStatus = normalizeEmploymentStatus(empStatusRaw);

      const nikAtasanRaw = getPropCaseInsensitive(row, ['NIK Atasan Langsung', 'NIK Atasan', 'nik_atasan_langsung', 'nik_atasan']);
      const nikAtasan = extractNik(nikAtasanRaw);

      const statusRaw = getPropCaseInsensitive(row, ['Status', 'status']);
      const status = normalizeStatus(statusRaw);

      if (!nik || !nama) continue;

      try {
        await withTransaction(async (client) => {
          const existingEmpRes = await client.query(`SELECT id FROM karyawan WHERE nik = $1`, [nik]);

          if (existingEmpRes.rows.length > 0) {
            await client.query(
              `UPDATE karyawan SET
                nama_karyawan = $2, email_kantor = $3, lokasi_kerja = $4,
                title = $5, job_level = $6, departemen = $7, directorate = $8,
                status = $9, employeement_status = $10, nik_atasan_langsung = $11,
                tanggal_mulai_bekerja = COALESCE($12, tanggal_mulai_bekerja),
                updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [existingEmpRes.rows[0].id, nama, email, lokasi, title, jobLevel, departemen, direktorat, status, employeementStatus, nikAtasan, tanggalMulai]
            );
            updatedKaryawanCount++;
          } else {
            await client.query(
              `INSERT INTO karyawan (nik, nama_karyawan, email_kantor, lokasi_kerja, 
                                     title, job_level, departemen, directorate, status,
                                     tanggal_mulai_bekerja, employeement_status, nik_atasan_langsung)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [nik, nama, email, lokasi, title, jobLevel, departemen, direktorat, status, tanggalMulai, employeementStatus, nikAtasan]
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
      
      const nikPemegangRaw = getPropCaseInsensitive(row, ['NIK Pemegang', 'NIK Pemegang Asset', 'NIK', 'nik_pemegang_asset', 'nik']);
      const nikPemegang = extractNik(nikPemegangRaw);
      
      const namaPemegangRaw = getPropCaseInsensitive(row, ['Nama Karyawan Pemegang', 'Nama Karyawan', 'nama_karyawan_pemegang_asset', 'nama_karyawan']);
      const namaPemegang = extractName(namaPemegangRaw);
      const deptPemegang = getPropCaseInsensitive(row, ['Departemen Pemegang', 'Departemen', 'departemen_pemegang_asset', 'departemen']);
      const lokasiAset = getPropCaseInsensitive(row, ['Lokasi Aset', 'Lokasi', 'lokasi_asset', 'lokasi_kerja']);
      const tipePerangkat = getPropCaseInsensitive(row, ['Tipe Perangkat', 'Tipe', 'tipe_perangkat']) || 'Laptop';
      const brandMerek = getPropCaseInsensitive(row, ['Brand/Merek', 'Merek', 'Brand', 'brand_merek']);
      const model = getPropCaseInsensitive(row, ['Model', 'model']);

      const statusRaw = getPropCaseInsensitive(row, ['Status', 'status']);
      const status = normalizeAssetStatus(statusRaw);

      const kondisiRaw = getPropCaseInsensitive(row, ['Kondisi', 'kondisi']);
      const kondisi = normalizeAssetKondisi(kondisiRaw);

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

