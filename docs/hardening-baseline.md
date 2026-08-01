# Hardening Baseline

Tanggal audit: 30 Juli 2026

Pembaruan terakhir: 1 Agustus 2026

Branch kerja: `hardening/phase0-p0-slice-1`

Commit awal: `aca4f33`

Commit hasil Slice 1 yang diaudit:
`603b6f22507a984b46150bf3b7a362858c83b236`

Commit hasil Slice 2 yang diaudit:
`368237cb36c8c203857b0b4971f0063b8bbfa620`

Head awal working tree Slice 3:
`1662005e1c2b46b419979fdbace493ace108d520`

Dokumen ini mencatat baseline awal dan hasil verifikasi incremental sampai
working tree Slice 3. Nilai credential dan isi password tidak pernah dicetak
atau disalin ke dokumen ini.

## Batas Aman

- Backend dan frontend dipertahankan sebagai dua package npm independen dengan
  lockfile masing-masing.
- Pada baseline awal terhadap `main@aca4f33`, `Plan.md` dan `Prompt.md` adalah
  file user yang belum dilacak dan tidak diubah selama eksekusi lokal. Keduanya
  kemudian tercatat sebagai file baru dalam commit hasil Slice 1 yang diaudit
  di atas. `Prompt.md` kemudian dihapus pada commit Slice 2.
- Sebelum eksekusi Slice 3, `Plan.md` dan
  `backend/src/controllers/userController.js` sudah memiliki perubahan user.
  Keduanya tidak diubah atau diatribusikan sebagai implementasi Slice 3.
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
- **Ditutup pada Slice 2 (`368237c`):** fake
  audit login di shell frontend dan endpoint audit yang dapat ditulis client
  sudah dihapus; pembacaan audit login dibatasi ke superadmin. Untuk akun yang
  ditemukan, login audit mengambil nama/email canonical dari database; akun
  yang tidak ditemukan memakai penanda unknown milik server. IP/user-agent
  berasal dari request, bukan field actor pada body.
- **Diimplementasikan pada working tree Slice 3:** actor komentar berasal dari
  identity terautentikasi server; field actor pada body ditolak dan insert serta
  log komentar berada dalam satu transaction.
- **Terbuka:** token disimpan di `localStorage` dan token SSE dikirim melalui
  query string.
- **Diimplementasikan pada working tree Slice 3:** frontend membedakan `none`,
  `read_only`, `full`, dan legacy boolean secara eksplisit; role ticket yang
  tidak dikenal ditolak.
- **Diimplementasikan pada working tree Slice 3:** policy ticket canonical
  menegakkan ownership ID, queue/assignment, CASP, delete superadmin-only,
  audience SSE, dan queue-admin directory secara deny-by-default.
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

### Status Commit Slice 2

Status ini mencerminkan snapshot commit
`368237cb36c8c203857b0b4971f0063b8bbfa620`:

| Item | Status pada `368237c` |
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

### Verifikasi Historis Slice 2

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

### Status Working Tree Slice 3

Slice 3 hanya mengubah source, test, dan dokumentasi. Tidak ada koneksi ke
database target, migration, seed, backfill, perubahan schema/row, commit, push,
PR, merge, atau deploy.

| Area | Status working tree Slice 3 |
| --- | --- |
| Identity ticket | Role `user`/`reporter`, `admin`, dan alias superadmin dinormalisasi; role/ID/permission tidak valid ditolak sebelum controller |
| Scope HTTP | List, stats, history, comments, update, delete, claim, reassign, dan CASP memakai policy resource canonical |
| Ownership legacy | Display name tidak dipakai untuk authorization; reporter ditolak bila `pelapor_user_id` kosong |
| Comment actor | Body hanya menerima `pesan` dan `attachment`; actor berasal dari identity server; comment dan log atomic |
| CASP | Detail diotorisasi sebelum query rating; reporter submit setelah resolved; aggregate admin dibatasi queue |
| SSE | Audience reporter/queue/assignment/superadmin, membership admin diperiksa live, stream berakhir saat JWT kedaluwarsa, dan DTO minimum tanpa attachment/routing fact |
| Queue directory | Reporter/read-only admin ditolak; admin hanya queue sendiri; response tepat `id`/`nama`; kandidat harus aktif, mapped, dan write-capable; kandidat superadmin hanya terlihat oleh superadmin |
| Frontend | Permission eksplisit, unknown ticket role fail closed, access-denied route, export tetap superadmin-only, actor comment dan assignment tidak dikirim lewat payload update |
| Mutation guard | Payload update memakai allowlist dan enum; claim/reassign memakai predicate atomic terhadap state/resource yang relevan |

### Verifikasi Aktual Working Tree Slice 3

