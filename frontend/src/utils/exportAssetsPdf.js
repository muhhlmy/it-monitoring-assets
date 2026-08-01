import { escapeHtml, printHtmlDocument, safeCssToken } from './printDocument.js'

export function downloadAssetsPdf(assets, filters = {}, date = new Date()) {
  if (!Array.isArray(assets) || assets.length === 0) return false

  const dateString = escapeHtml(
    date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
  )
  
  // Build table rows
  const rowsHtml = assets.map(rawAsset => {
    const asset = Object.fromEntries(
      Object.entries(rawAsset || {}).map(([key, value]) => [key, escapeHtml(value)]),
    )
    const statusClass = safeCssToken(rawAsset?.status_aset)

    return `
    <tr>
      <td class="font-mono">${asset.id_aset}</td>
      <td>
        <div class="font-bold">${asset.label_aset}</div>
        <div class="text-muted font-mono small">${asset.nomor_seri || '—'}</div>
      </td>
      <td>
        <div class="font-bold">${[asset.merek, asset.model].filter(Boolean).join(' ') || '—'}</div>
        <div class="text-muted small">${asset.spesifikasi || ''}</div>
      </td>
      <td>
        <div>${asset.nama_karyawan || 'Belum ditetapkan'}</div>
        <div class="text-muted font-mono small">${asset.nik || '—'}</div>
      </td>
      <td>${asset.lokasi_kerja || '—'}</td>
      <td>${asset.tipe_perangkat || '—'}</td>
      <td><span class="badge badge-${statusClass}">${asset.status_aset || '—'}</span></td>
      <td>${asset.kondisi_aset || '—'}</td>
    </tr>
  `
  }).join('')

  const statusFilter = escapeHtml(filters.status || 'Semua Status')
  const tipeFilter = escapeHtml(filters.tipe || 'Semua Tipe')

  const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Laporan Inventaris Aset IT</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 12mm 15mm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #172033;
          background: #ffffff;
          margin: 0;
          padding: 0;
          font-size: 11px;
          line-height: 1.4;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #FC841B;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .title h1 {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          color: #0252B3;
          letter-spacing: -0.02em;
        }
        .title p {
          margin: 4px 0 0 0;
          font-size: 11px;
          color: #64748b;
          font-weight: 500;
        }
        .meta-info {
          text-align: right;
          font-size: 10px;
          color: #475569;
        }
        .meta-info table {
          border-collapse: collapse;
          margin-left: auto;
        }
        .meta-info td {
          padding: 2px 6px;
          text-align: right;
        }
        .meta-info td.label {
          color: #94A3B8;
          font-weight: bold;
          text-transform: uppercase;
          font-size: 8px;
          letter-spacing: 0.05em;
        }
        .summary-cards {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }
        .card {
          flex: 1;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px;
          background: #f8fafc;
        }
        .card .card-label {
          font-size: 8px;
          font-weight: bold;
          color: #94A3B8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }
        .card .card-value {
          font-size: 14px;
          font-weight: bold;
          color: #172033;
        }
        table.data-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        table.data-table th {
          background: #f8fafc;
          border-bottom: 2px solid #e2e8f0;
          color: #475569;
          font-weight: bold;
          text-transform: uppercase;
          font-size: 9px;
          padding: 8px 10px;
          text-align: left;
          letter-spacing: 0.05em;
        }
        table.data-table td {
          padding: 8px 10px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: top;
          font-size: 10px;
        }
        table.data-table tr:nth-child(even) td {
          background: #fafbfc;
        }
        .font-mono {
          font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        .font-bold {
          font-weight: 700;
        }
        .text-muted {
          color: #64748b;
        }
        .small {
          font-size: 9px;
        }
        .badge {
          display: inline-block;
          padding: 2px 6px;
          font-size: 8px;
          font-weight: bold;
          border-radius: 9999px;
          text-transform: uppercase;
        }
        .badge-tersedia { background: #ECFDF5; color: #087A55; border: 1px solid #C7F0DF; }
        .badge-digunakan { background: #EDF5FF; color: #1763BE; border: 1px solid #CFE3FA; }
        .badge-maintenance { background: #FFF8E6; color: #A15C05; border: 1px solid #F8E3AF; }
        .badge-rusak { background: #FFF0F0; color: #C33737; border: 1px solid #F7CCCC; }
        .badge-disposal { background: #F1F5F9; color: #526175; border: 1px solid #DCE3EC; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">
          <h1>Laporan Inventaris Aset IT</h1>
          <p>Daftar lengkap inventaris perangkat IT perusahaan</p>
        </div>
        <div class="meta-info">
          <table>
            <tr><td class="label">Tanggal Cetak:</td><td>${dateString}</td></tr>
            <tr><td class="label">Status Filter:</td><td>${statusFilter}</td></tr>
            <tr><td class="label">Tipe Filter:</td><td>${tipeFilter}</td></tr>
          </table>
        </div>
      </div>

      <div class="summary-cards">
        <div class="card">
          <div class="card-label">Total Aset Diekspor</div>
          <div class="card-value">${assets.length} Unit</div>
        </div>
        <div class="card">
          <div class="card-label">Status Terfilter</div>
          <div class="card-value">${statusFilter}</div>
        </div>
        <div class="card">
          <div class="card-label">Tipe Terfilter</div>
          <div class="card-value">${tipeFilter}</div>
        </div>
        <div class="card">
          <div class="card-label">Sistem</div>
          <div class="card-value">AssetWise ITAM</div>
        </div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 50px;">ID</th>
            <th style="width: 150px;">Serial / Label</th>
            <th style="width: 250px;">Spesifikasi</th>
            <th>Pemegang</th>
            <th>Lokasi</th>
            <th>Tipe</th>
            <th style="width: 80px;">Status</th>
            <th style="width: 80px;">Kondisi</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

    </body>
    </html>
  `
  return printHtmlDocument(
    html,
    'Pop-up terblokir. Harap izinkan pop-up untuk mencetak PDF.',
  )
}
