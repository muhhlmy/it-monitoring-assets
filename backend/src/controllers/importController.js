import { pool, withTransaction } from "../config/database.js";

// Placeholder values yang tidak boleh dianggap sebagai identifier valid
const PLACEHOLDER_VALUES = new Set([
  "label placeholder", "asset placeholder", "placeholder", "xxxxx", "", null, undefined
]);

function isPlaceholderIdentifier(value) {
  if (!value || typeof value !== "string") return true;
  const lowerValue = value.toLowerCase().trim();
  return PLACEHOLDER_VALUES.has(lowerValue);
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function importExcelData(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File Excel tidak ditemukan." });
    }

    // Import exceljs untuk parsing Excel file
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    
    const worksheet = workbook.getWorksheet(1);
    const rows = worksheet.filterRows(row => row.getCell(1)?.value !== ""); // Filter empty rows
    
    let importedKaryawanCount = 0;
    let updatedKaryawanCount = 0;
    let createdUserCount = 0;
    let importedAssetCount = 0;
    let updatedAssetCount = 0;
    const warnings = [];

    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
      const row = worksheet.getRow(rowIndex);
      const cellNik = row.getCell("A").value;
      const cellNama = row.getCell("B").value;
      
      // Skip jika baris kosong atau header
      if (!cellNik && !cellNama) continue;

      const spName = `sp_row_${rowIndex}`;
      
      try {
        await withTransaction(async (client) => {
          // Create savepoint untuk setiap baris
          await client.query(`SAVEPOINT ${spName}`);

          // ========== IMPORT KARYAWAN ==========
          const nik = cleanText(cellNik);
          const nama = cleanText(cellNama);
          const email = cleanText(row.getCell("C").value) || `${nik?.toLowerCase()}@esb.co.id`;
          const lokasi = cleanText(row.getCell("D").value);
          const title = cleanText(row.getCell("E").value) || "User";
          const jobLevel = cleanText(row.getCell("F").value) || "S1";
          const departemen = cleanText(row.getCell("G").value);
          const direktorat = cleanText(row.getCell("H").value);
          const tanggalMulai = cleanText(row.getCell("I").value);
          const status = cleanText(row.getCell("J").value) || "Active";

          if (nik && nama) {
            const existingEmpRes = await client.query(
              `SELECT id FROM karyawan WHERE nik = $1`,
              [nik]
            );

            if (existingEmpRes.rows.length > 0) {
              // Update existing
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
              // Insert new
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
            const existingUserRes = await client.query(
              `SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`,
              [email]
            );
            
            if (existingUserRes.rows.length === 0) {
              const defaultPasswordHash = "$2b$10$defaultHashPlaceholder";
              await client.query(
                `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
                 VALUES ($1, $2, $3, 'user', '{}'::jsonb, true)`,
                [nama, email, defaultPasswordHash]
              );
              createdUserCount++;
            }
          }

          // ========== IMPORT ASET IT ==========
          const cellHostname = row.getCell("K").value;
          const cellSerial = row.getCell("L").value;
          const cellLabel = row.getCell("M").value;
          const cellSpesifikasi = row.getCell("N").value;
          const cellBrand = rowgetCell("O").value;
          const cellModel = row.getCell("P").value;
          const cellStatus = row.getCell("Q").value;
          const cellCondition = row.getCell("R").value;
          const cellNote = row.getCell("S").value;
          
          // Get employee ID for asset assignment
          const empIdResult = await client.query(
            `SELECT id FROM karyawan WHERE nik = $1`,
            [cleanText(cellNik)]
          );
          const empId = empIdResult.rows[0]?.id;

          const hostnameFinal = cleanText(cellHostname) || cleanText(cellSerial);
          const serialFinal = cleanText(cellSerial) || cleanText(cellHostname);
          const labelFinal = cleanText(cellLabel) || hostnameFinal;
          
          if (hostnameFinal) {
            const existingAssetRes = await client.query(
              `SELECT id FROM aset_ti WHERE hostname = $1 OR serial_number = $2 ORDER BY id ASC LIMIT 1`,
              [hostnameFinal, serialFinal]
            );
            
            if (existingAssetRes.rows.length > 0) {
              // Update existing
              await client.query(
                `UPDATE aset_ti SET
                  hostname = $2, serial_number = $3, spesifikasi = $4,
                  brand_merek = $5, model = $6, status = $7, kondisi = $8,
                  note_asset = $9, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [existingAssetRes.rows[0].id, hostnameFinal, serialFinal, cellSpesifikasi, 
                 cellBrand, cellModel, cellStatus, cellCondition, cellNote]
              );
              updatedAssetCount++;
            } else {
              // Insert new
              await client.query(
                `INSERT INTO aset_ti (hostname, serial_number, spesifikasi, nik_pemegang_asset,
                                      brand_merek, model, status, kondisi, note_asset)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [hostnameFinal, serialFinal, cellSpesifikasi, empId, cellBrand, cellModel, cellStatus, cellCondition, cellNote]
              );
              importedAssetCount++;
            }
          }
        }, spName);

      } catch (err) {
        await pool.query(`ROLLBACK TO SAVEPOINT ${spName}`);
        warnings.push(`Baris ${rowIndex} gagal: ${err.message}`);
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
