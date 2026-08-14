import { pool, query } from './database.js'
import { verifyRuntimeSchema } from './runtimeSchema.js'

const expectedColumns = [
  'id_aset',
  'hostname',
  'nomor_seri',
  'label_aset',
  'spesifikasi',
  'nik',
  'nama_karyawan',
  'departemen',
  'lokasi_kerja',
  'tipe_perangkat',
  'merek',
  'model',
  'status_aset',
  'kondisi_aset',
  'catatan_aset',
  'lokasi_aset',
]

try {
  await verifyRuntimeSchema(pool)

  const columnsResult = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'daftar_aset_ti_lengkap'
    ORDER BY ordinal_position
  `)

  const actualColumns = []

  for (let index = 0; index < columnsResult.rows.length; index += 1) {
    actualColumns.push(columnsResult.rows[index].column_name)
  }

  const expectedText = JSON.stringify(expectedColumns)
  const actualText = JSON.stringify(actualColumns)

  if (actualText !== expectedText) {
    let foundColumns = actualColumns.join(', ')

    if (!foundColumns) {
      foundColumns = '(tidak ada)'
    }

    throw new Error('Kolom view tidak sesuai. Ditemukan: ' + foundColumns)
  }

  const countsResult = await query(`
    SELECT
      (SELECT COUNT(*) FROM karyawan) AS karyawan,
      (SELECT COUNT(*) FROM aset_ti) AS aset
  `)

  const counts = countsResult.rows[0]
  console.log('Schema valid: ' + counts.karyawan + ' karyawan, ' + counts.aset + ' aset.')
} catch (error) {
  console.error('Pemeriksaan schema gagal:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
