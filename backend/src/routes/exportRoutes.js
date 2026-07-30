import { Router } from 'express'
import {
  getExportTablesMetadata,
  exportTableData
} from '../controllers/exportController.js'

export const exportRouter = Router()

// GET /api/export/tables -> Metadata & jumlah baris semua tabel
exportRouter.get('/tables', getExportTablesMetadata)

// POST /api/export/data -> Mengambil data kustom dari tabel dengan filter & kolom tertentu
exportRouter.post('/data', exportTableData)
