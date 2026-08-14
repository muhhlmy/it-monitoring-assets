import { withTransaction } from '../config/database.js'
import { hashPassword } from '../security/passwordService.js'

function truncate(val, maxLen) {
  if (val == null) return null
  const str = String(val).trim()
  return str.length > maxLen ? str.slice(0, maxLen) : str
}

function isPlaceholderIdentifier(val) {
  if (val == null) return true
  const s = String(val).trim().toLowerCase()
  return (
    !s ||
    s === '-' ||
    s === '—' ||
    s === '--' ||
    s === '---' ||
    s === 'n/a' ||
    s === 'none' ||
    s === 'unidentified' ||
    s === 'null' ||
    s === 'undefined' ||
    s === 'tidak ada' ||
    s === 'kosong'
  )
}

function normalizeLocation(val) {
  if (!val) return ''
  const str = String(val).trim()
  const lower = str.toLowerCase()

  if ((lower.includes('gading') || lower.includes('garding') || lower.includes('gs')) &&
      (lower.includes('pluit') || lower.includes('pl'))) {
    return 'GS / PL'
  }

  if (lower.includes('gading') || lower.includes('garding') || lower === 'gs' || lower.includes('serpong')) return 'GS'
  if (lower.includes('pluit') || lower === 'pl' || lower === 'plt') return 'PL'
  if (lower.includes('jakarta') || lower === 'jkt') return 'JKT'
  if (lower.includes('bekasi') || lower === 'bks') return 'BKS'
  if (lower.includes('depok') || lower === 'dpk') return 'DPK'
  if (lower.includes('bogor') || lower === 'bgr') return 'BGR'
  if (lower.includes('tangerang') || lower === 'tgr') return 'TGR'

  return str
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
      let empRowIdx = 0
      for (const row of karyawanRows) {
        empRowIdx++
        if (!row || typeof row !== 'object') continue

        // Map excel keys to column names with safe length truncation
        const nikRaw = String(row.NIK || row.nik || row['NIK Karyawan'] || row['NIK Pemegang'] || '').trim()
        const namaRaw = String(row['Nama Karyawan'] || row.nama_karyawan || row.nama || row.Nama || row['Employee Name'] || '').trim()

        if (!nikRaw || !namaRaw || isPlaceholderIdentifier(nikRaw) || isPlaceholderIdentifier(namaRaw)) {
          if (nikRaw || namaRaw) {
            warnings.push(`Baris Karyawan #${empRowIdx} diabaikan: NIK (${nikRaw || 'kosong'}) dan Nama (${namaRaw || 'kosong'}) wajib diisi.`)
          }
          continue
        }

        const nik = truncate(nikRaw, 30)
        const nama = truncate(namaRaw, 150)
        const email = truncate(String(row['Email Kantor'] || row.email_kantor || row.email || row.Email || `${nikRaw}@esb.co.id`).trim().toLowerCase(), 150)
        const status = truncate(String(row.Status || row.status_karyawan || row['Status Karyawan'] || 'Active').trim(), 30)
        const jabatan = truncate(String(row.Title || row.jabatan || row.Jabatan || row.Position || '').trim(), 255)
        const tingkat = truncate(String(row['Job Level'] || row.tingkat_jabatan || row.Level || '').trim(), 50)
        const departemen = truncate(String(row.Departemen || row.departemen || row.Department || '').trim(), 100)
        const direktorat = truncate(String(row.Directorate || row.direktorat || row.Directorate || '').trim(), 100)
        const lokasi = truncate(normalizeLocation(row['Lokasi Kerja'] || row.lokasi_kerja || row.lokasi || row.Lokasi || ''), 100)
        const statusKepegawaian = truncate(String(row['Employeement Status'] || row['Employment Status'] || row.status_kepegawaian || '').trim(), 50)

        const spName = `sp_emp_${empRowIdx}`
        await client.query(`SAVEPOINT ${spName}`)
        try {
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
          await client.query(`RELEASE SAVEPOINT ${spName}`)
        } catch (err) {
          await client.query(`ROLLBACK TO SAVEPOINT ${spName}`)
          warnings.push(`Baris Karyawan #${empRowIdx} (${nama}) gagal diimpor: ${err.message}`)
        }
      }

      // Build NIK to ID mapping for Asset assignment
      const allEmpsRes = await client.query(`SELECT id_karyawan, nik FROM karyawan`)
      const nikToIdMap = new Map()
      allEmpsRes.rows.forEach(r => nikToIdMap.set(String(r.nik).trim(), r.id_karyawan))

      // ── STEP 2: IMPORT ASSETS ─────────────────────────────────────────────
      let assetRowIdx = 0
      for (const row of assetRows) {
        assetRowIdx++
        if (!row || typeof row !== 'object') continue

        // Extract field values using broadened field aliases
        const labelRaw = String(
          row['Label Aset'] || row.label_aset || row['Label Asset'] || row.ID || row.id ||
          row['Kode Aset'] || row.kode_aset || row['Asset Tag'] || row.asset_tag ||
          row['Tag Aset'] || row['Nama Asset'] || row['Nama Aset'] || row.Label || row.label || ''
        ).trim()

        const serialRaw = String(
          row['Serial Number'] || row.serial_number || row.nomor_seri || row['Nomor Seri'] ||
          row['Serial No'] || row.serial_no || row.SN || row.sn || row['S/N'] || row.s_n ||
          row.Serial || row.serial || ''
        ).trim()

        const isLabelValid = !isPlaceholderIdentifier(labelRaw)
        const isSerialValid = !isPlaceholderIdentifier(serialRaw)

        const spesifikasi = String(row.Spesifikasi || row.spesifikasi || row.Spec || row.specs || row.Specification || '').trim()
        const nikAssigned = String(row.NIK || row.nik || row['NIK Pemegang'] || row['NIK Karyawan'] || '').trim()
        const lokasi = truncate(normalizeLocation(row.Lokasi || row.lokasi_aset || row['Lokasi Aset'] || row['Lokasi Kerja'] || row.Location || ''), 100)
        const tipe = truncate(String(row['Tipe Perangkat'] || row.tipe_perangkat || row.Tipe || row.tipe || row.Kategori || row.Category || 'Laptop').trim(), 50)
        const merek = truncate(String(row['Brand/Merek'] || row.merek || row.Brand || row.brand || row.Merk || row.Manufacturer || '').trim(), 100)
        const model = truncate(String(row.Model || row.model || row['Tipe/Model'] || '').trim(), 100)
        const statusRaw = String(row.Status || row.status || row.status_aset || row['Status Aset'] || 'Stock').trim()
        const rawKondisi = String(row.Kondisi || row.kondisi || row.kondisi_aset || row['Kondisi Aset'] || row.Condition || 'Baik').trim()
        let catatan = String(row['Note Asset'] || row.catatan_aset || row.Catatan || row.catatan || row.Note || row.Notes || row.Keterangan || row.Remark || '').trim()

        // If neither label nor serial is valid, check if row has any meaningful device details
        if (!isLabelValid && !isSerialValid) {
          if (!spesifikasi && !lokasi && !merek && !model && isPlaceholderIdentifier(nikAssigned)) {
            continue // Entire row is empty/placeholder
          }
        }

        // Determine final label & serial number safely
        let serialFinal = null
        if (isSerialValid) {
          serialFinal = truncate(serialRaw, 100)
        }

        let labelFinal = null
        if (isLabelValid) {
          labelFinal = truncate(labelRaw, 100)
        } else if (serialFinal) {
          labelFinal = truncate(`ASET-${serialFinal}`, 100)
        } else {
          // Generate auto label if both label and serial are missing/placeholders but row has asset details
          const timestampSuffix = Date.now().toString().slice(-4)
          const randomSuffix = Math.floor(Math.random() * 100).toString().padStart(2, '0')
          labelFinal = truncate(`ASET-GEN-${assetRowIdx}-${timestampSuffix}${randomSuffix}`, 100)
        }

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
        if (statusRaw.toLowerCase().includes('use') || (!isPlaceholderIdentifier(nikAssigned) && nikAssigned !== '—' && nikAssigned !== '-')) {
          statusFinal = 'In Use'
        } else if (statusRaw.toLowerCase().includes('damaged') || statusRaw.toLowerCase().includes('rusak')) {
          statusFinal = 'Damaged'
        } else if (statusRaw.toLowerCase().includes('service')) {
          statusFinal = 'Need Service'
        }
        statusFinal = truncate(statusFinal, 30)

        const empId = (!isPlaceholderIdentifier(nikAssigned) && nikAssigned !== '—' && nikAssigned !== '-') ? (nikToIdMap.get(nikAssigned) || null) : null

        const spName = `sp_asset_${assetRowIdx}`
        await client.query(`SAVEPOINT ${spName}`)

        try {
          // Check existing active or soft-deleted asset in database (matching ONLY valid, non-placeholder identifiers)
          let existingAssetRes = { rows: [] }

          if (serialFinal && isLabelValid) {
            existingAssetRes = await client.query(
              `SELECT id_aset, deleted_at FROM aset_ti WHERE nomor_seri = $1 OR label_aset = $2 ORDER BY id_aset ASC`,
              [serialFinal, labelFinal]
            )
          } else if (serialFinal) {
            existingAssetRes = await client.query(
              `SELECT id_aset, deleted_at FROM aset_ti WHERE nomor_seri = $1 ORDER BY id_aset ASC`,
              [serialFinal]
            )
          } else if (isLabelValid) {
            existingAssetRes = await client.query(
              `SELECT id_aset, deleted_at FROM aset_ti WHERE label_aset = $1 ORDER BY id_aset ASC`,
              [labelFinal]
            )
          }

          if (existingAssetRes.rows.length > 0) {
            const assetRow = existingAssetRes.rows[0]
            const assetId = assetRow.id_aset
            const wasSoftDeleted = assetRow.deleted_at != null

            await client.query(
              `UPDATE aset_ti
                  SET label_aset = $1, nomor_seri = $2, spesifikasi = $3, lokasi_aset = $4,
                      tipe_perangkat = $5, merek = $6, model = $7, status_aset = $8,
                      kondisi_aset = $9, catatan_aset = $10, id_karyawan = $11,
                      deleted_at = NULL, deleted_by_user_id = NULL, deletion_reason = NULL,
                      diperbarui_pada = CURRENT_TIMESTAMP
                WHERE id_aset = $12`,
              [labelFinal, serialFinal, spesifikasi, lokasi, tipe, merek, model, statusFinal, kondisi, catatan, empId, assetId]
            )
            if (wasSoftDeleted) {
              importedAssetCount++
            } else {
              updatedAssetCount++
            }
          } else {
            await client.query(
              `INSERT INTO aset_ti (
                 label_aset, nomor_seri, spesifikasi, lokasi_aset, tipe_perangkat,
                 merek, model, status_aset, kondisi_aset, catatan_aset, id_karyawan
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [labelFinal, serialFinal, spesifikasi, lokasi, tipe, merek, model, statusFinal, kondisi, catatan, empId]
            )
            importedAssetCount++
          }
          await client.query(`RELEASE SAVEPOINT ${spName}`)
        } catch (err) {
          await client.query(`ROLLBACK TO SAVEPOINT ${spName}`)
          warnings.push(`Baris Aset #${assetRowIdx} (${labelFinal || 'Aset'}) gagal diimpor: ${err.message}`)
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

