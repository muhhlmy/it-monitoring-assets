# Hardening Baseline

Tanggal audit: 30 Juli 2026

Branch kerja: `hardening/phase0-p0-slice-1`

Commit awal: `aca4f33`

Commit hasil Slice 1 yang diaudit:
`603b6f22507a984b46150bf3b7a362858c83b236`

Dokumen ini mencatat kondisi sebelum slice hardening pertama. Nilai credential
dan isi password tidak pernah dicetak atau disalin ke dokumen ini.

## Batas Aman

- Backend dan frontend dipertahankan sebagai dua package npm independen dengan
  lockfile masing-masing.
- Pada baseline awal terhadap `main@aca4f33`, `Plan.md` dan `Prompt.md` adalah
  file user yang belum dilacak dan tidak diubah selama eksekusi lokal. Keduanya
  kemudian tercatat sebagai file baru dalam commit hasil Slice 1 yang diaudit
  di atas.
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

## Temuan Baseline dan Status Terkini

- **Ditutup pada Slice 1 (`603b6f2`):** source pada baseline memiliki fallback
  aktif untuk password database dan JWT secret. Fallback sudah dihapus dan
  konfigurasi sekarang gagal cepat.
- **Ditutup pada Slice 1 (`603b6f2`):** full database export pada baseline
  tersedia dari endpoint aplikasi dan membaca seluruh kolom tabel dengan
  `SELECT *`. Route dan UI tersebut sudah dihapus.
- **Terbuka:** password login, create user, update user, dan seed masih memiliki
  alur plaintext.
- **Terbuka:** `Schema.sql` tidak dapat membangun database fresh secara
  tepercaya; blok backfill tidak lengkap dan bagian berikutnya mereferensikan
  `tickets` sebelum tabel itu dibuat oleh schema.
- **Terbuka:** controller auth, user, ticket, dan queue masih menjalankan DDL
  atau backfill dari request path.
- **Ditutup pada working tree Slice 2, belum menjadi commit yang diaudit:** fake
  audit login di shell frontend dan endpoint audit yang dapat ditulis client
  sudah dihapus; pembacaan audit login dibatasi ke superadmin. Untuk akun yang
  ditemukan, login audit mengambil nama/email canonical dari database; akun
  yang tidak ditemukan memakai penanda unknown milik server. IP/user-agent
  berasal dari request, bukan field actor pada body.
- **Terbuka:** komentar tiket masih perlu dipastikan selalu mengambil actor dari
  `req.user`.
- **Terbuka:** token disimpan di `localStorage` dan token SSE dikirim melalui
  query string.
- **Terbuka:** frontend route guard memperlakukan permission string `none`
  sebagai nilai truthy.
- **Terbuka di jalur lain:** renderer PDF/print di luar pusat export masih
  memakai `document.write` dan utilitas CSV aset perlu review formula
  injection tersendiri. Slice 2 hanya mengeraskan `exportEngine` yang dipakai
  pusat export sensitif.

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

### Status Item Containment Slice 1

Status berikut sudah ditutup pada commit Slice 1 yang diaudit, tetapi tidak
menyatakan seluruh hardening P0 selesai:

| Item | Status pada `603b6f2` |
| --- | --- |
| Fallback `DB_PASSWORD` | Ditutup; konfigurasi gagal cepat bila secret kosong |
| Fallback `JWT_SECRET` | Ditutup; sign dan verify memakai konfigurasi yang sama |
| Full database export | Ditutup; route dan UI dihapus |
| Regression secret dan full database export | Ditutup; test ditambahkan |
| Migration schema/password | Tetap terbuka; menunggu bukti backup dan restore |
| Otorisasi export kustom dan integritas actor audit | Tetap terbuka untuk Slice 2 |

### Status Working Tree Slice 2

Status ini mencerminkan working tree setelah dibandingkan dengan
`603b6f22507a984b46150bf3b7a362858c83b236`; perubahan belum memiliki commit
baru yang dapat disebut sebagai snapshot audit:

| Item | Status working tree |
| --- | --- |
| Otorisasi export | Diimplementasikan: route backend dan navigasi frontend hanya untuk superadmin |
| Batas export | Diimplementasikan: limit integer wajib `1..1000`; UI dan quick export maksimum 1.000 |
| Allowlist/redaction export | Diimplementasikan: kolom di luar schema ditolak dan row response diproyeksikan ulang |
| Kontrak ticket export | Diimplementasikan: nama kolom, tanggal, status, dan urutan memakai schema aktif |
| Encoding output export kustom | Diimplementasikan: HTML dinamis di Excel/PDF di-escape dan formula CSV/Excel dinetralkan |
| Client-writable login audit | Dihapus: `POST /api/logs/audit` dan side effect di `App.vue` tidak tersedia |
| Pembacaan login audit | Dibatasi ke superadmin; UI admin biasa hanya meminta/menampilkan riwayat aset |
| Actor login audit | Diperketat: akun dikenal memakai actor database, akun tidak dikenal memakai penanda server; IP/user-agent berasal dari request |
| Regression test | Ditambahkan untuk role matrix, validasi/export redaction, actor spoofing, dan shell frontend |

### Verifikasi Working Tree Slice 2

| Command/check | Hasil aktual |
| --- | --- |
| Backend `npm run check` dengan secret dummy | Lulus, 27/27 test |
| Frontend `npm test` | Lulus, 6/6 test |
| Frontend `npm run build` | Lulus; warning chunk utama di atas 500 kB tetap ada |
| Frontend `npm run lint:check` | Gagal pada 5 error oxlint baseline |
| Frontend ESLint read-only | Gagal pada 30 error baseline; satu unused variable tertutup karena guard export sekarang memakainya |
| Frontend `npm run format:check` | Gagal pada 33 file baseline |
| Scan UTF-8/mojibake seluruh Markdown | Lulus, 4 file diperiksa tanpa temuan |
| `git diff --check` | Lulus; hanya warning konversi line ending working tree |

`npm ci` frontend di working tree tidak dapat mengganti native binding yang
sedang dikunci proses Node lain. Reproducibility lockfile dibuktikan dengan
`npm ci` pada salinan bersih `package.json` dan `package-lock.json` di direktori
temporer; dependency working tree kemudian dipulihkan tanpa perubahan manifest
atau lockfile.

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
