import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'

const MIGRATION_NAME_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/
const TRANSACTION_CONTROL_PATTERN = /^\s*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/im
const PSQL_META_COMMAND_PATTERN = /^\s*\\/m
const MIGRATION_LOCK_NAME = 'it-monitoring-assets:canonical-migrations'

const APPLICATION_RELATIONS = Object.freeze([
  'aset_ti',
  'daftar_aset_ti_lengkap',
  'karyawan',
  'komentar_tiket',
  'log_audit_login',
  'log_riwayat_aset',
  'log_riwayat_tiket',
  'riwayat_pemakaian_aset',
  'ticket_casp_ratings',
  'ticket_queues',
  'tickets',
  'user_ticket_queues',
  'users',
])

const CREATE_LEDGER_SQL = `
  CREATE TABLE IF NOT EXISTS app_schema_migrations (
    version           INTEGER PRIMARY KEY,
    name              VARCHAR(160) NOT NULL UNIQUE,
    checksum_sha256   CHAR(64) NOT NULL,
    applied_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_by        VARCHAR(150) NOT NULL,
    recovery_proof_id VARCHAR(160) NOT NULL,
    change_id         VARCHAR(160),
    execution_ms      INTEGER NOT NULL CHECK (execution_ms >= 0)
  )
`

function normalizedText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function requireExactEnvironment(environment, name, expected) {
  const actual = normalizedText(environment[name])
  if (!actual || actual !== expected) {
    throw new Error(`${name} wajib sama persis dengan target terkonfigurasi: ${expected}`)
  }
}

export async function loadVersionedMigrations(
  directory = new URL('../../migrations/versioned/', import.meta.url),
) {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))

  if (names.length === 0) {
    throw new Error('Tidak ada migration versioned yang ditemukan.')
  }

  const migrations = []
  for (const name of names) {
    const match = MIGRATION_NAME_PATTERN.exec(name)
    if (!match) {
      throw new Error(`Nama migration tidak valid: ${name}`)
    }

    const sql = await readFile(new URL(name, directory), 'utf8')
    if (!sql.trim()) throw new Error(`Migration kosong: ${name}`)
    if (TRANSACTION_CONTROL_PATTERN.test(sql)) {
      throw new Error(`Migration tidak boleh mengatur transaction sendiri: ${name}`)
    }
    if (PSQL_META_COMMAND_PATTERN.test(sql)) {
      throw new Error(`Migration tidak boleh berisi psql meta-command: ${name}`)
    }

    migrations.push({
      version: Number(match[1]),
      name,
      sql,
      checksum: createHash('sha256').update(sql, 'utf8').digest('hex'),
    })
  }

  migrations.forEach((migration, index) => {
    const expectedVersion = index + 1
    if (migration.version !== expectedVersion) {
      throw new Error(
        `Urutan migration harus kontigu mulai 0001; expected ${expectedVersion}, ditemukan ${migration.version}.`,
      )
    }
  })

  return migrations
}

export function assertMigrationAuthorization({
  environment = process.env,
  databaseConfig,
  apply = false,
}) {
  const mode = normalizedText(environment.MIGRATION_MODE)
  if (mode !== 'fresh' && mode !== 'existing') {
    throw new Error("MIGRATION_MODE wajib bernilai 'fresh' atau 'existing'.")
  }

  requireExactEnvironment(environment, 'MIGRATION_EXPECTED_HOST', databaseConfig.host)
  requireExactEnvironment(environment, 'MIGRATION_EXPECTED_DATABASE', databaseConfig.database)

  if (!apply) return { mode, recoveryProofId: null, changeId: null }

  if (environment.ALLOW_DB_MIGRATIONS !== 'true') {
    throw new Error('Apply migration ditolak: ALLOW_DB_MIGRATIONS=true belum diberikan.')
  }

  const recoveryProofId = normalizedText(environment.MIGRATION_RECOVERY_PROOF_ID)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{7,159}$/.test(recoveryProofId)) {
    throw new Error('MIGRATION_RECOVERY_PROOF_ID wajib menunjuk bukti restore yang terverifikasi.')
  }

  const changeId = normalizedText(environment.MIGRATION_CHANGE_ID)
  if (databaseConfig.production && !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{2,159}$/.test(changeId)) {
    throw new Error('MIGRATION_CHANGE_ID wajib diisi untuk target production.')
  }

  return { mode, recoveryProofId, changeId: changeId || null }
}

