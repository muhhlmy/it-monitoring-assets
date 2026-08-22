import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import os from 'node:os'
import { authorizeRoles } from '../middleware/authMiddleware.js'
import {
  getDatabaseStatusHandler,
  createBackupHandler,
  getBackupHistoryHandler,
  downloadBackupHandler,
  deleteBackupHandler,
  validateRestoreHandler,
  restoreDatabaseHandler,
  getAuditLogsHandler,
} from '../controllers/backupController.js'

export const backupRouter = Router()

// Semua endpoint backup/restore hanya untuk superadmin.
// authenticateToken sudah diterapkan oleh parent router.
const requireSuperadmin = authorizeRoles('superadmin')

// Setup multer untuk upload file restore
const upload = multer({
  dest: path.join(os.tmpdir(), 'esb-trackit-restore'),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ext === '.dump' || ext === '.sql' || ext === '.tar') {
      cb(null, true)
    } else {
      cb(new Error('Format file tidak didukung. Gunakan .dump, .sql, atau .tar.'))
    }
  },
})

// Database status
backupRouter.get('/status', requireSuperadmin, getDatabaseStatusHandler)

// Backup management
backupRouter.get('/backups', requireSuperadmin, getBackupHistoryHandler)
backupRouter.post('/backups', requireSuperadmin, createBackupHandler)
backupRouter.get('/backups/:id/download', requireSuperadmin, downloadBackupHandler)
backupRouter.delete('/backups/:id', requireSuperadmin, deleteBackupHandler)

// Restore
backupRouter.post('/restore/validate', requireSuperadmin, upload.single('backupFile'), (req, res, next) => {
  validateRestoreHandler(req, res).catch(next)
})
backupRouter.post('/restore', requireSuperadmin, upload.single('backupFile'), (req, res, next) => {
  restoreDatabaseHandler(req, res).catch(next)
})

// Audit logs
backupRouter.get('/audit-logs', requireSuperadmin, getAuditLogsHandler)