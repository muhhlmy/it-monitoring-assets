import { Router } from 'express'
import * as employeeController from '../controllers/employeeController.js'

export const employeeRouter = Router()

// /with-assets dan /locations harus sebelum /:id
employeeRouter.get('/with-assets', employeeController.listEmployeesWithAssets)
employeeRouter.get('/locations', employeeController.listLocations)
employeeRouter.get('/', employeeController.listEmployees)
