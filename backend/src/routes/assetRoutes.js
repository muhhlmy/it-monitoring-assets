import { Router } from 'express'
import * as assetController from '../controllers/assetController.js'

export const assetRouter = Router()

// /stats harus ditulis sebelum /:id agar kata "stats" tidak dianggap sebagai ID.
assetRouter.get('/stats', assetController.showAssetStats)
assetRouter.get('/', assetController.listAssets)
assetRouter.get('/:id', assetController.showAsset)
assetRouter.post('/', assetController.storeAsset)
assetRouter.put('/:id', assetController.replaceAsset)
assetRouter.delete('/:id', assetController.destroyAsset)
