import { Router } from 'express'
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js'
import { assetRouter } from './assetRoutes.js'
import { employeeRouter } from './employeeRoutes.js'
import { healthRouter } from './healthRoutes.js'
import { userRouter } from './userRoutes.js'
import { logRouter } from './logRoutes.js'
import { ticketRouter } from './ticketRoutes.js'
import authRoutes from './authRoutes.js'

export const router = Router()

router.use('/health', healthRouter)
router.use('/api/auth', authRoutes)

// Asset routes has its own internal role checks because /my is for user
router.use('/api/assets', authenticateToken, assetRouter)
router.use('/api/tickets', authenticateToken, ticketRouter)

// The following routes are strictly for admin & super admin
const requireAdmin = authorizeRoles('admin', 'super admin', 'superadmin')

router.use('/api/karyawan', authenticateToken, requireAdmin, employeeRouter)
router.use('/api/users', authenticateToken, requireAdmin, userRouter)
router.use('/api/logs', authenticateToken, requireAdmin, logRouter)

