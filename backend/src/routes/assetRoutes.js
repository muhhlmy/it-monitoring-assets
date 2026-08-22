import { Router } from 'express'
import * as assetController from '../controllers/assetController.js'
import {
  authorizeAnyPermission,
  authorizePermission,
  authorizeRoles,
} from '../middleware/authMiddleware.js'

export const assetRouter = Router()

const requireAdmin = authorizeRoles('admin', 'super admin', 'superadmin')
const requireAssetsWrite = authorizePermission('assets', 'write')

// /my dan /my-assets bisa diakses semua role yang sudah login
assetRouter.get('/my', 
  authorizePermission('my_assets', 'read'),
  assetController.listMyAssets
)
assetRouter.get('/my-assets', 
  authorizePermission('my_assets', 'read'),
  assetController.listMyAssets
)

assetRouter.get('/cycle/:nik',
  authorizeAnyPermission(['my_assets', 'assets'], 'read'),
  assetController.getDeviceCycleByNik
)

assetRouter.get('/stats',
  authorizeAnyPermission(['dashboard', 'assets'], 'read'),
  assetController.showAssetStats
)

// GET /:id is guarded by resource-level authorization in fetchAsset controller (allows non-admin users to read own asset)
assetRouter.get('/:id', assetController.fetchAsset)

// Admin-only endpoints below
assetRouter.use(requireAdmin)

assetRouter.get('/',
  authorizeAnyPermission(['assets', 'submissions'], 'read'),
  assetController.listAssets
)

assetRouter.post('/', requireAssetsWrite, assetController.addAsset)
assetRouter.put('/:id', requireAssetsWrite, assetController.replaceAsset)
assetRouter.delete('/:id', requireAssetsWrite, assetController.deleteAsset)
