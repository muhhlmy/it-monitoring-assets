import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, extractNik, normalizeDate } from '../src/controllers/importController.js';

describe('Import NIK & Text Extractor Logic', () => {
  test('harus mengekstrak NIK murni dari format "NIK - Nama Karyawan"', () => {
    assert.equal(extractNik('2021039 - Muhammad Helmy'), '2021039');
    assert.equal(extractNik('20140002 - Budi Santoso'), '20140002');
  });

  test('harus mengekstrak NIK murni dari format "NIK-Nama Karyawan" atau "NIK (Nama)"', () => {
    assert.equal(extractNik('2021039-Muhammad Helmy'), '2021039');
    assert.equal(extractNik('2021039 (Muhammad Helmy)'), '2021039');
  });

  test('harus mempertahankan NIK murni tanpa nama', () => {
    assert.equal(extractNik('2021039'), '2021039');
    assert.equal(extractNik('NK-2026-001'), 'NK-2026-001');
  });

  test('harus mengubah "-", "--", "N/A", dan string kosong menjadi null', () => {
    assert.equal(extractNik('-'), null);
    assert.equal(extractNik('--'), null);
    assert.equal(extractNik('---'), null);
    assert.equal(extractNik(''), null);
    assert.equal(extractNik('   '), null);
    assert.equal(extractNik('N/A'), null);
    assert.equal(extractNik(null), null);
    assert.equal(extractNik(undefined), null);
  });

  test('harus memetakan format tanggal "12-Okt-2025" dan sejenisnya ke "YYYY-MM-DD"', () => {
    assert.equal(normalizeDate('12-Okt-2025'), '2025-10-12');
    assert.equal(normalizeDate('15-Jan-2024'), '2024-01-15');
    assert.equal(normalizeDate('22-Sep-14'), '2014-09-22');
    assert.equal(normalizeDate('1-Agustus-2023'), '2023-08-01');
    assert.equal(normalizeDate('2025-10-12'), '2025-10-12');
  });
});
