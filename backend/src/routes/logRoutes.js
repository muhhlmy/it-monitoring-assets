import { Router } from 'express'
import * as logController from '../controllers/logController.js'
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js'

export const logRouter = Router()

logRouter.use(authenticateToken)

// History Asset hanya Admin dan Super Admin yang bisa lihat
logRouter.get('/assets', authorizeRoles('admin', 'superadmin'), logController.listAssetLogs)
logRouter.get('/assets/:id', authorizeRoles('admin', 'superadmin'), logController.listAssetLogsByDevice)
logRouter.get('/audit', authorizeRoles('superadmin'), logController.listLoginLogs)
