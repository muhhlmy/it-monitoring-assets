# IT Assets Monitoring API

REST API Express.js menggunakan ES Modules dan PostgreSQL. Struktur database
mengikuti `Schema.sql`: tabel `karyawan`, tabel `aset_ti`, dan view
`daftar_aset_ti_lengkap`.

## Struktur folder

```text
backend/
|-- src/
|   |-- config/          # .env, PostgreSQL, setup, dan pemeriksaan database
|   |-- controllers/     # Validasi, query, request, dan response
|   |-- routes/          # Daftar URL dan HTTP method
|   |-- app.js           # Konfigurasi aplikasi Express
|   `-- server.js        # Entry point untuk menjalankan server
|-- tests/               # Automated test
|-- Schema.sql           # Tabel dan view PostgreSQL
|-- Seed.sql             # Data dummy
|-- .env.example         # Contoh environment variable
`-- package.json
```

Alur request dibuat pendek agar mudah dipelajari:

```text
Route -> Controller -> PostgreSQL
```

- Route menentukan URL mana yang memanggil controller.
- Controller melakukan validasi, menjalankan query, dan mengirim response.
- Config menyimpan konfigurasi environment dan koneksi database.
- Penanganan 404 dan error umum diletakkan langsung di `app.js`.

Struktur ini cocok untuk ukuran aplikasi saat ini. Folder service atau repository
dapat ditambahkan nanti ketika controller sudah terlalu panjang atau aturan bisnis
menjadi lebih kompleks.

## Gaya kode untuk pemula

Kode JavaScript backend sengaja ditulis menggunakan konsep dasar:

- `const`, `let`, object, array, `if`, dan perulangan `for`.
- Fungsi biasa dengan nama yang menjelaskan tugasnya.
- `async/await` untuk menunggu query PostgreSQL.
- Komentar singkat sebelum bagian kode yang penting.
- Query statistik dijalankan satu per satu agar alurnya mudah diikuti.

Arrow function, spread object, optional chaining, nullish coalescing,
`Object.entries`, `.map`, `.filter`, dan `Promise.all` tidak digunakan. Sintaks
`import` dan `export` tetap digunakan karena backend memakai ES Modules.

## Menjalankan aplikasi

1. Gunakan Node.js yang sesuai `.nvmrc`/`package.json`, pastikan PostgreSQL aktif,
   lalu isi koneksi pada `.env` (lihat `.env.example`).
    `DB_PASSWORD` wajib diisi dan `JWT_SECRET` wajib berupa secret acak minimal
    32 karakter. Aplikasi sengaja gagal start bila salah satunya kosong.
    `CORS_ORIGINS` wajib berupa exact allowlist; wildcard tidak diterima.
   `TRUST_PROXY_CIDRS` harus kosong untuk koneksi langsung atau berisi IP/CIDR
   reverse proxy yang benar-benar tepercaya; wildcard/hop-count generik ditolak.
2. Jalankan `npm ci` untuk memasang dependency dari lockfile.
3. Pastikan database existing telah memenuhi runtime schema preflight.
4. Jalankan `npm run dev`; server gagal sebelum menerima traffic bila schema
   wajib tidak lengkap.
5. Jalankan frontend dari folder `frontend` menggunakan `npm run dev`.

`Schema.sql` dan `Seed.sql` adalah bootstrap legacy yang belum terbukti aman
untuk fresh/existing/rerun dan diketahui belum menjadi schema ticket canonical.
Jalur setup legacy sekarang sengaja **fail closed**: `db:setup`, `migrate`, dan
`seed` selalu berhenti dengan exit code non-zero sebelum membuka koneksi atau
menjalankan SQL. Nama script dipertahankan agar pemanggilan lama gagal secara
jelas, bukan diam-diam memodifikasi database.

Guard tersebut baru boleh diganti dengan runner migration setelah tersedia
target terisolasi yang diotorisasi, bukti backup dan restore yang terverifikasi,
serta migration versioned yang sudah direview dan diuji untuk fresh, existing,
dan rerun. User tidak dibuat dari seed repository.

### Password legacy dan rate limiting

