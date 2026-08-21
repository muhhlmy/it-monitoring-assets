import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLocation } from '../src/utils/locationNormalizer.js'

describe('Location Normalizer Utility (Frontend)', () => {
  test('harus memetakan kode tunggal PL dan GS dengan benar', () => {
    assert.equal(normalizeLocation('PL'), 'Pluit')
    assert.equal(normalizeLocation('GS'), 'Gading Serpong')
  })

  test('harus memetakan kombinasi lokasi dan mempertahankan urutan asli', () => {
    assert.equal(normalizeLocation('GS / PL'), 'Gading Serpong / Pluit')
    assert.equal(normalizeLocation('PL / GS'), 'Pluit / Gading Serpong')
  })

  test('harus menangani whitespace berlebih dan case-insensitivity', () => {
    assert.equal(normalizeLocation(' PL '), 'Pluit')
    assert.equal(normalizeLocation(' GS / PL '), 'Gading Serpong / Pluit')
    assert.equal(normalizeLocation('gs/pl'), 'Gading Serpong / Pluit')
    assert.equal(normalizeLocation('pl/gs'), 'Pluit / Gading Serpong')
  })

  test('harus mempertahankan lokasi yang belum memiliki mapping', () => {
    assert.equal(normalizeLocation('JKT'), 'JKT')
    assert.equal(normalizeLocation('Solo'), 'Solo')
    assert.equal(normalizeLocation('JKT / pl'), 'JKT / Pluit')
    assert.equal(normalizeLocation('Pluit'), 'Pluit')
  })

  test('harus menangani nilai null, undefined, dan string kosong', () => {
    assert.equal(normalizeLocation(null), '')
    assert.equal(normalizeLocation(undefined), '')
    assert.equal(normalizeLocation(''), '')
    assert.equal(normalizeLocation('   '), '')
  })
})
