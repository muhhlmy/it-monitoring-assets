import { Router } from 'express'
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js'
import { assetRouter }    from './assetRoutes.js'
import { employeeRouter } from './employeeRoutes.js'
import { healthRouter }   from './healthRoutes.js'
import { userRouter }     from './userRoutes.js'
import { logRouter }      from './logRoutes.js'
import { ticketRouter }   from './ticketRoutes.js'
import { queueRouter }    from './queueRoutes.js'
import authRoutes from './authRoutes.js'

export const router = Router()

router.use('/health',     healthRouter)
router.use('/api/auth',   authRoutes)

router.use('/api/assets',        authenticateToken, assetRouter)
router.use('/api/tickets',       authenticateToken, ticketRouter)
router.use('/api/ticket-queues', authenticateToken, queueRouter)

const requireAdmin = authorizeRoles('admin', 'super admin', 'superadmin')

router.use('/api/karyawan', authenticateToken, requireAdmin, employeeRouter)
router.use('/api/users',    authenticateToken, requireAdmin, userRouter)
router.use('/api/logs',     authenticateToken, requireAdmin, logRouter)