Password baru dan setiap perubahan password selalu disimpan sebagai bcrypt.
Password baru minimal 12 karakter, maksimal 72 byte, dan tidak boleh memuat
karakter kontrol. Default `PASSWORD_LEGACY_MODE=disabled` menolak row password
non-bcrypt. Deployment existing yang masih memiliki plaintext hanya dapat memakai
`verify-plaintext` sebagai mode transisi **eksplisit dan sementara**. Mode itu
hanya memverifikasi row legacy, tidak melakukan rehash/backfill oportunistik.
Rotasi credential dan migrasi massal tetap menunggu target terisolasi serta bukti
backup/restore; setelah seluruh row terverifikasi bcrypt, kembalikan mode ke
`disabled`.

Urutan predeploy existing yang repeatable:

1. Buktikan backup dapat direstore pada PostgreSQL terisolasi dan catat owner,
   RPO/RTO, serta checksum/snapshot yang dipakai.
2. Pada target yang diotorisasi, inventarisasi **jumlah saja** (jangan ekspor
   nilai password):

   ```sql
   SELECT
     COUNT(*) FILTER (
       WHERE password ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
     ) AS bcrypt_rows,
     COUNT(*) FILTER (
       WHERE password !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
     ) AS legacy_rows
   FROM users;
   ```

3. Jika `legacy_rows > 0`, deploy kompatibilitas lebih dahulu dengan
   `PASSWORD_LEGACY_MODE=verify-plaintext`; jangan memakai default `disabled`
   karena akun existing akan ditolak.
4. Jalankan hanya migration/rotasi versioned yang sudah direview setelah gate
   recovery tersedia. Source aplikasi sengaja tidak melakukan rehash saat login.
5. Ulangi inventory sampai `legacy_rows = 0`, uji login seluruh role, lalu ubah
   mode ke `disabled`. Rollback source sebelum titik ini harus mempertahankan mode
   kompatibilitas agar tidak menciptakan lockout.

API memiliki containment limiter in-memory yang bounded: 600 request/menit per
IP untuk `/api` dan 10 percobaan/15 menit per IP serta email untuk login. Ini
bukan pengganti limiter terdistribusi pada deployment multi-instance. Proxy
allowlist harus benar agar alamat client tidak dapat dipalsukan dan limiter
terdistribusi tetap memerlukan keputusan store/topologi deployment.

## Scripts

- `npm run db:setup` - guard fail-closed; selalu gagal sebelum koneksi/SQL.
- `npm run migrate` - guard fail-closed yang sama; belum ada migration versioned
  yang aman untuk dijalankan.
- `npm run seed` - guard fail-closed yang sama; tidak menulis data dummy.
- `npm run db:check` - fail-fast runtime schema preflight, validasi urutan kolom
  view, dan hitung data; hanya jalankan dengan target yang memang diotorisasi.
- `npm run dev` - jalankan API dengan nodemon.
- `npm test` - jalankan automated test.
- `npm run check` - periksa sintaks entry point dan jalankan test.

## Backup Database

Full database backup tidak tersedia melalui endpoint atau UI aplikasi. Backup
harus dijalankan sebagai proses operasional terpisah dengan akses terbatas,
enkripsi, retention policy, dan restore rehearsal pada database terisolasi.
Jangan menjalankan migration destruktif sebelum backup tersebut berhasil
diverifikasi.

## Endpoint

- `GET /health`
- `GET /api/karyawan`
- `GET /api/assets`
- `GET /api/assets/stats`
- `GET /api/assets/:id`
- `POST /api/assets`
- `PUT /api/assets/:id`
- `DELETE /api/assets/:id`

`GET /api/assets` membaca langsung dari view `daftar_aset_ti_lengkap`. Operasi
CRUD menulis ke tabel `aset_ti`; field `nik` diterjemahkan ke relasi
`id_karyawan` secara transaksional. Aset yang di-assign ke karyawan memakai
`lokasi_kerja` karyawan. Aset tanpa pemegang dapat menyimpan lokasi mandiri pada
kolom `aset_ti.lokasi_aset`; view tetap menyajikan lokasi aktif sebagai
`lokasi_kerja`.
