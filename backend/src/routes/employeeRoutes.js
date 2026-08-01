import { Router } from 'express'
import * as employeeController from '../controllers/employeeController.js'
import { authorizeAnyPermission } from '../middleware/authMiddleware.js'

export const employeeRouter = Router()

const requireEmployeeReferenceRead = authorizeAnyPermission(
  ['karyawan', 'assets', 'submissions', 'my_assets'],
  'read',
)

// /with-assets dan /locations harus sebelum /:id
employeeRouter.get(
  '/with-assets',
  requireEmployeeReferenceRead,
  employeeController.listEmployeesWithAssets,
)
employeeRouter.get(
  '/locations',
  requireEmployeeReferenceRead,
  employeeController.listLocations,
)
employeeRouter.get('/', requireEmployeeReferenceRead, employeeController.listEmployees)