| Command/check | Hasil aktual |
| --- | --- |
| Backend `npm ci` | Lulus; audit npm melaporkan 1 high vulnerability yang belum di-upgrade pada slice ini |
| Backend `npm run check` dengan secret dummy | Lulus, 59/59 test |
| Frontend `npm test` | Lulus, 15/15 test; guard permission/fallback diuji melalui helper pure |
| Frontend `npm run build` | Lulus; warning chunk utama 577,72 kB tetap ada |
| Frontend `npm run lint:check` | Gagal pada 5 error oxlint baseline yang sama |
| Frontend `npm run format:check` | Gagal pada 32 file; debt baseline tetap terlihat, satu file router yang diubah dalam scope kini sesuai formatter |
| Frontend reproducible install | `npm ci` pada salinan lockfile bersih di direktori temporer lulus; workspace sempat terhalang native binding yang dikunci proses lain |
| Manifest/lockfile diff | Tidak ada |
| Scoped `git diff --check` Slice 3 | Lulus; hanya warning konversi line ending |
| Full `git diff --check` | Gagal hanya pada trailing whitespace `Plan.md` baris 5-9 yang sudah ada sebelum Slice 3 |

Angka 4 ticket legacy tanpa `pelapor_user_id` pada bagian snapshot adalah hasil
historis. Jumlah tersebut tidak diambil ulang karena tidak ada target database
terisolasi atau credential yang diotorisasi untuk Slice 3.

### Risiko Tersisa Setelah Slice 3

- Runtime DDL, seed, dan name-based backfill masih berada pada request path.
  Karena helper legacy tersebut dipanggil sebelum sebagian authorization
  resource, jaminan “deny sebelum mutation” Slice 3 hanya berlaku untuk domain
  write/log/event setelah bootstrap; belum berlaku tanpa syarat terhadap DDL dan
  backfill runtime itu sendiri.
- Password plaintext dan fresh-schema repair tetap menunggu recovery proof.
- JWT masih berada di `localStorage`/query SSE dan role/permission tetap snapshot
  sampai token berakhir; inactive-user/revocation belum diselesaikan.
- Mutasi create/update/claim/reassign dan audit terkait belum seluruhnya berada
  pada satu transaction; nomor tiket masih memakai `COUNT(*) + 1`.
- Attachment masih berupa base64 pada kolom `TEXT`; storage privat dan magic-byte
  validation belum tersedia.
- Belum ada database-integration test nyata, restore rehearsal, atau bukti CI
  required checks.
- Audit source menemukan boundary user-management lama yang memungkinkan admin
  biasa mengubah role/permission secara terlalu luas. File controller terkait
  sudah memiliki perubahan user sebelum Slice 3, sehingga temuan ini dicatat
  sebagai residual kritis dan tidak diperbaiki diam-diam dalam slice ticket.
- Perpindahan queue masih mempertahankan assignee lama sesuai policy
  “queue atau assigned”; keputusan bisnis untuk otomatis mengosongkan assignment
  saat queue berubah belum dikunci.

Rollback Slice 3 bersifat source-only: kembalikan file implementasi/test/docs
Slice 3 tanpa rollback database. Jangan memulihkan policy lama yang fail-open.
Tahap berikutnya tetap Slice 4, yaitu recovery/restore rehearsal; jangan mulai
migrasi password sebelum bukti restore tersedia.

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

## Status Working Tree Residual Hardening

Tahap ini menutup risiko yang dapat diperbaiki secara source-only. Tidak ada
koneksi ke database target, migration, seed, backfill, perubahan schema/row,
backup, restore, commit, push, PR, merge, atau deploy yang dijalankan.

| Area | Status working tree saat ini |
| --- | --- |
| User management | Role hierarchy deny-by-default; admin biasa hanya dapat mengelola akun `user` non-sensitif; create/update/delete dan queue mapping memakai transaction serta row/predicate guard |
| Runtime DDL | Seluruh DDL, seed, dan backfill di controller auth/user/ticket/queue telah dihapus; regression test memindai controller dan HTTP mock menolak SQL bootstrap |
| Schema readiness | Startup dan `db:check` melakukan metadata preflight read-only; legacy `db:setup`/`migrate`/`seed` sengaja fail closed sebelum koneksi atau SQL |
| Ticket correctness | Create/update/claim/reassign dan audit log atomik; audit failure rollback; event dikirim setelah commit; nomor tiket memakai identity ID, bukan `COUNT(*) + 1` |
| Asset mutation correctness | Create/update/delete dan audit berada dalam transaction; update/delete mengunci row; seluruh device-cycle aktif ditutup sebelum reassignment/delete; actor audit memuat ID dan nama canonical |
| Attachment containment | Input ticket/comment dibatasi raster canonical 5 MiB; list/polling hanya membawa `has_attachment`; Base64 diambil satu-per-satu melalui endpoint terotorisasi dan komentar memerlukan klik pengguna |
| Session containment | Hanya strict `Authorization: Bearer`; query token dihapus; user aktif, role, dan permission dibaca live; SSE memakai authenticated fetch stream dan audience direvalidasi tiap event |
| HTTP boundary | Exact CORS allowlist tanpa wildcard/private-LAN bypass, JSON-only mutation body maksimum 8 MiB, kredensial login dibatasi tipe/panjang sebelum query, no-store/security headers aktif |
| Seed credential | Literal credential user dihapus dari `Seed.sql`; script user seed fail closed sampai recovery proof dan rollout bcrypt tersedia |
| Dependency/runtime | `brace-expansion` transitif diperbarui dari 5.0.7 ke 5.0.9; backend/frontend memakai policy Node yang sama; lockfile root kosong dihapus |
| CI source | Workflow memakai action resmi yang dipin ke immutable commit; install/test/build/audit high dan Oxlint menjadi hard gate |
| Frontend delivery | Seluruh view utama dimuat melalui lazy route; bundle terbesar turun ke 224,91 kB dan build tidak lagi memberi warning chunk 500 kB |

