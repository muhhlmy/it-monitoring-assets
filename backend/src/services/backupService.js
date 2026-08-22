import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { env } from '../config/env.js'
import { pool } from '../config/database.js'

const BACKUP_DIR = process.env.DB_BACKUP_DIR || 'storage/backups'
const BACKUP_RETENTION_DAYS = Number(process.env.DB_BACKUP_RETENTION_DAYS || 30)
const BACKUP_MAX_FILES = Number(process.env.DB_BACKUP_MAX_FILES || 20)
const PG_DUMP_PATH = process.env.PG_DUMP_PATH || 'pg_dump'
const PG_RESTORE_PATH = process.env.PG_RESTORE_PATH || 'pg_restore'
const PSQL_PATH = process.env.PSQL_PATH || 'psql'
const MAX_UPLOAD_SIZE = 500 * 1024 * 1024 // 500MB

function resolveBackupDir() {
  return path.resolve(BACKUP_DIR)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureBackupDir() {
  const dir = resolveBackupDir()
  await fsp.mkdir(dir, { recursive: true })
  return dir
}

/**
 * Generate nama file backup dengan timestamp.
 */
export function generateBackupFilename(prefix = 'esb_trackit', type = 'manual') {
  const now = new Date()
  const ts = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const typeLabel = type === 'pre_restore' ? 'pre_restore' : 'backup'
  return `${prefix}_${typeLabel}_${ts}.dump`
}

/**
 * Hitung SHA-256 checksum dari file.
 */
export async function computeChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * Jalankan proses eksternal (pg_dump, pg_restore, psql) dengan aman.
 * Menggunakan spawn dengan argument array — tidak ada shell interpolation.
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        const err = new Error(stderr.trim() || `Process exited with code ${code}`)
        err.code = code
        err.stdout = stdout
        err.stderr = stderr
        reject(err)
      }
    })

    child.on('error', reject)
  })
}

/**
 * Periksa apakah pg_dump tersedia di sistem.
 */
export async function checkPgDumpAvailable() {
  try {
    await runCommand(PG_DUMP_PATH, ['--version'])
    return true
  } catch {
    return false
  }
}

/**
 * Periksa apakah pg_restore tersedia di sistem.
 */
export async function checkPgRestoreAvailable() {
  try {
    await runCommand(PG_RESTORE_PATH, ['--version'])
    return true
  } catch {
    return false
  }
}

/**
 * Periksa apakah psql tersedia di sistem.
 */
export async function checkPsqlAvailable() {
  try {
    await runCommand(PSQL_PATH, ['--version'])
    return true
  } catch {
    return false
  }
}

/**
 * Dapatkan status database lengkap.
 */
export async function getDatabaseStatus() {
  const result = {
    connected: false,
    databaseName: env.database.database,
    schemaHealthy: false,
    pgDumpAvailable: false,
    pgRestoreAvailable: false,
    psqlAvailable: false,
    backupStorageAvailable: false,
    backupCount: 0,
    lastBackup: null,
    tables: [],
    views: [],
  }

  try {
    // Check database connection
    const dbCheck = await pool.query('SELECT 1 AS ok')
    result.connected = dbCheck.rows[0]?.ok === 1

    // Get tables
    const tablesRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)
    result.tables = tablesRes.rows.map((r) => r.table_name)

    // Get views
    const viewsRes = await pool.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)
    result.views = viewsRes.rows.map((r) => r.table_name)

    // Required tables & views from project
    const requiredTables = [
      'users', 'karyawan', 'aset_ti', 'aset_ga', 'aset_ops',
      'tickets', 'ticket_queues', 'komentar_tiket', 'ticket_casp_ratings',
      'user_ticket_queues', 'log_riwayat_tiket', 'log_riwayat_aset',
      'riwayat_pemakaian_aset', 'log_audit_login', 'user_sessions',
      'account_security_state',
    ]
    const requiredViews = ['daftar_aset_ti_lengkap', 'v_ticket_stats_per_queue', 'v_employee_asset_summary']

    const missingTables = requiredTables.filter((t) => !result.tables.includes(t))
    const missingViews = requiredViews.filter((v) => !result.views.includes(v))

    result.schemaHealthy = missingTables.length === 0 && missingViews.length === 0
    if (!result.schemaHealthy) {
      result.missingTables = missingTables
      result.missingViews = missingViews
    }
  } catch {
    result.connected = false
  }

  // Check tools
  result.pgDumpAvailable = await checkPgDumpAvailable()
  result.pgRestoreAvailable = await checkPgRestoreAvailable()
  result.psqlAvailable = await checkPsqlAvailable()

  // Check backup storage
  try {
    await ensureBackupDir()
    const files = await fsp.readdir(resolveBackupDir())
    result.backupStorageAvailable = true
    result.backupCount = files.filter((f) => f.endsWith('.dump')).length
  } catch {
    result.backupStorageAvailable = false
  }

  return result
}

