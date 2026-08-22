import fs from 'node:fs'
import path from 'node:path'
import { AppError, ERROR_CODES } from '../errors/AppError.js'
import {
  getDatabaseStatus,
  createBackup,
  getBackupHistory,
  getBackupById,
  deleteBackup,
  validateUploadFile,
  validateBackupContent,
  getBackupFileInfo,
  restoreDatabase,
  runRetentionCleanup,
  getAuditLogs,
} from '../services/backupService.js'

/**
 * GET /api/admin/database/status
 * Mendapatkan status database, tools, dan storage backup.
 */
export async function getDatabaseStatusHandler(req, res) {
  try {
    const status = await getDatabaseStatus()
    res.json({ success: true, data: status })
  } catch (error) {
    throw new AppError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Gagal mendapatkan status database.', 500)
  }
}

/**
 * POST /api/admin/database/backups
 * Membuat backup database baru.
 */
export async function createBackupHandler(req, res) {
  try {
    const userId = req.user.id
    const userName = String(req.user.nama || req.user.email || 'Unknown')

    const result = await createBackup(userId, userName, 'manual')

    // Run retention cleanup after backup
    try {
      await runRetentionCleanup()
    } catch {
      // Retention cleanup failure is non-critical
    }

    res.status(201).json({
      success: true,
      message: 'Backup database berhasil dibuat.',
      data: result,
    })
  } catch (error) {
    const safeMessage = error.message
      ? error.message.replace(/password|secret|token/gi, '[REDACTED]').slice(0, 500)
      : 'Gagal membuat backup database.'

    throw new AppError(ERROR_CODES.INTERNAL_SERVER_ERROR, safeMessage, 500)
  }
}

/**
 * GET /api/admin/database/backups
 * Mendapatkan daftar backup history.
 */
export async function getBackupHistoryHandler(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))

    const result = await getBackupHistory(page, pageSize)

    res.json({
      success: true,
      data: result.backups,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    })
  } catch (error) {
    throw new AppError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Gagal mendapatkan riwayat backup.', 500)
  }
}

/**
 * GET /api/admin/database/backups/:id/download
 * Download file backup berdasarkan ID.
 */