### Verifikasi Aktual Residual Hardening

| Command/check | Hasil aktual |
| --- | --- |
| Backend `npm ci` | Lulus, 125 package diaudit dan 0 vulnerability |
| Frontend reproducible install | Workspace Windows terhalang native oxlint yang dikunci proses lain; `npm ci` pada salinan lockfile bersih lulus, 197 package dan 0 vulnerability; dependency workspace dipulihkan dengan `npm install` |
| Backend `npm run check` dengan secret dummy | Lulus, 106/106 test |
| Frontend `npm test` | Lulus, 25/25 test |
| Frontend `npm run build` | Lulus; lazy-route chunks terbentuk dan bundle terbesar 224,91 kB tanpa warning ukuran chunk |
| Connected `npm audit --audit-level=high` backend/frontend | Lulus, 0 vulnerability setelah lockfile memuat `brace-expansion` 5.0.9 |
| Frontend `npm run lint:check` | Oxlint bersih; command tetap gagal pada 30 error ESLint debt |
| Frontend `npm run format:check` | Gagal pada 31 file baseline; tidak dilakukan mass-format |
| Runtime DDL controller scan | Lulus; tidak ada `CREATE`/`ALTER`/`DROP` runtime atau anonymous migration block |
| Database command/integration | Sengaja tidak dijalankan karena target terisolasi dan restore proof belum tersedia |

Workflow CI menjadikan test, build, audit high, dan Oxlint sebagai hard gate.
ESLint/format debt masih dilaporkan dengan `continue-on-error`; status check
belum dapat disebut required sampai workflow benar-benar dijalankan di GitHub
dan branch protection dikonfigurasi oleh owner repository.

### Risiko yang Tetap Memerlukan Gate Eksternal

- Password existing, login, create user, dan update user masih plaintext.
  Source seed sudah ditutup, tetapi migrasi bcrypt, rotasi credential, dan
  verifikasi nol plaintext tetap dilarang sebelum backup/restore rehearsal dan
  strategi rollout tersedia. Rate limit terdistribusi juga memerlukan keputusan
  store/topologi deployment agar tidak memberi proteksi semu per-process.
- `Schema.sql`/migration fresh-existing-rerun belum diperbaiki atau diuji pada
  PostgreSQL terisolasi. Runtime dan command legacy sekarang fail closed. File
  migration lama yang mencocokkan ownership tiket berdasarkan nama tidak boleh
  dijalankan sebelum mapping identity diverifikasi dan recovery proof tersedia.
- Token utama masih disimpan di `localStorage` dan JWT masih stateless selama
  12 jam. Query-token dan stale authorization snapshot sudah ditutup, tetapi
  HttpOnly cookie, CSRF, rotation, serta revocation per-session memerlukan model
  session dan domain deployment.
- Attachment masih disimpan sebagai base64 pada kolom `TEXT`. Validasi input
  serta response containment sudah menahan payload baru dan bulk response,
  tetapi private object storage, migrasi legacy, scanning, retention, dan orphan
  cleanup memerlukan pilihan storage.
- Belum ada restore rehearsal, database-integration/concurrency test nyata,
  bukti workflow remote, atau branch-protection required check.
- Pagination/query budget, optimistic concurrency aset, partial unique invariant
  device-cycle, hard-delete/retention, dan keputusan assignment ketika queue
  berubah masih perlu keputusan produk atau bukti query/database.

Rollback perubahan tahap ini bersifat source-only. Jangan menghidupkan kembali
runtime DDL, query-token, credential seed, `COUNT(*) + 1`, CORS private-LAN
bypass, atau policy role yang fail-open. Tahap berikutnya tetap recovery/restore
rehearsal pada database terisolasi sebelum migrasi password atau schema.