/**
 * Jalankan backup database menggunakan pg_dump (custom format).
 */
export async function createBackup(userId, userName, backupType = 'manual') {
  const dbName = env.database.database
  const dbHost = env.database.host
  const dbPort = env.database.port
  const dbUser = env.database.user
  const dbPassword = env.database.password

  const filename = generateBackupFilename('esb_trackit', backupType)
  const dir = await ensureBackupDir()
  const filepath = path.join(dir, filename)

  const args = [
    '--host', dbHost,
    '--port', String(dbPort),
    '--username', dbUser,
    '--format', 'c',
    '--blobs',
    '--no-owner',
    '--no-privileges',
    '--file', filepath,
    dbName,
  ]

  // Set PGPASSWORD environment variable for password-less auth
  const envVars = { ...process.env, PGPASSWORD: dbPassword }

  // Audit: BACKUP_STARTED
  await insertAuditLog(userId, userName, 'BACKUP_STARTED', dbName, null, 'in_progress')

  try {
    await runCommand(PG_DUMP_PATH, args, { env: envVars })

    // Get file size
    const stat = await fsp.stat(filepath)
    const fileSize = stat.size

    // Compute checksum
    const checksum = await computeChecksum(filepath)

    // Insert metadata AFTER dump completes — prevents stale in_progress records in dump files
    const insertResult = await pool.query(
      `INSERT INTO backup_metadata (filename, filepath, file_size, database_name, backup_type, status, checksum, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, 'success', $6, $7, $8) RETURNING id`,
      [filename, filepath, fileSize, dbName, backupType, checksum, userId, userName],
    )
    const backupId = insertResult.rows[0].id

    // Audit: BACKUP_SUCCESS
    await insertAuditLog(userId, userName, 'BACKUP_SUCCESS', dbName, backupId, 'success')

    return {
      id: backupId,
      filename,
      filepath,
      fileSize,
      databaseName: dbName,
      backupType,
      status: 'success',
      checksum,
    }
  } catch (error) {
    // Audit: BACKUP_FAILED (no metadata record to update)
    const safeError = error.message ? error.message.slice(0, 500) : 'Unknown error'
    await insertAuditLog(userId, userName, 'BACKUP_FAILED', dbName, null, 'failed', safeError)

    // Cleanup partial file
    try { await fsp.unlink(filepath) } catch {}

    throw error
  }
}

/**
 * Dapatkan daftar backup history.
 */
export async function getBackupHistory(page = 1, pageSize = 20) {
  const offset = (page - 1) * pageSize

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM backup_metadata
     WHERE backup_type != 'pre_restore'
       AND status != 'in_progress'`
  )
  const total = countResult.rows[0]?.total || 0

  const result = await pool.query(
    `SELECT id, filename, file_size, database_name, backup_type, status, checksum, created_by_name, created_at
     FROM backup_metadata
     WHERE backup_type != 'pre_restore'
       AND status != 'in_progress'
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset],
  )

  return {
    backups: result.rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Dapatkan metadata backup berdasarkan ID.
 */
export async function getBackupById(id) {
  const result = await pool.query(
    `SELECT id, filename, filepath, file_size, database_name, backup_type, status, checksum, created_by_name, created_at
     FROM backup_metadata WHERE id = $1`,
    [id],
  )
  return result.rows[0] || null
}

/**
 * Hapus backup berdasarkan ID.
 */
export async function deleteBackup(id, userId, userName) {
  const backup = await getBackupById(id)
  if (!backup) {
    throw new Error('Backup tidak ditemukan.')
  }

  const dbName = env.database.database

  try {
    await fsp.unlink(backup.filepath)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error(`Gagal menghapus file backup: ${err.message}`)
    }
  }

  await pool.query('DELETE FROM backup_metadata WHERE id = $1', [id])

  await insertAuditLog(userId, userName, 'BACKUP_DELETED', dbName, id, 'success')

  return { deleted: true, id }
}

/**
 * Validasi file upload untuk restore.
 */
