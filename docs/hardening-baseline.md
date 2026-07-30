# Hardening Baseline

Tanggal audit: 30 Juli 2026

Branch kerja: `hardening/phase0-p0-slice-1`

Commit awal: `aca4f33`

Dokumen ini mencatat kondisi sebelum slice hardening pertama. Nilai credential
dan isi password tidak pernah dicetak atau disalin ke dokumen ini.

## Batas Aman

- Backend dan frontend dipertahankan sebagai dua package npm independen dengan
  lockfile masing-masing.
- `Plan.md` dan `Prompt.md` adalah file user yang belum dilacak dan tidak diubah.
- Tidak ada migration, seed, backfill, atau operasi tulis database yang
  dijalankan selama baseline.
- `npm run db:check` hanya menjalankan query baca.
- Backup/restore rehearsal belum dilakukan. Karena itu perubahan schema dan
  migrasi password belum diizinkan pada slice ini.

## Runtime dan Dependency

| Item | Kondisi awal |
| --- | --- |
| Node.js | `v24.16.0` |
| npm | `11.13.0` |
| Backend dependencies | `npm ls --depth=0` lulus |
| Frontend dependencies | `npm ls --depth=0` lulus |
| Dependency model | Dua package independen |
| Root lockfile | Ada, tetapi tidak memiliki package |

## Hasil Command Baseline

| Area | Command | Hasil awal |
| --- | --- | --- |
| Backend | `npm test` | Lulus, 9/9 test |
| Backend | `npm run check` | Lulus |
| Database | `npm run db:check` | Lulus, 8 karyawan dan 13 aset |
| Frontend | `npm run build` | Lulus, dengan warning chunk utama di atas 500 kB |
| Frontend | `oxlint .` | Gagal, 5 error lama |
| Frontend | `eslint . --no-cache` | Gagal, 31 error lama |
| Frontend | `prettier --check --experimental-cli src/` | Gagal, 33 file belum sesuai format |

Failure lint dan format tersebut adalah baseline lama. Slice hardening tidak
boleh menyembunyikannya dengan `--fix`, menonaktifkan rule, atau formatting
massal.

## Snapshot Read-only

Pemeriksaan read-only menemukan:

- 8 karyawan;
- 13 aset;
- 9 tiket;
- 4 akun pengguna;
- 4 akun masih memakai nilai password non-bcrypt;
- 4 tiket belum memiliki `pelapor_user_id`;
- tidak ditemukan komentar atau history tiket orphan pada pemeriksaan awal.

Snapshot ini bukan pengganti backup. Row count harus diambil ulang sebelum
setiap migration dan dibandingkan setelah restore pada database terisolasi.

## Temuan yang Memengaruhi Urutan Kerja

- Source memiliki fallback aktif untuk password database dan JWT secret.
- Full database export tersedia dari endpoint aplikasi dan membaca seluruh
  kolom tabel dengan `SELECT *`.
- Password login, create user, update user, dan seed masih memiliki alur
  plaintext.
- `Schema.sql` tidak dapat membangun database fresh secara tepercaya: blok
  backfill tidak lengkap dan bagian berikutnya mereferensikan `tickets` sebelum
  tabel itu dibuat oleh schema.
- Controller auth, user, ticket, dan queue masih menjalankan DDL atau backfill
  dari request path.
- Audit login dan komentar masih menerima identitas aktor dari client.
- Token disimpan di `localStorage` dan token SSE dikirim melalui query string.
- Frontend route guard memperlakukan permission string `none` sebagai nilai
  truthy.

## Recovery Slice Pertama

Slice pertama hanya melakukan containment tanpa perubahan schema atau row:

1. backend gagal start bila secret wajib tidak tersedia;
2. fallback secret dihapus dan JWT memakai satu sumber konfigurasi;
3. full database backup dihapus dari route dan UI aplikasi;
4. full backup selanjutnya harus dilakukan sebagai proses operasional terpisah.

Rollback aplikasi dapat dilakukan dengan mengembalikan perubahan source. Tidak
ada rollback database untuk slice ini. Menghidupkan kembali fallback secret atau
endpoint backup aplikasi bukan recovery yang aman; deployment harus memasang
environment yang benar.

## Verifikasi Setelah Slice Pertama

| Command | Hasil |
| --- | --- |
| Backend `npm test` dengan secret dummy | Lulus, 15/15 test |
| Backend `npm run check` dengan secret dummy | Lulus, 15/15 test |
| Syntax check seluruh JavaScript backend | Lulus |
| Frontend `npm run build` | Lulus, warning chunk di atas 500 kB tetap ada |
| Frontend `npm run lint:check` | Gagal dengan 5 error oxlint lama |
| Frontend ESLint read-only | Gagal dengan 31 error lama |
| Frontend `npm run format:check` | Gagal pada 33 file lama |
| Regression test endpoint backup lama | `404`, tanpa query database |
| Pencarian fallback secret/route produksi | Tidak ditemukan |

Tanpa environment deployment, `npm run db:check` sekarang berhenti sebelum
membuka koneksi dengan error `DB_PASSWORD` wajib diisi. Ini adalah perilaku
fail-fast yang diharapkan; pemeriksaan database berikutnya harus menerima
credential dari secret store, bukan fallback source.
