import { Router } from 'express'
import * as assetController from '../controllers/assetController.js'
import {
  authorizeAnyPermission,
  authorizePermission,
  authorizeRoles,
} from '../middleware/authMiddleware.js'

export const assetRouter = Router()

const requireAdmin = authorizeRoles('admin', 'super admin')
const requireAssetsRead = authorizePermission('assets', 'read')
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

// Selain /my, hanya admin yang boleh akses
assetRouter.use(requireAdmin)

assetRouter.get('/stats',
  authorizeAnyPermission(['dashboard', 'assets'], 'read'),
  assetController.showAssetStats
)

assetRouter.get('/cycle/:nik',
  authorizeAnyPermission(['my_assets', 'assets'], 'read'),
  assetController.getDeviceCycleByNik
)

assetRouter.get('/',
  authorizeAnyPermission(['assets', 'submissions'], 'read'),
  assetController.listAssets
)

assetRouter.get('/:id', requireAssetsRead, assetController.fetchAsset)
assetRouter.post('/', requireAssetsWrite, assetController.addAsset)
assetRouter.put('/:id', requireAssetsWrite, assetController.replaceAsset)
assetRouter.delete('/:id', requireAssetsWrite, assetController.deleteAsset)