export function validateUploadFile(filePath, originalName) {
  // Periksa file ada
  if (!fs.existsSync(filePath)) {
    throw new Error('File upload tidak ditemukan.')
  }

  // Periksa extension
  const ext = path.extname(originalName).toLowerCase()
  if (ext !== '.dump' && ext !== '.sql' && ext !== '.tar') {
    throw new Error('Format file tidak didukung. Gunakan file .dump, .sql, atau .tar.')
  }

  // Periksa ukuran
  const stat = fs.statSync(filePath)
  if (stat.size === 0) {
    throw new Error('File backup kosong.')
  }
  if (stat.size > MAX_UPLOAD_SIZE) {
    throw new Error(`Ukuran file terlalu besar. Maksimal ${MAX_UPLOAD_SIZE / 1024 / 1024}MB.`)
  }

  // Periksa path traversal
  const resolvedPath = path.resolve(filePath)
  const normalizedName = path.normalize(originalName).replace(/^(\.\.(\/|\\|$))+/, '')
  if (normalizedName !== path.basename(originalName)) {
    throw new Error('Nama file tidak valid.')
  }

  return { filePath, fileSize: stat.size, originalName }
}

/**
 * Validasi isi backup dengan pg_restore --list.
 */
export async function validateBackupContent(filePath) {
  try {
    await runCommand(PG_RESTORE_PATH, ['--list', filePath], {
      env: { ...process.env, PGPASSWORD: env.database.password },
    })
    return { valid: true }
  } catch (error) {
    return { valid: false, error: error.stderr?.slice(0, 500) || 'Unknown error' }
  }
}

/**
 * Dapatkan informasi backup dari file upload.
 */
export async function getBackupFileInfo(filePath) {
  const stat = fs.statSync(filePath)
  const checksum = await computeChecksum(filePath)

  let format = 'unknown'
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.dump') format = 'PostgreSQL Custom'
  else if (ext === '.sql') format = 'SQL Plain Text'
  else if (ext === '.tar') format = 'TAR Archive'

  return {
    filePath,
    fileSize: stat.size,
    checksum,
    format,
    databaseName: env.database.database,
  }
}

/**
 * Jalankan restore database menggunakan pg_restore.
 * Sebelum restore, buat safety backup (pre-restore).
 */
export async function restoreDatabase(userId, userName, backupFilePath, originalName) {
  const dbName = env.database.database
  const dbHost = env.database.host
  const dbPort = env.database.port
  const dbUser = env.database.user
  const dbPassword = env.database.password

  // Audit: RESTORE_STARTED
  await insertAuditLog(userId, userName, 'RESTORE_STARTED', dbName, null, 'in_progress')

  // Step 1: Create pre-restore safety backup
  await insertAuditLog(userId, userName, 'PRE_RESTORE_BACKUP_STARTED', dbName, null, 'in_progress')

  let safetyBackupId = null
  try {
    const safetyBackup = await createBackup(userId, userName, 'pre_restore')
    safetyBackupId = safetyBackup.id
    await insertAuditLog(userId, userName, 'PRE_RESTORE_BACKUP_SUCCESS', dbName, safetyBackupId, 'success')
  } catch (error) {
    const safeError = error.message ? error.message.slice(0, 500) : 'Unknown error'
    await insertAuditLog(userId, userName, 'PRE_RESTORE_BACKUP_FAILED', dbName, null, 'failed', safeError)
    throw new Error('Gagal membuat safety backup. Restore dibatalkan.')
  }

  // Step 2: Restore
  const ext = path.extname(originalName).toLowerCase()

  try {
    if (ext === '.dump') {
      // Custom format: gunakan pg_restore dengan --clean --if-exists
      // Drop existing connections first
      await dropConnections(dbName, dbUser, dbPassword, dbHost, dbPort)

      const args = [
        '--host', dbHost,
        '--port', String(dbPort),
        '--username', dbUser,
        '--dbname', dbName,
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--single-transaction',
        '--exit-on-error',
        backupFilePath,
      ]

      await runCommand(PG_RESTORE_PATH, args, {
        env: { ...process.env, PGPASSWORD: dbPassword },
      })
    } else if (ext === '.sql') {
      // Plain SQL: gunakan psql
      await dropConnections(dbName, dbUser, dbPassword, dbHost, dbPort)

      const args = [
        '--host', dbHost,
        '--port', String(dbPort),
        '--username', dbUser,
        '--dbname', dbName,
        '--file', backupFilePath,
        '--single-transaction',
        '--set', 'ON_ERROR_STOP=on',
      ]

      await runCommand(PSQL_PATH, args, {
        env: { ...process.env, PGPASSWORD: dbPassword },
      })
    } else {
      throw new Error('Format file tidak didukung untuk restore.')
    }

    // Step 3: Verify database
    await verifyDatabaseAfterRestore()

    // Audit: RESTORE_SUCCESS
    await insertAuditLog(userId, userName, 'RESTORE_SUCCESS', dbName, null, 'success')

    return {
      success: true,
      safetyBackupId,
      databaseName: dbName,
    }
  } catch (error) {
    const safeError = error.message ? error.message.slice(0, 500) : 'Unknown error'

    // Audit: RESTORE_FAILED
    await insertAuditLog(userId, userName, 'RESTORE_FAILED', dbName, null, 'failed', safeError)

    throw new Error(`Restore gagal: ${safeError}`)
  }
}

