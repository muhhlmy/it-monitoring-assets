import { Router } from 'express'
import { authorizeRoles } from '../middleware/authMiddleware.js'
import {
  listQueues,
  listMyQueues,
  listQueueAdmins,
  addAdminToQueue,
  removeAdminFromQueue,
} from '../controllers/queueController.js'

export const queueRouter = Router()

const requireSuperAdmin = authorizeRoles('superadmin', 'super admin')

// Semua user ter-auth bisa lihat daftar queue & queue sendiri
queueRouter.get('/',              listQueues)
queueRouter.get('/my',           listMyQueues)
queueRouter.get('/:queueId/admins', listQueueAdmins)

// Hanya superadmin bisa kelola mapping admin
queueRouter.post('/:queueId/admins',             requireSuperAdmin, addAdminToQueue)
queueRouter.delete('/:queueId/admins/:userId',   requireSuperAdmin, removeAdminFromQueue)
