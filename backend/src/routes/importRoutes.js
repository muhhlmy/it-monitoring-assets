import { Router } from 'express'
import { importExcelData } from '../controllers/importController.js'
import { authorizeAnyPermission } from '../middleware/authMiddleware.js'

export const importRouter = Router()

const requireImportWrite = authorizeAnyPermission(
  ['karyawan', 'assets', 'users'],
  'write',
)

importRouter.post('/excel', requireImportWrite, importExcelData)

export default importRouter
