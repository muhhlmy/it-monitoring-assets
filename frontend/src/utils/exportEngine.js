/**
 * exportEngine.js
 * Utilitas serbaguna untuk mengekspor data ke format CSV, JSON, Excel (.xls), dan PDF Laporan.
 */

function formatDateStamp(date = new Date()) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}${mm}${dd}_${hh}${min}`
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Ekspor Data ke CSV (UTF-8 BOM untuk MS Excel)
 */
export function exportToCsv(data, columns = [], filenamePrefix = 'Export_Data') {
  if (!Array.isArray(data) || data.length === 0) return false

  const colKeys = columns.length > 0 ? columns.map(c => c.name) : Object.keys(data[0])
  const colLabels = columns.length > 0 ? columns.map(c => c.label) : colKeys

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""'
    let str = typeof val === 'object' ? JSON.stringify(val) : String(val)
    str = str.replace(/"/g, '""')
    return `"${str}"`
  }

  const headerRow = colLabels.map(escapeCsv).join(',')
  const dataRows = data.map(row => colKeys.map(key => escapeCsv(row[key])).join(','))

  const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const filename = `${filenamePrefix}_${formatDateStamp()}.csv`
  
  triggerDownload(blob, filename)
  return true
}

/**
 * Ekspor Data ke JSON (Format Backup / API Raw)
 */
export function exportToJson(data, filenamePrefix = 'Export_Data') {
  if (!data) return false

  const jsonString = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' })
  const filename = `${filenamePrefix}_${formatDateStamp()}.json`
  
  triggerDownload(blob, filename)
  return true
}

/**
 * Ekspor Data ke Excel Spreadsheet (.xls - HTML XML Table)
 */
export function exportToExcel(data, columns = [], tableName = 'Data', filenamePrefix = 'Export_Data') {
  if (!Array.isArray(data) || data.length === 0) return false

  const colKeys = columns.length > 0 ? columns.map(c => c.name) : Object.keys(data[0])
  const colLabels = columns.length > 0 ? columns.map(c => c.label) : colKeys

  const headerHtml = colLabels.map(l => `<th style="background-color: #0252B3; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #dcdcdc;">${l}</th>`).join('')
  
  const rowsHtml = data.map(row => {
    const cells = colKeys.map(key => {
      let val = row[key]
      if (val === null || val === undefined) val = ''
      if (typeof val === 'object') val = JSON.stringify(val)
      return `<td style="padding: 8px; border: 1px solid #e2e8f0; vertical-align: top;">${String(val)}</td>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')

  const excelHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>${tableName}</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; }
        table { border-collapse: collapse; width: 100%; }
      </style>
    </head>
    <body>
      <h2 style="color: #0252B3; font-family: Arial, sans-serif;">Laporan Data: ${tableName}</h2>
      <p style="color: #64748b; font-size: 11px;">Tanggal Ekspor: ${new Date().toLocaleString('id-ID')}</p>
      <table>
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body>
    </html>
  `

  const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const filename = `${filenamePrefix}_${formatDateStamp()}.xls`
  
  triggerDownload(blob, filename)
  return true
}

/**
 * Ekspor Data ke PDF Laporan Berformat Profesional
 */
export function exportToPdf(data, columns = [], tableName = 'Data', title = 'Laporan Ekspor Data', filters = {}) {
  if (!Array.isArray(data) || data.length === 0) return false

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Pop-up terblokir. Harap izinkan pop-up peramban untuk melihat / mengunduh PDF.')
    return false
  }

  const colKeys = columns.length > 0 ? columns.map(c => c.name) : Object.keys(data[0])
  const colLabels = columns.length > 0 ? columns.map(c => c.label) : colKeys

  const headerTh = colLabels.map(l => `<th>${l}</th>`).join('')
  
  const bodyTrs = data.map((row, idx) => {
    const cells = colKeys.map(key => {
      let val = row[key]
      if (val === null || val === undefined) val = '—'
      if (typeof val === 'boolean') val = val ? 'Aktif' : 'Non-Aktif'
      if (typeof val === 'object') val = JSON.stringify(val)
      return `<td>${String(val)}</td>`
    }).join('')
    return `<tr class="${idx % 2 === 0 ? 'even' : 'odd'}">${cells}</tr>`
  }).join('')

  const filterSummary = Object.entries(filters)
    .filter(([_, v]) => v && v !== 'all' && v !== 'semua')
    .map(([k, v]) => `<span><strong>${k}:</strong> ${v}</span>`)
    .join(' | ') || 'Semua Data'

  const dateStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>${title} - ${tableName}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm 15mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1e293b; margin: 0; padding: 0; font-size: 10px; line-height: 1.4; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #5D87FF; padding-bottom: 12px; margin-bottom: 15px; }
        .title h1 { margin: 0; font-size: 18px; color: #1e293b; font-weight: 800; }
        .title p { margin: 3px 0 0 0; color: #64748b; font-size: 10px; }
        .meta { text-align: right; font-size: 9px; color: #64748b; }
        .stats-bar { display: flex; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; margin-bottom: 15px; }
        .stat-item { flex: 1; }
        .stat-label { font-size: 8px; font-weight: bold; text-transform: uppercase; color: #94a3b8; }
        .stat-value { font-size: 12px; font-weight: bold; color: #0f172a; }
        table.data-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        table.data-table th { background: #5D87FF; color: #ffffff; text-transform: uppercase; font-size: 8px; font-weight: 700; padding: 7px 8px; text-align: left; letter-spacing: 0.03em; }
        table.data-table td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; font-size: 9px; word-break: break-word; }
        table.data-table tr.even { background: #ffffff; }
        table.data-table tr.odd { background: #f8fafc; }
        .footer { margin-top: 20px; border-top: 1px solid #e2e8f0; pt: 8px; font-size: 8px; color: #94a3b8; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">
          <h1>${title}</h1>
          <p>Tabel Database: <strong>${tableName}</strong> | IT Monitoring Assets System</p>
        </div>
        <div class="meta">
          <div>Tanggal Cetak: <strong>${dateStr}</strong></div>
          <div>Filter Applied: ${filterSummary}</div>
        </div>
      </div>

      <div class="stats-bar">
        <div class="stat-item">
          <div class="stat-label">Total Record Diekspor</div>
          <div class="stat-value">${data.length} Baris</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Jumlah Kolom Terpilih</div>
          <div class="stat-value">${colKeys.length} Kolom</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Sumber Sistem</div>
          <div class="stat-value">ESB AssetWise Platform</div>
        </div>
      </div>

      <table class="data-table">
        <thead><tr>${headerTh}</tr></thead>
        <tbody>${bodyTrs}</tbody>
      </table>

      <div class="footer">
        Dicetak secara otomatis oleh Sistem Monitoring Aset IT • Dokumentasi Internal & Audit
      </div>

      <script>
        window.onload = function() {
          window.print();
          window.onafterprint = function() { window.close(); };
        };
      </script>
    </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
  return true
}
