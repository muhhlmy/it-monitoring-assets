const columns = [
  ['ID Aset', 'id_aset'],
  ['Hostname', 'hostname'],
  ['Nomor Seri', 'nomor_seri'],
  ['Label Aset', 'label_aset'],
  ['Spesifikasi', 'spesifikasi'],
  ['NIK', 'nik'],
  ['Nama Karyawan', 'nama_karyawan'],
  ['Departemen', 'departemen'],
  ['Lokasi Kerja', 'lokasi_kerja'],
  ['Tipe Perangkat', 'tipe_perangkat'],
  ['Merek', 'merek'],
  ['Model', 'model'],
  ['Status Aset', 'status_aset'],
  ['Kondisi Aset', 'kondisi_aset'],
  ['Catatan Aset', 'catatan_aset'],
]

function csvCell(value) {
  let text = value == null ? '' : String(value)

  // Hindari nilai dari server dieksekusi sebagai formula saat CSV dibuka di spreadsheet.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`

  return `"${text.replace(/"/g, '""')}"`
}

function localDateStamp(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function downloadAssetsCsv(assets, date = new Date()) {
  if (!Array.isArray(assets) || assets.length === 0) return false

  const headerRow = columns.map(([label]) => csvCell(label)).join(',')
  const dataRows = assets.map((asset) => columns.map(([, key]) => csvCell(asset?.[key])).join(','))
  const csvContent = `\uFEFF${[headerRow, ...dataRows].join('\r\n')}`
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `Aset_IT_Export_${localDateStamp(date)}.csv`
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)

  return true
}