export async function downloadBackupHandler(req, res) {
  try {
    const id = Number(req.params.id)
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new AppError(ERROR_CODES.BAD_REQUEST, 'ID backup tidak valid.', 400)
    }

    const backup = await getBackupById(id)
    if (!backup) {
      throw new AppError(ERROR_CODES.RESOURCE_NOT_FOUND, 'Backup tidak ditemukan.', 404)
    }

    const filePath = backup.filepath

    // Security: resolve path dan pastikan file berada di dalam backup directory
    const resolvedPath = path.resolve(filePath)
    if (!fs.existsSync(resolvedPath)) {
      throw new AppError(ERROR_CODES.RESOURCE_NOT_FOUND, 'File backup tidak ditemukan di storage.', 404)
    }

    const userId = req.user.id
    const userName = String(req.user.nama || req.user.email || 'Unknown')

    // Audit: BACKUP_DOWNLOADED
    const { insertAuditLog } = await import('../services/backupService.js')
    await insertAuditLog(userId, userName, 'BACKUP_DOWNLOADED', backup.database_name, id, 'success')

    // Stream file
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`)
    res.setHeader('Content-Length', backup.file_size)

    const readStream = fs.createReadStream(resolvedPath)
    readStream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Gagal membaca file backup.' } })
      }
    })
    readStream.pipe(res)
  } catch (error) {
    if (error instanceof AppError) throw error
    const safeMessage = error.message ? error.message.slice(0, 500) : 'Gagal mendownload backup.'
    throw new AppError(ERROR_CODES.INTERNAL_SERVER_ERROR, safeMessage, 500)
  }
}

/**
 * DELETE /api/admin/database/backups/:id
 * Menghapus backup berdasarkan ID.
 */
export async function deleteBackupHandler(req, res) {
  try {
    const id = Number(req.params.id)
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new AppError(ERROR_CODES.BAD_REQUEST, 'ID backup tidak valid.', 400)
    }

    const userId = req.user.id
    const userName = String(req.user.nama || req.user.email || 'Unknown')

    const result = await deleteBackup(id, userId, userName)

    res.json({
      success: true,
      message: 'Backup berhasil dihapus.',
      data: result,
    })
  } catch (error) {
    if (error instanceof AppError) throw error

    if (error.message === 'Backup tidak ditemukan.') {
      throw new AppError(ERROR_CODES.RESOURCE_NOT_FOUND, error.message, 404)
    }

    const safeMessage = error.message ? error.message.slice(0, 500) : 'Gagal menghapus backup.'
    throw new AppError(ERROR_CODES.INTERNAL_SERVER_ERROR, safeMessage, 500)
  }
}

/**
 * POST /api/admin/database/restore/validate
 * Validasi file backup yang diupload sebelum restore.
 */
export async function validateRestoreHandler(req, res) {
  try {
    if (!req.file) {
      throw new AppError(ERROR_CODES.BAD_REQUEST, 'File backup wajib diupload.', 400)
    }

    const filePath = req.file.path
    const originalName = req.file.originalname || 'unknown.dump'

    // Validate file
    const validation = validateUploadFile(filePath, originalName)

    // Validate backup content
    const contentValidation = await validateBackupContent(filePath)

    // Get backup info
    const info = await getBackupFileInfo(filePath)

    res.json({
      success: true,
      data: {
        ...info,
        ...validation,
        contentValid: contentValidation.valid,
        contentError: contentValidation.valid ? null : contentValidation.error,
      },
    })
  } catch (error) {
    if (error instanceof AppError) throw error

    // Cleanup temp file
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path) } catch {}
    }

    const safeMessage = error.message ? error.message.slice(0, 500) : 'Validasi backup gagal.'
    throw new AppError(ERROR_CODES.BAD_REQUEST, safeMessage, 400)
  }
}

/**
 * POST /api/admin/database/restore
 * Jalankan restore database.
 */
export async function restoreDatabaseHandler(req, res) {
  let tempFilePath = null

  try {
    if (!req.file) {
      throw new AppError(ERROR_CODES.BAD_REQUEST, 'File backup wajib diupload.', 400)
    }

    tempFilePath = req.file.path
    const originalName = req.file.originalname || 'unknown.dump'

    // Validate file
    validateUploadFile(tempFilePath, originalName)

    // Validate content
    const contentValidation = await validateBackupContent(tempFilePath)
    if (!contentValidation.valid) {
      throw new AppError(
        ERROR_CODES.BAD_REQUEST,
        `File backup tidak valid: ${contentValidation.error || 'Format tidak dikenali.'}`,
        400,
      )
    }

    const userId = req.user.id
    const userName = String(req.user.nama || req.user.email || 'Unknown')

    const result = await restoreDatabase(userId, userName, tempFilePath, originalName)

    res.json({
      success: true,
      message: 'Restore database berhasil. Database telah diverifikasi.',
      data: result,
    })
  } catch (error) {
    if (error instanceof AppError) throw error

    const safeMessage = error.message
      ? error.message.replace(/password|secret|token/gi, '[REDACTED]').slice(0, 500)
      : 'Gagal melakukan restore database.'

    throw new AppError(ERROR_CODES.INTERNAL_SERVER_ERROR, safeMessage, 500)
  } finally {
    // Cleanup temp file
    if (tempFilePath) {
      try { fs.unlinkSync(tempFilePath) } catch {}
    }
  }
}

/**
 * GET /api/admin/database/audit-logs
 * Mendapatkan audit log backup/restore.
 */
export async function getAuditLogsHandler(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50))

    const result = await getAuditLogs(page, pageSize)

    res.json({
      success: true,
      data: result.logs,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    })
  } catch (error) {
    throw new AppError(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Gagal mendapatkan audit log.', 500)
  }
}