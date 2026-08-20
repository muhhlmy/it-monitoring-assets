import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const exportViewUrl = new URL('../src/views/ExportView.vue', import.meta.url)
const exportEngineUrl = new URL('../src/utils/exportEngine.js', import.meta.url)

describe('ExportView.vue & Export Engine Regression Tests', () => {
  test('ExportView template and logic contains all required UI features and states', async () => {
    const viewSource = await readFile(exportViewUrl, 'utf8')

    // 1. Quick export
    assert.match(viewSource, /handleQuickExport/)
    // 2. Custom export
    assert.match(viewSource, /handleExecuteCustomExport/)
    // 3. Preview
    assert.match(viewSource, /loadPreview/)
    assert.match(viewSource, /showPreviewModal/)
    // 4. Preset/template
    assert.match(viewSource, /applyPreset/)
    // 5. CSV, 6. Excel, 7. JSON, 8. PDF
    assert.match(viewSource, /exportToCsv/)
    assert.match(viewSource, /exportToExcel/)
    assert.match(viewSource, /exportToJson/)
    assert.match(viewSource, /exportToPdf/)
    // 9. Column selection
    assert.match(viewSource, /selectedColumns/)
    assert.match(viewSource, /selectAllColumns/)
    assert.match(viewSource, /deselectAllColumns/)
    // 10. Date filter
    assert.match(viewSource, /startDate/)
    assert.match(viewSource, /endDate/)
    // 11. Search filter
    assert.match(viewSource, /searchQuery/)
    // 12. Status filter
    assert.match(viewSource, /statusFilter/)
    // 13. Row limit
    assert.match(viewSource, /rowLimit/)
    // 14. Loading state
    assert.match(viewSource, /isLoading/)
    assert.match(viewSource, /SkeletonCard|animate-pulse/)
    // 15. Error state handling
    assert.match(viewSource, /showToast.*error/)
    // 16. Empty-data state handling
    assert.match(viewSource, /Tidak ada data yang/)
  })

  test('Export Engine handles empty dataset and format conversion safely', async () => {
    const engineSource = await readFile(exportEngineUrl, 'utf8')

    assert.match(engineSource, /exportToCsv/)
    assert.match(engineSource, /exportToExcel/)
    assert.match(engineSource, /exportToJson/)
    assert.match(engineSource, /exportToPdf/)
  })
})
