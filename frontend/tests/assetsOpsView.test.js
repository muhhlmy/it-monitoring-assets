import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { formatCurrency, parseCurrency } from '../src/utils/currencyFormatter.js'
import { normalizeLocation } from '../src/utils/locationNormalizer.js'

describe('AssetsOpsView Frontend & Currency Formatter Tests', () => {
  test('harus memformat angka menjadi string mata uang Rupiah', () => {
    assert.equal(formatCurrency(15000000), 'Rp 15.000.000')
    assert.equal(formatCurrency(8500000), 'Rp 8.500.000')
    assert.equal(formatCurrency(0), 'Rp 0')
  })

  test('harus memparsing string mata uang Rupiah kembali ke numerik', () => {
    assert.equal(parseCurrency('Rp 15.000.000'), 15000000)
    assert.equal(parseCurrency('15.000.000'), 15000000)
    assert.equal(parseCurrency('Rp 8.500.000'), 8500000)
    assert.equal(parseCurrency(''), 0)
  })

  test('harus memformat lokasi Aset OPS dengan benar', () => {
    assert.equal(normalizeLocation('GS'), 'Gading Serpong')
    assert.equal(normalizeLocation('pl/gs'), 'Pluit - Gading Serpong')
  })
})
