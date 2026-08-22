import { Router } from 'express'
import {
  getExportIndex,
  getExportTablesMetadata,
  exportAssetsHandler,
  exportUsersHandler,
  exportTicketsHandler,
  exportTableData,
  resetDatabaseHandler,
} from '../controllers/exportController.js'
import { authorizeRoles } from '../middleware/authMiddleware.js'
import { exportRateLimiter } from '../middleware/rateLimitMiddleware.js'

export const exportRouter = Router()

// Export berisi data sensitif dan hanya boleh diakses superadmin.
// authenticateToken sudah diterapkan oleh parent router.
const requireSuperadmin = authorizeRoles('superadmin')

exportRouter.use(exportRateLimiter)

// GET /api/export -> Root capability manifest index
exportRouter.get('/', requireSuperadmin, getExportIndex)

// GET /api/export/tables -> Metadata & jumlah baris semua tabel
exportRouter.get('/tables', requireSuperadmin, getExportTablesMetadata)

// GET /api/export/assets -> Direct CSV/JSON file download for assets
exportRouter.get('/assets', requireSuperadmin, exportAssetsHandler)

// GET /api/export/users -> Direct CSV/JSON file download for users (strictly excludes secrets)
exportRouter.get('/users', requireSuperadmin, exportUsersHandler)

// GET /api/export/tickets -> Direct CSV/JSON file download for tickets
exportRouter.get('/tickets', requireSuperadmin, exportTicketsHandler)

// POST /api/export/data -> Mengambil data kustom dari tabel dengan filter & kolom tertentu
exportRouter.post('/data', requireSuperadmin, exportTableData)

// POST /api/export/reset-database -> Reset & kosongkan seluruh tabel database
exportRouter.post('/reset-database', requireSuperadmin, resetDatabaseHandler)
