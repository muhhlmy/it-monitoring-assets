import { Router } from 'express'
import {
  getExportTablesMetadata,
  exportTableData,
  exportFullDatabase
} from '../controllers/exportController.js'

export const exportRouter = Router()

// GET /api/export/tables -> Metadata & jumlah baris semua tabel
exportRouter.get('/tables', getExportTablesMetadata)

// POST /api/export/data -> Mengambil data kustom dari tabel dengan filter & kolom tertentu
exportRouter.post('/data', exportTableData)

// GET /api/export/full-db -> Download snapshot full database
exportRouter.get('/full-db', exportFullDatabase)
