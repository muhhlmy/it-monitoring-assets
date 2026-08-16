import { Router } from 'express'
import * as logController from '../controllers/logController.js'
import { authorizePermission, authorizeRoles } from '../middleware/authMiddleware.js'

export const logRouter = Router()

const requireLogsRead = authorizePermission('logs', 'read')

// History Asset hanya Admin dan Super Admin yang bisa lihat
logRouter.get(
  '/assets',
  authorizeRoles('admin', 'superadmin'),
  requireLogsRead,
  logController.listAssetLogs,
)
logRouter.get(
  '/assets/:id',
  logController.listAssetLogsByDevice,
)
logRouter.get(
  '/audit',
  authorizeRoles('superadmin'),
  requireLogsRead,
  logController.listLoginLogs,
)
