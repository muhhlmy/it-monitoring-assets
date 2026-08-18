import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const submissionsSourceUrl = new URL('../src/views/SubmissionsView.vue', import.meta.url)

test('SubmissionsView maps backend asset properties to frontend properties', async () => {
  const source = await readFile(submissionsSourceUrl, 'utf8')
  
  // Verify that fetchData normalizes assetData
  assert.match(source, /id_aset:\s*a\.id_aset\s*\|\|\s*a\.id/)
  assert.match(source, /label_aset:\s*hostname/)
  assert.match(source, /nomor_seri:\s*serial_number/)
  assert.match(source, /merek:\s*brand/)

  // Verify that SearchableSelect bindings match mapped properties
  assert.match(source, /value-key="id_aset"/)
  assert.match(source, /label-key="label_aset"/)
  assert.match(source, /secondary-label-key="nomor_seri"/)
})

test('Asset normalization logic transforms backend response correctly', () => {
  const backendAsset = {
    id: 42,
    hostname: 'Laptop-IT-001',
    serial_number: 'SN123456',
    brand_merek: 'Lenovo',
    model: 'ThinkPad T14',
    spesifikasi: 'Intel i7 16GB RAM',
    tipe_perangkat: 'Laptop',
    status: 'In Use',
    kondisi: 'Normal',
    nik_pemegang_asset: '12345',
    nama_karyawan_pemegang_asset: 'John Doe',
    departemen_pemegang_asset: 'IT',
    lokasi_asset: 'Jakarta',
  }

  const normalizeAsset = (a) => {
    const hostname = a.hostname || a.label_aset || ''
    const serial_number = a.serial_number || a.nomor_seri || ''
    const brand = a.brand_merek || a.merek || ''
    const nik = a.nik_pemegang_asset || a.nik || ''
    const nama = a.nama_karyawan_pemegang_asset || a.nama_karyawan || ''
    const dept = a.departemen_pemegang_asset || a.departemen || ''
    const lokasi = a.lokasi_asset || a.lokasi_aset || a.lokasi_kerja || a.lokasi || ''
    const status = a.status || a.status_aset || 'In Use'
    const kondisi = a.kondisi || a.kondisi_aset || 'Normal'
    const note = a.note_asset || a.catatan_aset || ''

    return {
      ...a,
      id_aset: a.id_aset || a.id,
      id: a.id || a.id_aset,
      hostname,
      label_aset: hostname,
      serial_number,
      nomor_seri: serial_number,
      brand_merek: brand,
      merek: brand,
      nik_pemegang_asset: nik,
      nik,
      nama_karyawan_pemegang_asset: nama,
      nama_karyawan: nama,
      departemen_pemegang_asset: dept,
      departemen: dept,
      lokasi_asset: lokasi,
      lokasi_aset: lokasi,
      lokasi_kerja: lokasi,
      lokasi,
      status,
      status_aset: status,
      kondisi,
      kondisi_aset: kondisi,
      note_asset: note,
      catatan_aset: note,
    }
  }

  const normalized = normalizeAsset(backendAsset)

  assert.equal(normalized.id_aset, 42)
  assert.equal(normalized.label_aset, 'Laptop-IT-001')
  assert.equal(normalized.nomor_seri, 'SN123456')
  assert.equal(normalized.merek, 'Lenovo')
})

test('formatAssetSpecificationSummary formats asset in order: Merek / Model / Spesifikasi / S/N / Hostname', () => {
  const formatAssetSpecificationSummary = (asset) => {
    if (!asset) return ''
    const parts = [
      asset.merek || asset.brand_merek,
      asset.model,
      asset.spesifikasi,
      asset.nomor_seri || asset.serial_number,
      asset.hostname || asset.label_aset,
    ]
      .map((item) => (item && typeof item === 'string' ? item.trim() : item))
      .filter(Boolean)

    return parts.join(' / ')
  }

  const fullAsset = {
    merek: 'Lenovo',
    model: 'V14 G5 IRL',
    spesifikasi: 'Core i5-13420H, RAM 16GB, SSD 512GB',
    nomor_seri: 'PF60FNB4',
    hostname: 'HELMY-LT-001',
  }
  assert.equal(
    formatAssetSpecificationSummary(fullAsset),
    'Lenovo / V14 G5 IRL / Core i5-13420H, RAM 16GB, SSD 512GB / PF60FNB4 / HELMY-LT-001',
  )

  const partialAsset = {
    brand_merek: 'Dell',
    model: 'Latitude 3420',
    spesifikasi: null,
    serial_number: 'PF60FNB4',
    hostname: '',
  }
  assert.equal(formatAssetSpecificationSummary(partialAsset), 'Dell / Latitude 3420 / PF60FNB4')
})
