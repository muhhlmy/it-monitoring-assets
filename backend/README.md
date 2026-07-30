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

1. Pastikan PostgreSQL aktif dan isi koneksi pada `.env` (lihat `.env.example`).
   `DB_PASSWORD` wajib diisi dan `JWT_SECRET` wajib berupa secret acak minimal
   32 karakter. Aplikasi sengaja gagal start bila salah satunya kosong.
2. Jalankan `npm install` jika dependency belum tersedia.
3. Jalankan `npm run db:setup`. Perintah ini membuat database bila belum ada,
   menerapkan `Schema.sql`, lalu mengisi data dummy dari `Seed.sql`.
4. Jalankan `npm run dev`.
5. Jalankan frontend dari folder `frontend` menggunakan `npm run dev`.

Setup database dan seed bersifat idempotent sehingga aman dijalankan kembali.

## Scripts

- `npm run db:setup` - buat database, terapkan schema, dan isi dummy data.
- `npm run migrate` - terapkan schema tanpa seed.
- `npm run seed` - terapkan schema lalu sinkronkan dummy data.
- `npm run db:check` - validasi urutan kolom view dan hitung data.
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
