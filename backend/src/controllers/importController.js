import { withTransaction } from '../config/database.js'
import { hashPassword } from '../security/passwordService.js'

function truncate(val, maxLen) {
  if (val == null) return null
  const str = String(val).trim()
  return str.length > maxLen ? str.slice(0, maxLen) : str
}

export async function importExcelData(req, res) {
  try {
    const { karyawanRows = [], assetRows = [] } = req.body || {}

    if (!Array.isArray(karyawanRows) && !Array.isArray(assetRows)) {
      return res.status(400).json({ error: 'Payload data import tidak valid.' })
    }

    if (karyawanRows.length === 0 && assetRows.length === 0) {
      return res.status(400).json({ error: 'Tidak ada baris data Karyawan atau Aset untuk diimpor.' })
    }

    const defaultHashedPassword = await hashPassword('Password123!')

    const result = await withTransaction(async (client) => {
      let importedKaryawanCount = 0
      let updatedKaryawanCount = 0
      let createdUserCount = 0

      let importedAssetCount = 0
      let updatedAssetCount = 0

      const warnings = []

      // ── STEP 1: IMPORT KARYAWAN ───────────────────────────────────────────
      for (const row of karyawanRows) {
        if (!row || typeof row !== 'object') continue

        // Map excel keys to column names with safe length truncation
        const nikRaw = String(row.NIK || row.nik || '').trim()
        const namaRaw = String(row['Nama Karyawan'] || row.nama_karyawan || row.nama || '').trim()

        if (!nikRaw || !namaRaw) {
          if (nikRaw || namaRaw) {
            warnings.push(`Baris Karyawan diabaikan: NIK (${nikRaw || 'kosong'}) dan Nama (${namaRaw || 'kosong'}) wajib diisi.`)
          }
          continue
        }

        const nik = truncate(nikRaw, 30)
        const nama = truncate(namaRaw, 150)
        const email = truncate(String(row['Email Kantor'] || row.email_kantor || row.email || `${nikRaw}@esb.co.id`).trim().toLowerCase(), 150)
        const status = truncate(String(row.Status || row.status_karyawan || 'Active').trim(), 30)
        const jabatan = truncate(String(row.Title || row.jabatan || '').trim(), 255)
        const tingkat = truncate(String(row['Job Level'] || row.tingkat_jabatan || '').trim(), 50)
        const departemen = truncate(String(row.Departemen || row.departemen || '').trim(), 100)
        const direktorat = truncate(String(row.Directorate || row.direktorat || '').trim(), 100)
        const lokasi = truncate(String(row['Lokasi Kerja'] || row.lokasi_kerja || row.lokasi || '').trim(), 100)
        const statusKepegawaian = truncate(String(row['Employeement Status'] || row.status_kepegawaian || '').trim(), 50)

        // Upsert Karyawan
        const existingEmpRes = await client.query(
          `SELECT id_karyawan FROM karyawan WHERE nik = $1`,
          [nik]
        )

        let empId
        if (existingEmpRes.rows.length > 0) {
          empId = existingEmpRes.rows[0].id_karyawan
          await client.query(
            `UPDATE karyawan
                SET nama_karyawan = $1, email_kantor = $2, departemen = $3, lokasi_kerja = $4,
                    status_karyawan = $5, jabatan = $6, tingkat_jabatan = $7, direktorat = $8,
                    status_kepegawaian = $9
              WHERE id_karyawan = $10`,
            [nama, email, departemen, lokasi, status, jabatan, tingkat, direktorat, statusKepegawaian, empId]
          )
          updatedKaryawanCount++
        } else {
          const insertRes = await client.query(
            `INSERT INTO karyawan (
               nik, nama_karyawan, email_kantor, departemen, lokasi_kerja,
               status_karyawan, jabatan, tingkat_jabatan, direktorat, status_kepegawaian
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id_karyawan`,
            [nik, nama, email, departemen, lokasi, status, jabatan, tingkat, direktorat, statusKepegawaian]
          )
          empId = insertRes.rows[0].id_karyawan
          importedKaryawanCount++
        }

        // Provision default User account if absent
        if (email) {
          const existingUser = await client.query(
            `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
            [email]
          )
          if (existingUser.rows.length === 0) {
            await client.query(
              `INSERT INTO users (nama, email, password, role, is_active)
               VALUES ($1, $2, $3, 'user', true)`,
              [nama, email, defaultHashedPassword]
            )
            createdUserCount++
          }
        }
      }

      // Build NIK to ID mapping for Asset assignment
      const allEmpsRes = await client.query(`SELECT id_karyawan, nik FROM karyawan`)
      const nikToIdMap = new Map()
      allEmpsRes.rows.forEach(r => nikToIdMap.set(String(r.nik).trim(), r.id_karyawan))

      // ── STEP 2: IMPORT ASSETS ─────────────────────────────────────────────
      for (const row of assetRows) {
        if (!row || typeof row !== 'object') continue

        const label = String(row['Label Aset'] || row.label_aset || row['Label Asset'] || '').trim()
        const serial = String(row['Serial Number'] || row.nomor_seri || row['Nomor Seri'] || '').trim()

        if (!label && !serial) {
          continue
        }

        const labelFinal = truncate(label || `ASET-${serial}`, 100)
        const serialFinal = truncate(serial, 100)
        const spesifikasi = String(row.Spesifikasi || row.spesifikasi || '').trim()
        const nikAssigned = String(row.NIK || row.nik || '').trim()
        const lokasi = truncate(String(row.Lokasi || row.lokasi_aset || row['Lokasi Aset'] || '').trim(), 100)
        const tipe = truncate(String(row['Tipe Perangkat'] || row.tipe_perangkat || row.Tipe || 'Laptop').trim(), 50)
        const merek = truncate(String(row['Brand/Merek'] || row.merek || row.Brand || '').trim(), 100)
        const model = truncate(String(row.Model || row.model || '').trim(), 100)
        const statusRaw = String(row.Status || row.status_aset || 'Stock').trim()
        const rawKondisi = String(row.Kondisi || row.kondisi_aset || 'Baik').trim()
        let catatan = String(row['Note Asset'] || row.catatan_aset || row.Catatan || '').trim()

        // If condition text exceeds VARCHAR(30), store full text in catatan_aset and truncate kondisi_aset
        let kondisi = rawKondisi
        if (rawKondisi.length > 30) {
          if (!catatan.includes(rawKondisi)) {
            catatan = catatan ? `${catatan} | Kondisi: ${rawKondisi}` : rawKondisi
          }
          kondisi = truncate(rawKondisi, 30)
        }

        // Normalize status
        let statusFinal = 'Stock'
        if (statusRaw.toLowerCase().includes('use') || (nikAssigned && nikAssigned !== '—' && nikAssigned !== '-')) statusFinal = 'In Use'
        else if (statusRaw.toLowerCase().includes('damaged') || statusRaw.toLowerCase().includes('rusak')) statusFinal = 'Damaged'
        else if (statusRaw.toLowerCase().includes('service')) statusFinal = 'Need Service'
        statusFinal = truncate(statusFinal, 30)

        const empId = (nikAssigned && nikAssigned !== '—' && nikAssigned !== '-') ? nikToIdMap.get(nikAssigned) || null : null

        // Check existing by serial or label
        let existingAssetRes
        if (serialFinal) {
          existingAssetRes = await client.query(
            `SELECT id_aset FROM aset_ti WHERE nomor_seri = $1 OR label_aset = $2`,
            [serialFinal, labelFinal]
          )
        } else {
          existingAssetRes = await client.query(
            `SELECT id_aset FROM aset_ti WHERE label_aset = $1`,
            [labelFinal]
          )
        }

        if (existingAssetRes.rows.length > 0) {
          const assetId = existingAssetRes.rows[0].id_aset
          await client.query(
            `UPDATE aset_ti
                SET label_aset = $1, nomor_seri = $2, spesifikasi = $3, lokasi_aset = $4,
                    tipe_perangkat = $5, merek = $6, model = $7, status_aset = $8,
                    kondisi_aset = $9, catatan_aset = $10, id_karyawan = $11
              WHERE id_aset = $12`,
            [labelFinal, serialFinal || null, spesifikasi, lokasi, tipe, merek, model, statusFinal, kondisi, catatan, empId, assetId]
          )
          updatedAssetCount++
        } else {
          await client.query(
            `INSERT INTO aset_ti (
               label_aset, nomor_seri, spesifikasi, lokasi_aset, tipe_perangkat,
               merek, model, status_aset, kondisi_aset, catatan_aset, id_karyawan
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [labelFinal, serialFinal || null, spesifikasi, lokasi, tipe, merek, model, statusFinal, kondisi, catatan, empId]
          )
          importedAssetCount++
        }
      }

      return {
        importedKaryawanCount,
        updatedKaryawanCount,
        createdUserCount,
        importedAssetCount,
        updatedAssetCount,
        warnings,
      }
    })

    const totalKaryawan = result.importedKaryawanCount + result.updatedKaryawanCount
    const totalAssets = result.importedAssetCount + result.updatedAssetCount

    return res.json({
      success: true,
      message: `Proses import sukses! ${totalKaryawan} Karyawan dan ${totalAssets} Aset IT berhasil diproses.`,
      details: result,
    })
  } catch (error) {
    console.error('[ImportExcel Error]', error)
    return res.status(500).json({ error: error.message || 'Gagal memproses import data Excel.' })
  }
}
