import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLocation } from '../src/utils/locationNormalizer.js'

describe('AssetsGaView Frontend Logic Tests', () => {
  test('harus memformat lokasi Aset GA dengan benar', () => {
    assert.equal(normalizeLocation('PL'), 'Pluit')
    assert.equal(normalizeLocation('GS / PL'), 'Gading Serpong - Pluit')
  })
})