/**
 * Putuskan koneksi aktif ke database target (kecuali koneksi saat ini).
 */
async function dropConnections(dbName, dbUser, dbPassword, dbHost, dbPort) {
  try {
    const envVars = { ...process.env, PGPASSWORD: dbPassword }
    await runCommand(PSQL_PATH, [
      '--host', dbHost,
      '--port', String(dbPort),
      '--username', dbUser,
      '--dbname', dbName,
      '--command',
      `SELECT pg_terminate_backend(pg_stat_activity.pid)
       FROM pg_stat_activity
       WHERE pg_stat_activity.datname = '${dbName}'
         AND pid <> pg_backend_pid()`,
    ], { env: envVars })
  } catch {
    // Terminate connections is best-effort
  }

  // Small delay to let connections close
  await sleep(1000)
}

/**
 * Verifikasi database setelah restore.
 */
async function verifyDatabaseAfterRestore() {
  const requiredTables = [
    'users', 'karyawan', 'aset_ti', 'aset_ga', 'aset_ops',
    'tickets', 'ticket_queues', 'log_audit_login', 'user_sessions',
  ]
  const requiredViews = ['daftar_aset_ti_lengkap']

  // Check database reachable
  const dbCheck = await pool.query('SELECT 1 AS ok')
  if (dbCheck.rows[0]?.ok !== 1) {
    throw new Error('Database tidak dapat dijangkau setelah restore.')
  }

  // Check tables
  const tablesRes = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `)
  const existingTables = new Set(tablesRes.rows.map((r) => r.table_name))
  const missingTables = requiredTables.filter((t) => !existingTables.has(t))

  if (missingTables.length > 0) {
    throw new Error(`Tabel berikut tidak ditemukan setelah restore: ${missingTables.join(', ')}`)
  }

  // Check views
  const viewsRes = await pool.query(`
    SELECT table_name FROM information_schema.views
    WHERE table_schema = 'public'
  `)
  const existingViews = new Set(viewsRes.rows.map((r) => r.table_name))
  const missingViews = requiredViews.filter((v) => !existingViews.has(v))

  if (missingViews.length > 0) {
    throw new Error(`View berikut tidak ditemukan setelah restore: ${missingViews.join(', ')}`)
  }

  // Refresh connection pool
  // The pg Pool will handle reconnection automatically
}

/**
 * Jalankan retention cleanup berdasarkan konfigurasi.
 */
export async function runRetentionCleanup() {
  const dir = await ensureBackupDir()

  // Cleanup by age
  if (BACKUP_RETENTION_DAYS > 0) {
    const cutoff = new Date(Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000)

    const oldBackups = await pool.query(
      `SELECT id, filepath FROM backup_metadata
       WHERE backup_type = 'manual'
         AND created_at < $1
       ORDER BY created_at ASC`,
      [cutoff],
    )

    for (const backup of oldBackups.rows) {
      try {
        await fsp.unlink(backup.filepath)
      } catch {}
      await pool.query('DELETE FROM backup_metadata WHERE id = $1', [backup.id])
    }
  }

  // Cleanup by count
  if (BACKUP_MAX_FILES > 0) {
    const manualBackups = await pool.query(
      `SELECT id, filepath FROM backup_metadata
       WHERE backup_type = 'manual'
       ORDER BY created_at DESC
       OFFSET $1`,
      [BACKUP_MAX_FILES],
    )

    for (const backup of manualBackups.rows) {
      try {
        await fsp.unlink(backup.filepath)
      } catch {}
      await pool.query('DELETE FROM backup_metadata WHERE id = $1', [backup.id])
    }
  }
}

/**
 * Insert audit log entry.
 */
export async function insertAuditLog(userId, userName, operation, targetDatabase, backupId, status, errorSummary = null) {
  try {
    await pool.query(
      `INSERT INTO backup_audit_log (user_id, user_name, operation, target_database, backup_id, status, error_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, userName, operation, targetDatabase, backupId, status, errorSummary],
    )
  } catch (err) {
    console.error('[Backup Audit] Gagal menulis audit log:', err.message)
  }
}

/**
 * Dapatkan audit log backup.
 */
export async function getAuditLogs(page = 1, pageSize = 50) {
  const offset = (page - 1) * pageSize

  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS total FROM backup_audit_log'
  )
  const total = countResult.rows[0]?.total || 0

  const result = await pool.query(
    `SELECT id, user_id, user_name, operation, target_database, backup_id, status, error_summary, created_at
     FROM backup_audit_log
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset],
  )

  return {
    logs: result.rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}