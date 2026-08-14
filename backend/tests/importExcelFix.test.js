import test from 'node:test'
import assert from 'node:assert/strict'

const { pool, withTransaction } = await import('../src/config/database.js')
const { importExcelData } = await import('../src/controllers/importController.js')

test('importExcelData: handles placeholder serial numbers and custom field headers correctly', async (t) => {
  // Test payload with multiple rows having '-' or 'Unidentified' as serial/label
  const req = {
    body: {
      karyawanRows: [],
      assetRows: [
        {
          'Label Aset': '-',
          'Serial Number': 'TEST-SN-AUTO-1001',
          'Tipe Perangkat': 'Laptop',
          'Brand/Merek': 'Lenovo',
          Model: 'ThinkPad L14',
          Status: 'Stock',
        },
        {
          'Label Aset': '-',
          'Serial Number': 'TEST-SN-AUTO-1002',
          'Tipe Perangkat': 'Laptop',
          'Brand/Merek': 'Lenovo',
          Model: 'ThinkPad L14',
          Status: 'Stock',
        },
        {
          'Label Aset': 'ESB-LAP-TEST-9901',
          'Serial Number': 'Unidentified',
          'Tipe Perangkat': 'Laptop',
          'Brand/Merek': 'Dell',
          Model: 'Latitude 3420',
          Status: 'Stock',
        },
        {
          'Label Aset': 'ESB-LAP-TEST-9902',
          'Serial Number': 'Unidentified',
          'Tipe Perangkat': 'Laptop',
          'Brand/Merek': 'Dell',
          Model: 'Latitude 3420',
          Status: 'Stock',
        },
        {
          'ID': 'ESB-ALIAS-101',
          'SN': 'SN-ALIAS-101',
          'Spec': '16GB RAM 512GB SSD',
          'Tipe': 'Desktop',
          'Brand': 'HP',
          'Status': 'Stock',
          'Lokasi': 'Garding Serpong',
        },
      ],
    },
  }

  let resBody = null
  let statusCode = 200
  const res = {
    status(code) {
      statusCode = code
      return this
    },
    json(data) {
      resBody = data
      return this
    },
  }

  // Pre-test cleanup of any previous test runs
  await pool.query(
    `UPDATE aset_ti
        SET deleted_at = CURRENT_TIMESTAMP, deletion_reason = 'Pre-test cleanup', deleted_by_user_id = 1
      WHERE label_aset IN ('ASET-TEST-SN-AUTO-1001', 'ASET-TEST-SN-AUTO-1002', 'ESB-LAP-TEST-9901', 'ESB-LAP-TEST-9902', 'ESB-ALIAS-101')`
  )

  await importExcelData(req, res)

  assert.equal(statusCode, 200)
  assert.equal(resBody.success, true)
  assert.equal(resBody.details.importedAssetCount, 5)

  // Verify created assets in database
  const createdRes = await pool.query(
    `SELECT label_aset, nomor_seri, tipe_perangkat, merek, spesifikasi, lokasi_aset
       FROM aset_ti
      WHERE deleted_at IS NULL
        AND label_aset IN ('ASET-TEST-SN-AUTO-1001', 'ASET-TEST-SN-AUTO-1002', 'ESB-LAP-TEST-9901', 'ESB-LAP-TEST-9902', 'ESB-ALIAS-101')`
  )

  assert.equal(createdRes.rows.length, 5)

  const aliasAsset = createdRes.rows.find(r => r.label_aset === 'ESB-ALIAS-101')
  assert.equal(aliasAsset.lokasi_aset, 'GS')

  // Clean up created test assets via soft delete
  await pool.query(
    `UPDATE aset_ti
        SET deleted_at = CURRENT_TIMESTAMP, deletion_reason = 'Unit test cleanup', deleted_by_user_id = 1
      WHERE label_aset IN ('ASET-TEST-SN-AUTO-1001', 'ASET-TEST-SN-AUTO-1002', 'ESB-LAP-TEST-9901', 'ESB-LAP-TEST-9902', 'ESB-ALIAS-101')`
  )
})
