import { Router } from 'express'
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js'
import { assetRouter }    from './assetRoutes.js'
import { gaAssetRouter }  from './gaAssetRoutes.js'
import { opsAssetRouter } from './opsAssetRoutes.js'
import { employeeRouter } from './employeeRoutes.js'
import { healthRouter }   from './healthRoutes.js'
import { userRouter }     from './userRoutes.js'
import { logRouter }      from './logRoutes.js'
import { ticketRouter }   from './ticketRoutes.js'
import { queueRouter }    from './queueRoutes.js'
import { exportRouter }   from './exportRoutes.js'
import importRouter       from './importRoutes.js'
import authRoutes from './authRoutes.js'
import { apiRateLimiter } from '../middleware/rateLimitMiddleware.js'

export const router = Router()

router.use('/health',     healthRouter)
router.use('/api',        apiRateLimiter)
router.use('/api/auth',   authRoutes)

// Canonical RESTful endpoints & backward-compatible aliases
router.use('/api/assets',        authenticateToken, assetRouter)
router.use('/api/ga-assets',     authenticateToken, gaAssetRouter)
router.use('/api/assets-ga',     authenticateToken, gaAssetRouter)
router.use('/api/assets_ga',     authenticateToken, gaAssetRouter) // Deprecated snake_case alias
router.use('/api/ops-assets',    authenticateToken, opsAssetRouter)
router.use('/api/assets-ops',    authenticateToken, opsAssetRouter)
router.use('/api/assets_ops',    authenticateToken, opsAssetRouter) // Deprecated snake_case alias
router.use('/api/tickets',       authenticateToken, ticketRouter)
router.use('/api/ticket-queues', authenticateToken, queueRouter)
router.use('/api/export',        authenticateToken, exportRouter)

const requireAdmin = authorizeRoles('admin', 'super admin', 'superadmin')

router.use('/api/employees', authenticateToken, requireAdmin, employeeRouter) // Canonical endpoint
router.use('/api/karyawan',  authenticateToken, requireAdmin, employeeRouter) // Legacy alias
router.use('/api/users',     authenticateToken, requireAdmin, userRouter)
router.use('/api/logs',      authenticateToken, requireAdmin, logRouter)
router.use('/api/import',    authenticateToken, requireAdmin, importRouter)
