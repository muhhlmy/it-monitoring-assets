import { env } from './env.js'
import {
  applyVersionedMigrations,
  assertMigrationAuthorization,
  inspectMigrationPlan,
  loadVersionedMigrations,
} from './migrationRunner.js'

const apply = process.argv.includes('--apply')
const plan = process.argv.includes('--plan')

if (apply === plan) {
  console.error('Gunakan tepat satu mode: --plan atau --apply.')
  process.exitCode = 1
} else {
  let pool
  try {
    const authorization = assertMigrationAuthorization({
      databaseConfig: env.database,
      apply,
    })
    const migrations = await loadVersionedMigrations()
    ;({ pool } = await import('./database.js'))
    const client = await pool.connect()
    try {
      if (apply) {
        const result = await applyVersionedMigrations(client, migrations, {
          ...authorization,
          expectedDatabase: env.database.database,
        })
        console.log(
          `Migration selesai: ${result.completed.length} diterapkan dari ${result.pendingCount} pending.`,
        )
      } else {
        const result = await inspectMigrationPlan(client, migrations, {
          ...authorization,
          expectedDatabase: env.database.database,
        })
        console.log(
          result.pending.length === 0
            ? 'Migration plan bersih; tidak ada version pending.'
            : `Migration pending: ${result.pending.map((item) => item.name).join(', ')}`,
        )
      }
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Migration ditolak:', error.message)
    process.exitCode = 1
  } finally {
    if (pool) await pool.end()
  }
}
