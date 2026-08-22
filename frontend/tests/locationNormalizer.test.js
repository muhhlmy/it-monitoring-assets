import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLocation } from '../src/utils/locationNormalizer.js'

describe('Location Normalizer Utility (Frontend)', () => {
  test('harus memetakan kode tunggal lokasi (GS, PL, JKT, BKS, DPK, BGR, TGR) dengan benar', () => {
    assert.equal(normalizeLocation('GS'), 'Gading Serpong')
    assert.equal(normalizeLocation('PL'), 'Pluit')
    assert.equal(normalizeLocation('JKT'), 'Jakarta')
    assert.equal(normalizeLocation('BKS'), 'Bekasi')
    assert.equal(normalizeLocation('DPK'), 'Depok')
    assert.equal(normalizeLocation('BGR'), 'Bogor')
    assert.equal(normalizeLocation('TGR'), 'Tangerang')
  })

  test('harus memetakan kombinasi lokasi GS / PL menjadi Gading Serpong - Pluit', () => {
    assert.equal(normalizeLocation('GS / PL'), 'Gading Serpong - Pluit')
    assert.equal(normalizeLocation('PL / GS'), 'Pluit - Gading Serpong')
  })

  test('harus menangani whitespace berlebih dan case-insensitivity', () => {
    assert.equal(normalizeLocation(' PL '), 'Pluit')
    assert.equal(normalizeLocation(' GS / PL '), 'Gading Serpong - Pluit')
    assert.equal(normalizeLocation('gs/pl'), 'Gading Serpong - Pluit')
    assert.equal(normalizeLocation('pl/gs'), 'Pluit - Gading Serpong')
  })

  test('harus mempertahankan lokasi yang belum memiliki mapping', () => {
    assert.equal(normalizeLocation('Solo'), 'Solo')
    assert.equal(normalizeLocation('Bandung'), 'Bandung')
  })

  test('harus menangani nilai null, undefined, dan string kosong', () => {
    assert.equal(normalizeLocation(null), '')
    assert.equal(normalizeLocation(undefined), '')
    assert.equal(normalizeLocation(''), '')
    assert.equal(normalizeLocation('   '), '')
  })
})
