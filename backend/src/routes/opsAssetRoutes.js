import { Router } from 'express'
import * as opsAssetController from '../controllers/opsAssetController.js'
import {
  authorizeAnyPermission,
  authorizePermission,
  authorizeRoles,
} from '../middleware/authMiddleware.js'

export const opsAssetRouter = Router()

const requireAdmin = authorizeRoles('admin', 'super admin', 'superadmin')
const requireOpsRead = authorizeAnyPermission(['assets_ops', 'assets'], 'read')
const requireOpsWrite = authorizeAnyPermission(['assets_ops', 'assets'], 'write')

opsAssetRouter.use(requireAdmin)

opsAssetRouter.get('/', requireOpsRead, opsAssetController.listOpsAssets)
opsAssetRouter.get('/:id', requireOpsRead, opsAssetController.fetchOpsAsset)
opsAssetRouter.post('/', requireOpsWrite, opsAssetController.addOpsAsset)
opsAssetRouter.put('/:id', requireOpsWrite, opsAssetController.replaceOpsAsset)
opsAssetRouter.delete('/:id', requireOpsWrite, opsAssetController.deleteOpsAsset)
