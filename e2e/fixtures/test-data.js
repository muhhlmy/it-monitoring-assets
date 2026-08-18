export function generateUniqueId(prefix = 'E2E-AUTO') {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000)
  return `${prefix}-${timestamp}-${random}`
}

export function generateTestAsset(override = {}) {
  const id = generateUniqueId('E2E-AST')
  return {
    hostname: `HST-${id.slice(-10)}`,
    serial_number: `SN-${id.slice(-10)}`,
    spesifikasi: `E2E Test Asset Specifications (${id})`,
    tipe_perangkat: 'Laptop',
    brand_merek: 'Lenovo',
    model: 'ThinkPad E2E',
    status: 'In Use',
    kondisi: 'Normal',
    note_asset: 'Automated E2E Test Asset Item',
    ...override,
  }
}

export function generateTestTicket(override = {}) {
  const id = generateUniqueId('E2E-TCK')
  return {
    judul: `E2E Ticket Issue ${id}`,
    deskripsi: `Deskripsi tiket pengujian E2E otomatis untuk ${id}`,
    prioritas: 'Medium (3d)',
    kategori: 'IT Helpdesk',
    ...override,
  }
}

export function generateTestEmployee(override = {}) {
  const id = generateUniqueId('E2E-EMP')
  const num = Math.floor(100000 + Math.random() * 900000)
  return {
    nik: `NIK${num}`,
    nama_karyawan: `Employee ${id}`,
    email_kantor: `emp.${num}@company.com`,
    status: 'Active',
    title: 'Staff Specialist',
    job_level: 'S1',
    departemen: 'Engineering',
    directorate: 'Technology Directorate',
    tanggal_mulai_bekerja: '2023-01-15',
    employeement_status: 'Permanent',
    lokasi_kerja: 'Jakarta',
    ...override,
  }
}
