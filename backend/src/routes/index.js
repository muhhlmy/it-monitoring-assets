import { Router } from 'express'
import { assetRouter } from './assetRoutes.js'
import { employeeRouter } from './employeeRoutes.js'
import { healthRouter } from './healthRoutes.js'
import { userRouter } from './userRoutes.js'
import { logRouter } from './logRoutes.js'

export const router = Router()

router.use('/health', healthRouter)
router.use('/api/karyawan', employeeRouter)
router.use('/api/assets', assetRouter)
router.use('/api/users', userRouter)
router.use('/api/logs', logRouter)
