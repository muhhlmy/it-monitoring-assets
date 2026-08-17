import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TABLE_SCHEMAS, exportTableData } from '../src/controllers/exportController.js'

describe('Export API Integration Tests', () => {
  it('aset_ti schema enforces softDeleteField deleted_at IS NULL', () => {
    const asetSchema = TABLE_SCHEMAS.aset_ti
    assert.ok(asetSchema, 'Skema aset_ti harus terdefinisi')
    assert.equal(asetSchema.tableName, 'aset_ti')
    assert.equal(asetSchema.softDeleteField, 'deleted_at', 'Harus mendefinisikan softDeleteField = deleted_at')
  })

  it('exportTableData rejects invalid non-object request body with 400', async () => {
    const req = { body: null }
    const res = {
      statusCode: 200,
      jsonPayload: null,
      status(code) {
        this.statusCode = code
        return this
      },
      json(data) {
        this.jsonPayload = data
        return this
      }
    }

    await exportTableData(req, res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.jsonPayload.success, false)
  })

  it('exportTableData rejects invalid tableName with 400', async () => {
    const req = { body: { tableName: 'non_existent_table', limit: 10 } }
    const res = {
      statusCode: 200,
      jsonPayload: null,
      status(code) {
        this.statusCode = code
        return this
      },
      json(data) {
        this.jsonPayload = data
        return this
      }
    }

    await exportTableData(req, res)
    assert.equal(res.statusCode, 400)
    assert.match(res.jsonPayload.message, /tidak valid/i)
  })

  it('exportTableData rejects limit > 1000 with 400', async () => {
    const req = { body: { tableName: 'aset_ti', limit: 5000 } }
    const res = {
      statusCode: 200,
      jsonPayload: null,
      status(code) {
        this.statusCode = code
        return this
      },
      json(data) {
        this.jsonPayload = data
        return this
      }
    }

    await exportTableData(req, res)
    assert.equal(res.statusCode, 400)
    assert.match(res.jsonPayload.message, /Limit/i)
  })
})
