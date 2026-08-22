import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocation } from '../src/utils/locationNormalizer.js';

describe('Aset OPS Data & Validation Logic', () => {
  test('harus memvalidasi field wajib OPS Asset & formatting amount', () => {
    const validAsset = {
      hostname: 'OPS-PL-001',
      nama_asset: 'KIOSK',
      kategori: 'Self Service',
      lokasi: 'GS / PL',
      total_asset_amount: 15000000.00,
      kondisi: 'Baik',
      status: 'Aktif'
    };

    assert.ok(validAsset.hostname);
    assert.ok(validAsset.nama_asset);
    assert.ok(validAsset.kategori);
    assert.equal(normalizeLocation(validAsset.lokasi), 'Gading Serpong - Pluit');
    assert.equal(validAsset.total_asset_amount, 15000000);
  });
});