export async function readDatabaseIdentity(client) {
  const result = await client.query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      COALESCE(role.rolsuper, FALSE) AS is_superuser,
      pg_is_in_recovery() AS is_replica,
      current_setting('transaction_read_only')::boolean AS transaction_read_only
    FROM pg_roles role
    WHERE role.rolname = current_user
  `)

  if (result.rowCount !== 1) {
    throw new Error('Tidak dapat memverifikasi identity database migration.')
  }
  return result.rows[0]
}

export function assertDatabaseIdentity(identity, { expectedDatabase, apply = false }) {
  if (identity.database_name !== expectedDatabase) {
    throw new Error(
      `Target database berubah: expected ${expectedDatabase}, actual ${identity.database_name}.`,
    )
  }
  if (identity.is_superuser === true) {
    throw new Error('Migration harus memakai role owner non-superuser yang terdedikasi.')
  }
  if (apply && (identity.is_replica === true || identity.transaction_read_only === true)) {
    throw new Error('Target database read-only/replica tidak dapat menerima migration.')
  }
}

async function readAppliedMigrations(client, mode) {
  const ledgerResult = await client.query(
    "SELECT to_regclass('public.app_schema_migrations')::text AS ledger",
  )
  const ledgerExists = Boolean(ledgerResult.rows[0]?.ledger)

  if (!ledgerExists) {
    const relationsResult = await client.query(
      `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r', 'p', 'v', 'm')
         AND c.relname = ANY($1::text[])
       ORDER BY c.relname`,
      [APPLICATION_RELATIONS],
    )
    const relations = relationsResult.rows.map((row) => row.relname)

    if (relations.length > 0) {
      throw new Error(
        `Database existing tanpa ledger ditolak. Relations: ${relations.join(', ')}. ` +
          'Buat migration adoption yang direview; baseline otomatis tidak diizinkan.',
      )
    }
    if (mode !== 'fresh') {
      throw new Error("Database kosong harus memakai MIGRATION_MODE='fresh'.")
    }
    return []
  }

  const result = await client.query(
    `SELECT version, name, checksum_sha256
     FROM app_schema_migrations
     ORDER BY version`,
  )
  return result.rows.map((row) => ({
    version: Number(row.version),
    name: row.name,
    checksum: row.checksum_sha256,
  }))
}

export function buildMigrationPlan(migrations, appliedMigrations) {
  const localByVersion = new Map(migrations.map((migration) => [migration.version, migration]))
  const appliedVersions = new Set()

  for (const applied of appliedMigrations) {
    const local = localByVersion.get(applied.version)
    if (!local) {
      throw new Error(
        `Database memiliki migration version ${applied.version} yang tidak tersedia di source.`,
      )
    }
    if (local.name !== applied.name || local.checksum !== applied.checksum) {
      throw new Error(`Checksum migration yang sudah diterapkan berubah: ${applied.name}`)
    }
    appliedVersions.add(applied.version)
  }

  return migrations.filter((migration) => !appliedVersions.has(migration.version))
}

async function acquireMigrationLock(client) {
  const result = await client.query(
    'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
    [MIGRATION_LOCK_NAME],
  )
  if (result.rows[0]?.acquired !== true) {
    throw new Error('Migration lain sedang berjalan; advisory lock tidak tersedia.')
  }
}

async function releaseMigrationLock(client) {
  await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
    MIGRATION_LOCK_NAME,
  ])
}

export async function inspectMigrationPlan(client, migrations, context) {
  const identity = await readDatabaseIdentity(client)
  assertDatabaseIdentity(identity, {
    expectedDatabase: context.expectedDatabase,
    apply: false,
  })
  const applied = await readAppliedMigrations(client, context.mode)
  return {
    identity,
    applied,
    pending: buildMigrationPlan(migrations, applied),
  }
}

export async function applyVersionedMigrations(client, migrations, context) {
  const identity = await readDatabaseIdentity(client)
  assertDatabaseIdentity(identity, {
    expectedDatabase: context.expectedDatabase,
    apply: true,
  })

  await acquireMigrationLock(client)
  try {
    const applied = await readAppliedMigrations(client, context.mode)
    const pending = buildMigrationPlan(migrations, applied)
    const completed = []

    for (const migration of pending) {
      const startedAt = Date.now()
      await client.query('BEGIN')
      try {
        await client.query("SET LOCAL lock_timeout = '5s'")
        await client.query("SET LOCAL statement_timeout = '10min'")
        await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'")
        await client.query(CREATE_LEDGER_SQL)
        await client.query(migration.sql)

        const executionMs = Math.max(0, Date.now() - startedAt)
        await client.query(
          `INSERT INTO app_schema_migrations
             (version, name, checksum_sha256, applied_by, recovery_proof_id, change_id, execution_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            migration.version,
            migration.name,
            migration.checksum,
            identity.database_user,
            context.recoveryProofId,
            context.changeId,
            executionMs,
          ],
        )
        await client.query('COMMIT')
        completed.push(migration)
      } catch (error) {
        try {
          await client.query('ROLLBACK')
        } catch (rollbackError) {
          error.rollbackError = rollbackError
        }
        throw error
      }
    }

    return { identity, completed, pendingCount: pending.length }
  } finally {
    await releaseMigrationLock(client)
  }
}
