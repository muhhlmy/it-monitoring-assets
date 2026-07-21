import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateAssetId,
  validateAssetPayload,
} from '../src/controllers/assetController.js'

function testCleanAssetText() {
  const input = {
    label_aset: '  ESB-LAP-001  ',
    nomor_seri: '  SN-001  ',
    lokasi_aset: '  Gudang IT Lt. 2  ',
  }

  const result = validateAssetPayload(input)

  assert.equal(result.label_aset, 'ESB-LAP-001')
  assert.equal(result.nomor_seri, 'SN-001')
  assert.equal(result.lokasi_aset, 'Gudang IT Lt. 2')
  assert.equal(result.spesifikasi, null)
}

function testAssignedAssetUsesEmployeeLocation() {
  const result = validateAssetPayload({
    label_aset: 'ESB-LAP-002',
    nik: 'EMP-001',
    lokasi_aset: 'Lokasi yang tidak boleh disimpan',
  })

  assert.equal(result.nik, 'EMP-001')
  assert.equal(result.lokasi_aset, null)
}

function testMissingAssetLabel() {
  function runInvalidInput() {
    validateAssetPayload({ nomor_seri: 'SN-001' })
  }

  assert.throws(runInvalidInput, { message: 'Label aset wajib diisi.' })
}

function testInvalidAssetId() {
  function runInvalidTextId() {
    validateAssetId('abc')
  }

  function runZeroId() {
    validateAssetId('0')
  }

  assert.equal(validateAssetId('12'), '12')
  assert.throws(runInvalidTextId, { message: 'ID aset tidak valid.' })
  assert.throws(runZeroId, { message: 'ID aset tidak valid.' })
}

test('membersihkan spasi pada payload aset', testCleanAssetText)
test('mengosongkan lokasi mandiri saat aset di-assign ke karyawan', testAssignedAssetUsesEmployeeLocation)
test('menolak payload tanpa label aset', testMissingAssetLabel)
test('menolak ID aset yang bukan bilangan positif', testInvalidAssetId)
