import { Router } from 'express'
import * as employeeController from '../controllers/employeeController.js'

export const employeeRouter = Router()

employeeRouter.get('/', employeeController.listEmployees)
