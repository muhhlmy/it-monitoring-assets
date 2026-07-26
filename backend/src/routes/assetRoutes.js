import { Router } from 'express'
import * as assetController from '../controllers/assetController.js'
import { authorizeRoles } from '../middleware/authMiddleware.js'

export const assetRouter = Router()

const requireAdmin = authorizeRoles('admin', 'super admin')

// /my bisa diakses semua role yang sudah login
assetRouter.get('/my', assetController.listMyAssets)

// Selain /my, hanya admin yang boleh akses
assetRouter.use(requireAdmin)

assetRouter.get('/stats', assetController.showAssetStats)
assetRouter.get('/cycle/:nik', assetController.getDeviceCycleByNik)
assetRouter.get('/', assetController.listAssets)
assetRouter.get('/:id', assetController.showAsset)
assetRouter.post('/', assetController.storeAsset)
assetRouter.put('/:id', assetController.replaceAsset)
assetRouter.delete('/:id', assetController.destroyAsset)
