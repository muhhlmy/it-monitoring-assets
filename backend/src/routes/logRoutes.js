import { Router } from 'express'
import * as logController from '../controllers/logController.js'

export const logRouter = Router()

logRouter.get('/assets', logController.listAssetLogs)
logRouter.get('/assets/:id', logController.listAssetLogsByDevice)
logRouter.get('/audit', logController.listLoginLogs)
logRouter.post('/audit', logController.storeLoginLog)
