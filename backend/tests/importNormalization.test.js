import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, extractNik, normalizeDate, dashIfNull } from '../src/controllers/importController.js';

describe('Import Normalization Logic — Bug Fix Regression Tests', () => {

  // ── cleanText: existing behavior ──
  describe('cleanText', () => {
    test('harus mengubah "-" menjadi null', () => {
      assert.equal(cleanText('-'), null);
    });
    test('harus mengubah string kosong menjadi null', () => {
      assert.equal(cleanText(''), null);
      assert.equal(cleanText('   '), null);
    });
    test('harus mengubah null/undefined menjadi null', () => {
      assert.equal(cleanText(null), null);
      assert.equal(cleanText(undefined), null);
    });
    test('harus mengubah "N/A", "null", "undefined", "none" menjadi null', () => {
      assert.equal(cleanText('N/A'), null);
      assert.equal(cleanText('n/a'), null);
      assert.equal(cleanText('null'), null);
      assert.equal(cleanText('undefined'), null);
      assert.equal(cleanText('none'), null);
    });
    test('harus mempertahankan nilai normal', () => {
      assert.equal(cleanText('ThinkPad T14'), 'ThinkPad T14');
      assert.equal(cleanText('  Laptop  '), 'Laptop');
    });
  });

  // ── dashIfNull: NEW function ──
  describe('dashIfNull', () => {
    test('harus mengubah null menjadi "-"', () => {
      assert.equal(dashIfNull(null), '-');
    });
    test('harus mengubah undefined menjadi "-"', () => {
      assert.equal(dashIfNull(undefined), '-');
    });
    test('harus mempertahankan nilai string normal', () => {
      assert.equal(dashIfNull('Jakarta'), 'Jakarta');
      assert.equal(dashIfNull(''), '');
    });
    test('harus mempertahankan nilai string "-"', () => {
      // cleanText('-') returns null, lalu dashIfNull(null) returns '-'
      assert.equal(dashIfNull(cleanText('-')), '-');
    });
    test('harus mempertahankan nilai string kosong', () => {
      assert.equal(dashIfNull(cleanText('')), '-');
    });
  });

  // ── extractNik: FK field behavior ──
  describe('extractNik (untuk FK field seperti nik_atasan_langsung)', () => {
    test('nik_atasan_langsung = "-" harus menjadi null', () => {
      assert.equal(extractNik('-'), null);
    });
    test('nik_atasan_langsung = empty harus menjadi null', () => {
      assert.equal(extractNik(''), null);
      assert.equal(extractNik('   '), null);
    });
    test('nik_atasan_langsung = null harus menjadi null', () => {
      assert.equal(extractNik(null), null);
    });
    test('nik_atasan_langsung = undefined harus menjadi null', () => {
      assert.equal(extractNik(undefined), null);
    });
    test('nik_atasan_langsung = valid NIK harus dipertahankan', () => {
      assert.equal(extractNik('20140002'), '20140002');
    });
    test('nik_atasan_langsung = "20140002 - Budi" harus diekstrak menjadi "20140002"', () => {
      assert.equal(extractNik('20140002 - Budi'), '20140002');
    });
  });

  // ── Non-FK nullable field: dashIfNull behavior ──
  describe('Non-FK nullable fields (lokasi_kerja, note_asset, dll)', () => {
    test('field nullable non-FK dengan "-" harus menjadi "-"', () => {
      // cleanText('-') → null, dashIfNull(null) → '-'
      const val = cleanText('-');
      assert.equal(dashIfNull(val), '-');
    });
    test('field nullable non-FK dengan empty harus menjadi "-"', () => {
      const val = cleanText('');
      assert.equal(dashIfNull(val), '-');
    });
    test('field nullable non-FK dengan null harus menjadi "-"', () => {
      assert.equal(dashIfNull(null), '-');
    });
    test('field nullable non-FK dengan whitespace harus menjadi "-"', () => {
      const val = cleanText('   ');
      assert.equal(dashIfNull(val), '-');
    });
    test('field nullable non-FK dengan nilai normal harus dipertahankan', () => {
      const val = cleanText('Jakarta');
      assert.equal(dashIfNull(val), 'Jakarta');
    });
  });

  // ── Existing tests tetap valid ──
  describe('Import NIK & Text Extractor Logic (existing)', () => {
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

    test('harus membersihkan cell kosong, "-", "--", "N/A", "null", "none" pada seluruh kolom Aset', () => {
      assert.equal(cleanText('-'), null);
      assert.equal(cleanText('--'), null);
      assert.equal(cleanText('n/a'), null);
      assert.equal(cleanText('N/A'), null);
      assert.equal(cleanText('none'), null);
      assert.equal(cleanText('null'), null);
      assert.equal(cleanText('undefined'), null);
      assert.equal(cleanText(' ThinkPad T14 '), 'ThinkPad T14');
    });
  });
});