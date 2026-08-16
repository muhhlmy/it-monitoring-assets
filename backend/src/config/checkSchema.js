import { pool, query } from './database.js'
import { verifyRuntimeSchema } from './runtimeSchema.js'

try {
  await verifyRuntimeSchema(pool)
  
  const countsResult = await query(`
    SELECT
      (SELECT COUNT(*) FROM karyawan) AS karyawan,
      (SELECT COUNT(*) FROM aset_ti) AS aset,
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM tickets) AS tickets
  `)
  
  const counts = countsResult.rows[0]
  console.log('Schema valid: ' + counts.karyawan + ' karyawan, ' + counts.aset + ' aset, ' + counts.users + ' users, ' + counts.tickets + ' tickets.')
} catch (error) {
  console.error('Pemeriksaan schema gagal:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
