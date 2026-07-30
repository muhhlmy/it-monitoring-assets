import { Router } from 'express'
import {
  getExportTablesMetadata,
  exportTableData
} from '../controllers/exportController.js'
import { authorizeRoles } from '../middleware/authMiddleware.js'

export const exportRouter = Router()

// Export berisi data sensitif dan untuk sementara hanya boleh diakses superadmin.
// authenticateToken sudah diterapkan oleh parent router.
const requireSuperadmin = authorizeRoles('superadmin')

// GET /api/export/tables -> Metadata & jumlah baris semua tabel
exportRouter.get('/tables', requireSuperadmin, getExportTablesMetadata)

// POST /api/export/data -> Mengambil data kustom dari tabel dengan filter & kolom tertentu
exportRouter.post('/data', requireSuperadmin, exportTableData)
