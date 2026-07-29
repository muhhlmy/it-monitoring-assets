# Plan Implementasi Revisi IT Monitoring Assets

> Repository: `muhhlmy/it-monitoring-assets`  
> Branch acuan: `main`  
> Tanggal review: 28 Juli 2026  
> Status dokumen: **Implementation-ready plan**

---

## 1. Ringkasan

Dokumen ini menjadi rencana implementasi untuk lima revisi berikut:

1. Saat sidepanel disembunyikan, logo tetap terlihat.
2. Menu dan data **My Ticket / Tiket Saya** milik user biasa harus muncul.
3. Warna card **Total Aset IT** disesuaikan dengan identitas visual aplikasi.
4. Dashboard ditambah **Line Chart, Bar Chart, Pie Chart, dan Donut Chart**.
5. Setelah tiket berstatus `Resolved`, pelapor dapat mengisi **CASP** berupa penilaian bintang 1–5 terhadap penyelesaian masalah. User yang mengambil atau menangani tiket tidak boleh memberikan penilaian tersebut.

Implementasi harus mempertahankan arsitektur yang sudah ada:

- Frontend Vue 3 + Vue Router + Tailwind CSS.
- Backend Express.js.
- Database PostgreSQL.
- Autentikasi JWT.
- RBAC berbasis `role` dan `permissions`.
- Routing tiket berbasis queue `IT`, `HR`, `GA`, dan `OPS`.
- Relasi tiket ke pelapor melalui `pelapor_user_id`.
- Relasi tiket ke petugas melalui `assigned_to_user_id`.

---

## 2. Hasil Review Kondisi Saat Ini

### 2.1 Sidebar dan logo

File utama:

- `frontend/src/App.vue`
- `frontend/src/components/layout/AppSidebar.vue`
- `frontend/src/components/layout/AppHeader.vue`

Kondisi saat ini:

- State navigasi hanya menggunakan satu boolean: `isNavigationOpen`.
- Saat ditutup, sidebar menjadi `w-0`, `invisible`, `opacity-0`, dan `-translate-x-full`.
- Karena seluruh sidebar dihilangkan, logo `/ESB Logo.svg` ikut menghilang.
- Perilaku desktop dan mobile masih memakai state yang sama, padahal kebutuhan keduanya berbeda.

Akar masalah:

- Konsep **sidebar tertutup di mobile** tercampur dengan **sidebar collapse di desktop**.

### 2.2 My Ticket user belum muncul

File utama:

- `frontend/src/views/TicketsView.vue`
- `backend/src/controllers/ticketController.js`
- `backend/src/routes/ticketRoutes.js`
- `frontend/src/composables/useAuth.js`

Kondisi saat ini:

- Frontend memiliki tab `mine` dengan label **Tiket Saya**.
- Backend mengartikan `tab=mine` sebagai:

```sql
t.assigned_to_user_id = current_user_id
```

- Logika tersebut benar untuk admin yang sedang menangani tiket, tetapi salah untuk user biasa.
- User biasa seharusnya melihat tiket yang dibuatnya sendiri melalui:

```sql
t.pelapor_user_id = current_user_id
```

Masalah tambahan:

- Scope default user non-superadmin memakai mapping `user_ticket_queues`.
- User biasa umumnya tidak memiliki mapping queue, sehingga daftar tiket dan statistik dapat kosong.
- Endpoint history dan comment belum menerapkan object-level authorization yang konsisten.
- Tombol **Ambil Tiket**, edit, dan hapus masih dapat muncul pada tampilan user karena gating frontend belum dipisah berdasarkan role/write permission.
- Endpoint claim belum memakai middleware `requireAdmin`; validasi hanya mengandalkan query di controller.

### 2.3 Warna card Total Aset IT

File utama:

- `frontend/src/views/DashboardView.vue`
- `frontend/src/assets/main.css`

Kondisi saat ini:

- Card Total Aset memakai gradient biru yang di-hardcode:

```text
#5D87FF → #4570EA
```

- Warna yang sama tersebar sebagai literal di banyak komponen.
- Perubahan warna card berisiko tidak konsisten apabila tidak dipindahkan ke design token.

Proposal default:

- Gunakan warna utama ESB/oranye untuk card Total Aset:

```text
Primary  : #FC841B
Dark     : #E26F10
Light    : #FFF2E7
```

- Warna harus didefinisikan sebagai token. Apabila referensi desain final memakai warna lain, perubahan hanya dilakukan pada token, bukan pada setiap komponen.

### 2.4 Dashboard chart

File utama:

- `frontend/src/views/DashboardView.vue`
- `backend/src/controllers/assetController.js`
- `frontend/package.json`

Kondisi saat ini:

- Endpoint `/api/assets/stats` sudah menyediakan:
  - `byStatus`
  - `byCondition`
  - `byType`
  - `byLocation`
  - `recentAssets`
- Data tersebut sudah cukup untuk Bar, Pie, dan Donut Chart.
- Belum ada data time-series untuk Line Chart.
- Area Row 2 dashboard saat ini kosong.
- Frontend belum memiliki library chart.

### 2.5 CASP belum tersedia

Kondisi saat ini:

- Status tiket sudah mendukung `Resolved`.
- Belum ada tabel rating.
- Belum ada endpoint CASP.
- Belum ada aturan bahwa hanya pelapor yang boleh menilai.
- Belum ada UI bintang 1–5.
- Belum ada pencatatan CASP pada log tiket.

---

## 3. Tujuan Implementasi

### 3.1 Tujuan fungsional

- Logo tetap terlihat saat sidebar desktop di-collapse.
- User biasa hanya melihat tiket yang dibuatnya sendiri.
- Admin queue melihat tiket pada queue yang menjadi tanggung jawabnya.
- Admin dapat memisahkan tiket queue, tiket belum diambil, dan tiket yang ditanganinya.
- Superadmin tetap dapat melihat seluruh tiket.
- Dashboard memiliki empat visualisasi yang memakai data nyata dari database.
- Pelapor dapat memberikan rating 1–5 setelah tiket diselesaikan.
- Assignee tidak dapat menilai tiket yang ditanganinya sendiri.

### 3.2 Tujuan teknis

- Tidak mengandalkan nama user untuk authorization.
- Semua authorization menggunakan ID dari JWT dan foreign key database.
- Scope daftar tiket, statistik, detail, history, comment, dan CASP memakai helper akses yang sama.
- Query analytics tetap efisien dan memiliki index yang sesuai.
- Komponen chart reusable, responsive, accessible, dan memiliki empty state.
- Perubahan database dibuat idempotent dan dimasukkan ke schema/migration resmi.

---

## 4. Keputusan dan Asumsi Implementasi

1. **My Ticket untuk user biasa** berarti tiket yang dibuat oleh user tersebut (`pelapor_user_id`).
2. **Tiket Saya untuk admin** berarti tiket yang sedang ditangani admin tersebut (`assigned_to_user_id`).
3. Label frontend akan dibuat lebih eksplisit agar tidak ambigu:
   - User: `Tiket Saya`.
   - Admin: `Ditangani Saya`.
4. CASP hanya dapat diisi jika status tiket adalah `Resolved`.
5. CASP hanya dapat diisi oleh `pelapor_user_id`.
6. CASP tidak dapat diisi oleh `assigned_to_user_id`, termasuk ketika pelapor dan assignee kebetulan sama.
7. Satu tiket hanya memiliki satu CASP pada fase awal.
8. Feedback teks bersifat opsional; rating bintang wajib.
9. Pengiriman CASP tidak otomatis mengubah status menjadi `Closed` pada fase awal. Penutupan tetap menjadi proses terpisah agar alur tidak berubah tanpa persetujuan bisnis.
10. Proposal warna default card Total Aset menggunakan oranye ESB. Warna final tetap dikendalikan melalui design token.
11. Chart memakai `Chart.js` + `vue-chartjs` agar implementasi maintainable dan tidak membuat renderer SVG manual yang kompleks.

---

## 5. Matriks Akses Target

| Aksi | User biasa | Admin queue | Superadmin |
|---|---:|---:|---:|
| Membuat tiket | Ya | Ya | Ya |
| Melihat tiket yang dibuat sendiri | Ya | Ya | Ya |
| Melihat semua tiket dalam queue | Tidak | Ya, queue miliknya | Ya |
| Melihat seluruh tiket lintas queue | Tidak | Tidak | Ya |
| Mengambil tiket | Tidak | Ya, queue miliknya | Ya |
| Edit status/detail tiket | Tidak | Ya, sesuai akses | Ya |
| Hapus tiket | Tidak | Tidak secara default | Ya |
| Melihat history/comment | Hanya tiket sendiri | Queue miliknya | Semua |
| Memberi CASP | Hanya sebagai pelapor | Hanya jika menjadi pelapor dan bukan assignee | Hanya jika menjadi pelapor dan bukan assignee |
| Melihat hasil CASP | Tiket sendiri | Tiket queue miliknya | Semua |

Catatan:

- Permission `tickets=read_only` tidak boleh memberikan akses update, claim, reassign, atau delete.
- Frontend hanya menyembunyikan aksi untuk UX. Backend tetap menjadi sumber authorization utama.

---

# 6. Rencana Fitur 1 — Logo Tetap Visible Saat Sidepanel Di-hide

## 6.1 Target UX

### Desktop

Sidebar memiliki dua mode:

- **Expanded**: lebar sekitar `260px`, logo penuh, menu lengkap, profil user.
- **Collapsed**: lebar sekitar `72px–80px`, logo/brand mark tetap terlihat, icon menu tetap terlihat, teks menu disembunyikan.

### Mobile

- Sidebar tetap berupa drawer/overlay.
- Ketika drawer ditutup, sidebar benar-benar keluar dari layar.
- Logo tetap dapat terlihat di header mobile di samping tombol hamburger.

## 6.2 Refactor state

Ubah state tunggal:

```js
isNavigationOpen
```

menjadi dua state terpisah:

```js
isMobileNavigationOpen
isDesktopSidebarCollapsed
```

Persistensi desktop:

```text
localStorage key: app_sidebar_collapsed
```

Jangan menyimpan state drawer mobile ke localStorage.

## 6.3 Perubahan file

### `frontend/src/App.vue`

- Tambahkan deteksi breakpoint desktop/mobile.
- Teruskan prop terpisah ke sidebar dan header.
- Pertahankan area main secara fleksibel; jangan menambahkan margin hardcoded yang duplikatif.
- Pastikan layout tidak bergeser saat route berubah.

### `frontend/src/components/layout/AppSidebar.vue`

- Hapus perilaku desktop `w-0 invisible`.
- Gunakan class desktop:
  - Expanded: `lg:w-[260px]`.
  - Collapsed: `lg:w-[76px]`.
- Logo penuh tampil saat expanded.
- Brand mark/compact logo tampil saat collapsed.
- Teks group, caption, badge, dan user detail disembunyikan saat collapsed.
- Icon menu tetap dapat diklik.
- Tambahkan tooltip untuk menu saat collapsed.
- Tombol collapse memakai icon yang mencerminkan arah state.
- Fokus keyboard tetap bekerja.

### `frontend/src/components/layout/AppHeader.vue`

- Hamburger hanya digunakan untuk drawer mobile.
- Pada desktop collapsed, ekspansi dilakukan dari rail/sidebar agar header tidak memiliki dua tombol dengan fungsi sama.
- Di mobile, tampilkan compact logo di header ketika drawer tertutup.

### Asset logo

- Gunakan `/ESB Logo.svg` untuk expanded.
- Gunakan compact brand mark yang proporsional untuk collapsed.
- Bila file compact belum tersedia, tambahkan asset resmi baru, misalnya:

```text
frontend/public/ESB Logo Mark.svg
```

- Jangan mengecilkan wordmark panjang secara paksa karena akan sulit dibaca.

## 6.4 Acceptance criteria

- [ ] Desktop expanded menampilkan logo penuh.
- [ ] Desktop collapsed tetap menampilkan logo/brand mark.
- [ ] Desktop collapsed tetap menampilkan icon navigasi.
- [ ] Tooltip menu muncul saat icon difokuskan atau di-hover.
- [ ] Mobile drawer dapat dibuka dan ditutup.
- [ ] Mobile header tetap menampilkan identitas aplikasi.
- [ ] State collapsed desktop bertahan setelah refresh.
- [ ] Tekan `Escape` menutup drawer mobile, bukan mengubah collapse desktop.
- [ ] Tidak ada horizontal overflow pada viewport 320px, 768px, 1024px, dan 1440px.

---

# 7. Rencana Fitur 2 — My Ticket User

## 7.1 Perbaikan kontrak query

Hindari istilah backend `tab=mine` yang memiliki arti berbeda menurut role.

Gunakan query eksplisit:

```text
GET /api/tickets?scope=reported
GET /api/tickets?scope=assigned
GET /api/tickets?scope=queue
GET /api/tickets?scope=unassigned
GET /api/tickets?scope=all
```

Backward compatibility:

- `tab=mine` masih diterima sementara.
- Untuk user biasa, `mine` dipetakan ke `reported`.
- Untuk admin/superadmin, `mine` dipetakan ke `assigned`.
- Frontend baru harus menggunakan `scope`, bukan `tab`.

## 7.2 Helper authorization backend

Tambahkan helper terpusat, contoh:

```text
backend/src/services/ticketAccessService.js
```

Tanggung jawab helper:

- Normalisasi role.
- Menentukan apakah user superadmin.
- Memeriksa queue yang dimiliki admin.
- Memeriksa apakah user adalah reporter.
- Memeriksa apakah user adalah assignee.
- Membentuk kondisi SQL scope daftar dan statistik.
- Memvalidasi akses ke satu tiket.

Contoh hasil context:

```js
{
  isSuperAdmin: false,
  isQueueAdmin: true,
  isReporter: false,
  isAssignee: true,
  canRead: true,
  canClaim: false,
  canUpdate: true,
  canComment: true,
  canRateCasp: false
}
```

## 7.3 Aturan list ticket

### User biasa

Default:

```sql
WHERE t.pelapor_user_id = req.user.id
```

Scope yang diperbolehkan:

- `reported`

Scope berikut ditolak atau dinormalisasi ke `reported`:

- `queue`
- `unassigned`
- `assigned`
- `all`

### Admin queue

Default:

```sql
WHERE EXISTS (
  SELECT 1
  FROM user_ticket_queues utq
  WHERE utq.user_id = req.user.id
    AND utq.queue_id = t.queue_id
)
```

Scope:

- `queue`: seluruh tiket queue miliknya.
- `unassigned`: queue miliknya dan belum ada assignee.
- `assigned`: `assigned_to_user_id = req.user.id`.
- `reported`: tiket yang dibuat sendiri.

### Superadmin

Scope:

- `all`: seluruh tiket.
- `unassigned`: seluruh tiket belum diambil.
- `assigned`: tiket yang ditangani sendiri.
- `reported`: tiket yang dibuat sendiri.
- `queue`: filter queue opsional.

## 7.4 Statistik tiket

`GET /api/tickets/stats` harus memakai scope akses yang sama dengan daftar tiket.

Response yang disarankan:

```json
{
  "scope": "reported",
  "totalTickets": 10,
  "openTickets": 2,
  "inProgressTickets": 3,
  "pendingTickets": 1,
  "resolvedTickets": 2,
  "closedTickets": 2,
  "unassignedTickets": 0,
  "waitingForCaspTickets": 1,
  "recentTickets": []
}
```

Penting:

- `recentTickets` juga harus mengikuti scope user. Jangan mengambil lima tiket global untuk user biasa.

## 7.5 Object-level authorization

Terapkan pemeriksaan akses pada endpoint berikut:

- `GET /api/tickets/:id/history`
- `GET /api/tickets/:id/comments`
- `POST /api/tickets/:id/comments`
- `PUT /api/tickets/:id`
- `POST /api/tickets/:id/claim`
- `POST /api/tickets/:id/reassign`
- `DELETE /api/tickets/:id`
- Endpoint CASP baru.

Aturan read:

- Reporter tiket.
- Admin yang memiliki queue tiket.
- Superadmin.

Aturan comment:

- Reporter tiket.
- Admin queue tiket.
- Superadmin.

## 7.6 Route hardening

Pada `backend/src/routes/ticketRoutes.js`:

- Tambahkan `requireAdmin` pada endpoint claim.
- Pertimbangkan delete hanya untuk superadmin.
- Update/reassign tetap memerlukan admin dan pemeriksaan queue pada controller/service.

Target:

```js
ticketRouter.post('/:id/claim', requireAdmin, claimTicket)
ticketRouter.post('/:id/reassign', requireAdmin, reassignTicket)
ticketRouter.put('/:id', requireAdmin, updateTicket)
ticketRouter.delete('/:id', requireSuperAdmin, deleteTicket)
```

## 7.7 Perubahan frontend

### User biasa

Tampilkan:

- Tab tunggal **Tiket Saya**.
- Tombol **Buat Tiket Baru**.
- Filter status dan prioritas.
- Detail, history, comment.
- Tombol CASP ketika eligible.

Sembunyikan:

- `Semua Tiket` global.
- `Belum Diambil`.
- Queue filter administratif.
- Tombol claim.
- Edit administratif.
- Delete.
- Reassign.

### Admin queue

Tampilkan tab:

- **Queue Saya**.
- **Belum Diambil**.
- **Ditangani Saya**.
- Opsional: **Dibuat Saya**.

### Superadmin

Tampilkan tab:

- **Semua Tiket**.
- **Belum Diambil**.
- **Ditangani Saya**.
- **Dibuat Saya**.

## 7.8 Legacy data

- Tiket baru sudah mengisi `pelapor_user_id`.
- Tiket lama dibackfill dari nama pada `pelapor`.
- Backfill nama hanya boleh digunakan sebagai migrasi sementara.
- Tambahkan laporan tiket legacy yang masih memiliki `pelapor_user_id IS NULL`.
- Tiket legacy tanpa reporter ID tidak boleh muncul sembarang pada user biasa.
- Superadmin tetap dapat melakukan koreksi reporter melalui tooling administrasi atau SQL migration terkontrol.

## 7.9 Acceptance criteria

- [ ] User A melihat semua tiket yang dibuat User A.
- [ ] User A tidak melihat tiket User B.
- [ ] User biasa tidak melihat tombol claim/edit/delete.
- [ ] Admin IT hanya melihat queue IT yang dimapping kepadanya.
- [ ] Admin GA tidak dapat membuka history tiket IT melalui URL langsung.
- [ ] Superadmin dapat melihat seluruh tiket.
- [ ] Statistik dan recent tickets sama-sama mengikuti scope.
- [ ] Tab tidak lagi memakai arti ambigu di request frontend.
- [ ] Endpoint claim menolak user biasa dengan status `403`.

---

# 8. Rencana Fitur 3 — Warna Card Total Aset IT

## 8.1 Design token

Tambahkan token pada `frontend/src/assets/main.css`:

```css
@theme {
  --color-esb-primary: #FC841B;
  --color-esb-primary-dark: #E26F10;
  --color-esb-primary-light: #FFF2E7;
}
```

Bila Tailwind dynamic token tidak mencakup kebutuhan gradient, tambahkan utility class CSS:

```css
.dashboard-total-assets-card {
  background: linear-gradient(135deg, #FC841B 0%, #E26F10 100%);
}
```

## 8.2 Perubahan card

Pada `DashboardView.vue`:

- Ganti gradient biru card Total Aset menjadi gradient brand.
- Ganti shadow biru menjadi shadow oranye yang halus.
- Pertahankan kontras teks putih minimum WCAG AA.
- Tombol primary di card memakai putih dengan teks brand gelap.
- Tombol secondary memakai border putih/transparan.
- Decorative pattern tidak boleh menurunkan keterbacaan angka total.

## 8.3 Konsistensi

- Jangan mengganti seluruh primary aplikasi secara otomatis hanya karena card Total Aset berubah.
- Warna chart tetap dibedakan per kategori agar mudah dibaca.
- Hindari literal warna baru tersebar di banyak file.

## 8.4 Acceptance criteria

- [ ] Card Total Aset memakai palette yang disepakati.
- [ ] Angka total dan label memiliki kontras yang jelas.
- [ ] Hover/focus tombol tetap terlihat.
- [ ] Warna didefinisikan melalui token/class reusable.
- [ ] Tampilan mobile tidak memotong decorative shape atau action button.

---

# 9. Rencana Fitur 4 — Line, Bar, Pie, dan Donut Chart

## 9.1 Library

Tambahkan dependency frontend:

```bash
npm install chart.js vue-chartjs
```

Alasan:

- Mendukung Line, Bar, Pie, dan Doughnut.
- Responsive.
- Mendukung tooltip dan legend.
- Banyak dipakai dan mudah dirawat.
- Tidak perlu membuat kalkulasi SVG manual.

## 9.2 Sumber data chart

### Line Chart — Tren Penambahan Aset

Data baru:

```json
[
  { "period": "2025-08", "label": "Agu 2025", "added": 4, "cumulative": 80 },
  { "period": "2025-09", "label": "Sep 2025", "added": 7, "cumulative": 87 }
]
```

Rentang default:

- 12 bulan terakhir, termasuk bulan saat ini.

Query PostgreSQL harus menghasilkan bulan kosong dengan nilai nol menggunakan `generate_series`.

Contoh arah query:

```sql
WITH months AS (
  SELECT date_trunc('month', current_date) - (n || ' month')::interval AS month_start
  FROM generate_series(11, 0, -1) AS n
), monthly AS (
  SELECT date_trunc('month', dibuat_pada) AS month_start, COUNT(*)::int AS added
  FROM aset_ti
  WHERE dibuat_pada >= date_trunc('month', current_date) - interval '11 month'
  GROUP BY 1
)
SELECT
  to_char(m.month_start, 'YYYY-MM') AS period,
  COALESCE(x.added, 0) AS added
FROM months m
LEFT JOIN monthly x USING (month_start)
ORDER BY m.month_start;
```

`cumulative` dapat dihitung backend menggunakan window function atau frontend dari total sebelum periode.

### Bar Chart — Aset Berdasarkan Tipe

Gunakan data existing:

```text
stats.byType
```

Contoh kategori:

- Laptop
- Desktop
- Monitor
- Printer
- Server
- Network Device

Tampilkan maksimal 8 kategori teratas. Sisanya digabung sebagai `Lainnya` bila diperlukan.

### Pie Chart — Aset Berdasarkan Kondisi

Gunakan data existing:

```text
stats.byCondition
```

Contoh:

- Baru
- Baik
- Rusak Ringan
- Rusak Berat

### Donut Chart — Aset Berdasarkan Status

Gunakan data existing:

```text
stats.byStatus
```

Contoh:

- Digunakan
- Tersedia
- Maintenance
- Rusak
- Disposal
- Lainnya

## 9.3 Perubahan backend

Pada `showAssetStats`:

- Tambahkan query `monthlyTrend`.
- Pastikan seluruh count dikirim sebagai number, bukan string PostgreSQL.
- Tambahkan metadata:

```json
{
  "generatedAt": "2026-07-28T10:00:00.000Z",
  "range": { "months": 12 }
}
```

Response target:

```json
{
  "totalAssets": 120,
  "totalEmployees": 90,
  "totalUsers": 95,
  "activeUsers": 92,
  "byStatus": [],
  "byCondition": [],
  "byType": [],
  "byLocation": [],
  "monthlyTrend": [],
  "recentAssets": [],
  "generatedAt": "..."
}
```

## 9.4 Komponen frontend

Tambahkan:

```text
frontend/src/components/charts/BaseChartCard.vue
frontend/src/components/charts/AssetTrendLineChart.vue
frontend/src/components/charts/AssetTypeBarChart.vue
frontend/src/components/charts/AssetConditionPieChart.vue
frontend/src/components/charts/AssetStatusDonutChart.vue
frontend/src/composables/useChartTheme.js
```

### `BaseChartCard.vue`

Tanggung jawab:

- Judul.
- Subtitle.
- Slot action/filter.
- Loading skeleton.
- Error state.
- Empty state.
- Container tinggi yang konsisten.

### `useChartTheme.js`

Tanggung jawab:

- Font family.
- Tooltip style.
- Grid color.
- Legend label color.
- Palette terpusat.
- Formatting angka locale Indonesia.

## 9.5 Layout dashboard

Proposal:

```text
Row 1: Existing summary cards
Row 2: Line Chart (8 kolom) + Donut Chart (4 kolom)
Row 3: Bar Chart (7 kolom) + Pie Chart (5 kolom)
Row 4: Sebaran lokasi
Row 5: Aset terbaru
Row 6: Tiket terbaru
```

Responsive:

- Desktop: grid 12 kolom.
- Tablet: 2 kolom.
- Mobile: 1 kolom.
- Tinggi chart mobile minimal 280px.

## 9.6 Cleanup

Setelah chart baru aktif:

- Hapus computed/renderer manual yang tidak dipakai.
- Jangan menyimpan dua implementasi donut sekaligus.
- Pastikan `Chart` instance dihancurkan saat component unmount melalui wrapper library.

## 9.7 Accessibility

Setiap chart harus memiliki:

- Judul yang deskriptif.
- Ringkasan teks untuk screen reader.
- Legend yang tidak hanya mengandalkan warna.
- Tooltip dengan label dan nilai.
- Fallback list/table ringkas bila data penting tidak terbaca dari canvas.

## 9.8 Acceptance criteria

- [ ] Keempat chart tampil dengan data database.
- [ ] Line chart selalu memiliki 12 titik bulan, termasuk bulan tanpa data.
- [ ] Bar chart menampilkan tipe aset teratas.
- [ ] Pie chart menampilkan kondisi aset.
- [ ] Donut chart menampilkan status aset.
- [ ] Chart tidak error ketika semua count nol.
- [ ] Chart resize tanpa overflow.
- [ ] Loading, error, dan empty state tersedia.
- [ ] Tooltip dan legend dapat dibaca.
- [ ] Build production frontend berhasil.

---

# 10. Rencana Fitur 5 — CASP Bintang 1–5 Setelah Resolve

## 10.1 Definisi

CASP pada dokumen ini adalah penilaian kepuasan pelapor terhadap problem solving setelah tiket diselesaikan.

Skala:

| Rating | Label |
|---:|---|
| 1 | Sangat Tidak Puas |
| 2 | Tidak Puas |
| 3 | Cukup |
| 4 | Puas |
| 5 | Sangat Puas |

## 10.2 Aturan bisnis

User boleh memberikan CASP jika seluruh kondisi berikut benar:

1. User terautentikasi.
2. Tiket ditemukan.
3. Status tiket adalah `Resolved`.
4. `req.user.id === ticket.pelapor_user_id`.
5. `req.user.id !== ticket.assigned_to_user_id`.
6. Ticket memiliki assignee yang valid.
7. Belum ada CASP untuk tiket tersebut.
8. Rating berupa integer 1–5.

User tidak boleh memberikan CASP jika:

- User adalah assignee.
- User bukan pelapor.
- Tiket belum `Resolved`.
- Tiket masih `Open`, `In Progress`, atau `Pending`.
- Tiket sudah memiliki CASP.
- Tiket legacy tidak memiliki `pelapor_user_id` yang valid.

## 10.3 Perubahan database

Tambahkan metadata resolve pada `tickets`:

```sql
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS resolved_by_user_id BIGINT NULL;
```

Tambahkan foreign key idempotent:

```sql
ALTER TABLE tickets
  ADD CONSTRAINT fk_ticket_resolved_by_user
  FOREIGN KEY (resolved_by_user_id)
  REFERENCES users(id)
  ON DELETE SET NULL;
```

Buat tabel CASP:

```sql
CREATE TABLE IF NOT EXISTS ticket_casp_ratings (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id              BIGINT NOT NULL UNIQUE,
  reporter_user_id       BIGINT NULL,
  assignee_user_id       BIGINT NULL,
  reporter_name_snapshot VARCHAR(150) NOT NULL,
  assignee_name_snapshot VARCHAR(150) NOT NULL,
  rating                 SMALLINT NOT NULL,
  feedback               TEXT,
  submitted_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_casp_ticket
    FOREIGN KEY (ticket_id)
    REFERENCES tickets(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_casp_reporter
    FOREIGN KEY (reporter_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL,

  CONSTRAINT fk_casp_assignee
    FOREIGN KEY (assignee_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL,

  CONSTRAINT chk_casp_rating
    CHECK (rating BETWEEN 1 AND 5),

  CONSTRAINT chk_casp_different_actor
    CHECK (
      reporter_user_id IS NULL
      OR assignee_user_id IS NULL
      OR reporter_user_id <> assignee_user_id
    )
);
```

Index:

```sql
CREATE INDEX IF NOT EXISTS idx_casp_assignee_submitted
ON ticket_casp_ratings (assignee_user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_casp_reporter_submitted
ON ticket_casp_ratings (reporter_user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_resolved_at
ON tickets (resolved_at DESC)
WHERE status_tiket = 'Resolved';
```

Alasan snapshot nama:

- Riwayat penilaian tetap mudah dibaca jika akun user dihapus atau namanya berubah.
- Authorization tetap menggunakan ID saat submission.

## 10.4 Migration placement

Saat ini tabel ticket/queue banyak dibuat dari controller runtime. Untuk revisi ini:

- Tambahkan struktur final ke `backend/Schema.sql`.
- Tambahkan migration idempotent terpisah, misalnya:

```text
backend/migrations/20260728_add_ticket_casp.sql
```

- Runtime `ensureTicketsTableExists` boleh tetap menjadi fallback sementara, tetapi bukan satu-satunya sumber schema.
- `npm run migrate` harus mampu membuat kolom dan tabel CASP tanpa membuka endpoint tiket terlebih dahulu.

## 10.5 Status transition ke Resolved

Saat `updateTicket` mengubah status dari selain `Resolved` menjadi `Resolved`:

```sql
resolved_at = CURRENT_TIMESTAMP
resolved_by_user_id = req.user.id
```

Saat status berubah dari `Resolved` kembali ke status aktif sebelum CASP dikirim:

```sql
resolved_at = NULL
resolved_by_user_id = NULL
```

Pada fase awal:

- Ticket yang sudah memiliki CASP tidak boleh di-reopen melalui flow normal.
- Superadmin yang membutuhkan koreksi harus menggunakan prosedur administratif yang tercatat di audit log.

Tambahkan log:

```text
AKSI: RESOLVE
Perubahan: Tiket diselesaikan oleh <nama admin>; menunggu penilaian CASP dari pelapor.
```

## 10.6 API CASP

### Cek CASP

```text
GET /api/tickets/:id/casp
```

Response sebelum rating:

```json
{
  "eligible": true,
  "reason": null,
  "rating": null,
  "labels": {
    "1": "Sangat Tidak Puas",
    "2": "Tidak Puas",
    "3": "Cukup",
    "4": "Puas",
    "5": "Sangat Puas"
  }
}
```

Response ketika tidak eligible:

```json
{
  "eligible": false,
  "reason": "Tiket belum berstatus Resolved.",
  "rating": null
}
```

Response setelah rating:

```json
{
  "eligible": false,
  "reason": "CASP sudah dikirim.",
  "rating": {
    "value": 5,
    "label": "Sangat Puas",
    "feedback": "Penyelesaian cepat dan jelas.",
    "submittedAt": "2026-07-28T10:00:00.000Z"
  }
}
```

### Kirim CASP

```text
POST /api/tickets/:id/casp
```

Request:

```json
{
  "rating": 5,
  "feedback": "Penyelesaian cepat dan jelas."
}
```

Response:

```text
201 Created
```

Error utama:

- `400`: rating bukan integer 1–5.
- `403`: bukan reporter atau user adalah assignee.
- `404`: tiket tidak ditemukan.
- `409`: tiket belum resolved atau rating sudah ada.

## 10.7 Transaksi CASP

Submission harus memakai transaction:

1. Lock tiket:

```sql
SELECT ... FROM tickets WHERE id = $1 FOR UPDATE;
```

2. Validasi status, reporter, dan assignee.
3. Cek CASP existing.
4. Insert rating.
5. Insert log ticket.
6. Commit.

Unique constraint `ticket_id` menjadi perlindungan terakhir dari double submit.

## 10.8 Log CASP

Tambahkan log tiket:

```text
AKSI: CASP_SUBMITTED
Perubahan: Pelapor memberikan penilaian CASP 5/5 (Sangat Puas).
```

Feedback tidak perlu dimasukkan seluruhnya ke log apabila mengandung data sensitif. Simpan feedback lengkap di tabel CASP.

## 10.9 UI CASP

Perubahan pada `TicketsView.vue` atau komponen terpisah:

```text
frontend/src/components/tickets/TicketCaspRating.vue
```

Tampilan:

- Banner `Penyelesaian menunggu penilaian Anda` pada ticket `Resolved` milik reporter.
- Lima tombol bintang.
- Hover dan focus menyorot rating sementara.
- Setelah klik, tampilkan label rating.
- Textarea feedback opsional.
- Tombol `Kirim Penilaian`.
- Confirmation state setelah berhasil.

Contoh state:

```js
selectedRating
hoveredRating
feedback
isSubmittingCasp
caspError
```

Accessibility:

- Gunakan button atau radio group, bukan icon pasif.
- Setiap nilai memiliki `aria-label`.
- Dapat dipilih dengan keyboard.
- Status submission memakai `aria-live`.
- Jangan hanya mengandalkan warna kuning pada bintang.

## 10.10 Tampilan untuk assignee/admin

Assignee:

- Dapat melihat rating setelah disubmit.
- Tidak melihat tombol input rating.
- Melihat status `Menunggu CASP` bila belum dinilai.

Superadmin:

- Dapat melihat rating dan feedback.
- Tidak dapat mengisi rating kecuali memang reporter dan bukan assignee.

## 10.11 Acceptance criteria

- [ ] Reporter melihat tombol CASP pada tiket `Resolved`.
- [ ] Reporter tidak melihat tombol CASP sebelum `Resolved`.
- [ ] Assignee tidak dapat mengirim CASP melalui UI maupun API.
- [ ] User lain tidak dapat mengirim CASP melalui URL langsung.
- [ ] Rating hanya menerima integer 1–5.
- [ ] Double submit menghasilkan `409`.
- [ ] Rating disimpan dengan reporter dan assignee yang benar.
- [ ] CASP tercatat pada log tiket.
- [ ] Bintang dapat digunakan dengan mouse dan keyboard.
- [ ] Tiket legacy tanpa reporter ID menampilkan pesan yang aman, bukan memberikan akses berdasarkan nama.

---

# 11. File yang Diperkirakan Berubah

## Frontend

```text
frontend/package.json
frontend/package-lock.json
frontend/src/App.vue
frontend/src/assets/main.css
frontend/src/components/layout/AppSidebar.vue
frontend/src/components/layout/AppHeader.vue
frontend/src/components/charts/BaseChartCard.vue
frontend/src/components/charts/AssetTrendLineChart.vue
frontend/src/components/charts/AssetTypeBarChart.vue
frontend/src/components/charts/AssetConditionPieChart.vue
frontend/src/components/charts/AssetStatusDonutChart.vue
frontend/src/components/tickets/TicketCaspRating.vue
frontend/src/composables/useChartTheme.js
frontend/src/views/DashboardView.vue
frontend/src/views/TicketsView.vue
frontend/public/ESB Logo Mark.svg
```

## Backend

```text
backend/Schema.sql
backend/migrations/20260728_add_ticket_casp.sql
backend/src/controllers/assetController.js
backend/src/controllers/ticketController.js
backend/src/routes/ticketRoutes.js
backend/src/services/ticketAccessService.js
backend/tests/ticketAccess.test.js
backend/tests/ticketCasp.test.js
backend/tests/assetStats.test.js
```

File migration dapat menyesuaikan konvensi repository bila folder migration resmi dibuat dengan nama berbeda.

---

# 12. Urutan Implementasi

## Fase 0 — Baseline dan safety

- [ ] Jalankan backend test existing.
- [ ] Jalankan frontend production build.
- [ ] Catat response aktual `/api/assets/stats` dan `/api/tickets/stats`.
- [ ] Buat data uji untuk user biasa, Admin IT, Admin GA, dan superadmin.
- [ ] Buat backup database sebelum migration.

## Fase 1 — Ticket access dan My Ticket

- [ ] Tambahkan `ticketAccessService`.
- [ ] Refactor list ticket berdasarkan explicit scope.
- [ ] Refactor ticket stats dengan scope sama.
- [ ] Terapkan object-level authorization.
- [ ] Lindungi claim dengan middleware admin.
- [ ] Ubah tab frontend berdasarkan role.
- [ ] Sembunyikan action administratif untuk user.
- [ ] Tambahkan test isolasi antar-user dan antar-queue.

Alasan dikerjakan pertama:

- Ini merupakan masalah akses data dan keamanan, bukan hanya kosmetik.
- CASP bergantung pada reporter/assignee authorization yang benar.

## Fase 2 — Sidebar dan warna card

- [ ] Pisahkan state desktop collapse dan mobile drawer.
- [ ] Tambahkan persistent compact logo.
- [ ] Tambahkan token warna card Total Aset.
- [ ] Uji responsive dan keyboard navigation.

## Fase 3 — Dashboard charts

- [ ] Tambahkan dependency chart.
- [ ] Tambahkan query monthly trend.
- [ ] Normalisasi response angka.
- [ ] Buat reusable chart components.
- [ ] Pasang Line, Bar, Pie, dan Donut Chart.
- [ ] Tambahkan loading/error/empty state.
- [ ] Uji build dan resize.

## Fase 4 — CASP

- [ ] Tambahkan migration CASP.
- [ ] Tambahkan metadata resolved.
- [ ] Tambahkan endpoint GET/POST CASP.
- [ ] Gunakan transaction dan row lock.
- [ ] Tambahkan log CASP.
- [ ] Buat component rating bintang.
- [ ] Integrasikan ke ticket detail dan list state.
- [ ] Tambahkan test authorization dan duplicate submission.

## Fase 5 — Regression dan rollout

- [ ] Jalankan seluruh test.
- [ ] Build frontend production.
- [ ] Uji role matrix.
- [ ] Uji data legacy.
- [ ] Uji database migration dua kali untuk memastikan idempotent.
- [ ] Uji responsive.
- [ ] Uji API dengan token role berbeda.
- [ ] Deploy ke staging.
- [ ] Smoke test sebelum production.

---

# 13. Test Plan

## 13.1 Backend automated test

### Ticket scope

- User hanya mendapat `pelapor_user_id` miliknya.
- Admin hanya mendapat queue yang dimapping.
- Superadmin mendapat semua.
- `recentTickets` tidak bocor lintas scope.
- Statistik sesuai scope.

### Ticket action

- User tidak bisa claim.
- Admin tidak bisa claim queue lain.
- Claim atomik mencegah dua admin mengambil tiket yang sama.
- User tidak bisa update/delete.
- Reporter dan admin queue dapat comment.
- User lain tidak dapat membaca history/comment.

### CASP

- Reporter + Resolved + bukan assignee berhasil.
- Reporter + Open ditolak.
- Assignee ditolak.
- User lain ditolak.
- Rating 0, 6, string, decimal, dan null ditolak.
- Duplicate rating ditolak.
- Log CASP dibuat.
- Transaction rollback bila insert log gagal sesuai strategi yang dipilih.

### Asset analytics

- 12 bulan selalu dikembalikan.
- Bulan tanpa data bernilai nol.
- Count berupa number.
- Empty database tetap menghasilkan response valid.

## 13.2 Frontend test/manual QA

### Sidebar

- Desktop expanded/collapsed.
- Mobile open/close.
- Refresh mempertahankan desktop state.
- Keyboard focus dan Escape.

### My Ticket

- User melihat ticket miliknya.
- Tab/action menyesuaikan role.
- Query scope benar saat ganti tab/filter.
- Direct route ticket milik user lain ditolak backend.

### Charts

- Data normal.
- Empty data.
- Error API.
- Resize cepat.
- Mobile viewport.
- Tooltip dan legend.

### CASP

- Hover bintang.
- Keyboard memilih bintang.
- Submit loading state.
- Error API.
- Success state.
- Reload tetap menampilkan rating existing.

---

# 14. Security Checklist

- [ ] Jangan menerima `pelapor_user_id` dari request create ticket; ambil dari JWT.
- [ ] Jangan menerima `reporter_user_id` atau `assignee_user_id` dari request CASP.
- [ ] Jangan memakai `nama_pengguna` dari body comment sebagai identitas otoritatif.
- [ ] Identity comment harus berasal dari JWT; nama dari body hanya dihapus atau diabaikan.
- [ ] Semua query parameter ID divalidasi integer positif.
- [ ] Feedback CASP dibatasi panjangnya, misalnya maksimum 2.000 karakter.
- [ ] Attachment existing tetap dibatasi tipe dan ukuran pada backend, bukan hanya frontend.
- [ ] Rate limit CASP/comment dipertimbangkan pada tahap hardening.
- [ ] Error authorization tidak membocorkan detail tiket yang tidak boleh diketahui user.
- [ ] Query memakai parameter binding.

---

# 15. Performance Checklist

- [ ] Gunakan index `tickets(pelapor_user_id, dibuat_pada)` untuk My Ticket.
- [ ] Gunakan index queue dan assignee yang sudah ada.
- [ ] Tambahkan index CASP untuk assignee dan waktu.
- [ ] Batasi recent tickets maksimal lima.
- [ ] Pertimbangkan pagination untuk list ticket; jangan memuat seluruh tiket selamanya.
- [ ] Query chart dilakukan sekali per load dashboard, bukan per komponen.
- [ ] Cache analytics singkat dapat ditambahkan jika jumlah aset besar, tetapi tidak wajib pada fase awal.
- [ ] Chart dataset dibatasi agar render mobile tetap ringan.

---

# 16. Observability dan Audit

Tambahkan log server terstruktur untuk:

- Scope ticket yang dipakai.
- Claim gagal karena conflict.
- CASP ditolak karena authorization.
- CASP berhasil disubmit.
- Error migration.
- Error query analytics.

Audit bisnis pada `log_riwayat_tiket`:

- `RESOLVE`
- `CASP_SUBMITTED`
- `REOPEN` bila nantinya diaktifkan.

Jangan log:

- JWT.
- Password.
- Full attachment base64.
- Feedback CASP lengkap pada application log.

---

# 17. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| User lama tidak punya `pelapor_user_id` | My Ticket tidak lengkap | Backfill terkontrol dan laporan data orphan |
| Role `admin` tidak punya queue mapping | Daftar queue kosong | Validasi mapping pada manajemen user dan empty state yang jelas |
| Hardcoded warna tersebar | UI tidak konsisten | Central design token |
| Chart library menambah bundle | Load sedikit lebih besar | Import komponen yang diperlukan dan lazy rendering bila dibutuhkan |
| Query trend berat | Dashboard lambat | Index tanggal dan rentang default 12 bulan |
| Double CASP submit | Duplikasi rating | Transaction + `UNIQUE(ticket_id)` |
| Assignee mencoba rate tiket sendiri | Data bias | Validasi ID pada backend dan DB check |
| Endpoint child ticket bocor | Kebocoran data | Object-level authorization helper |
| Runtime DDL tidak berjalan sebelum request | Schema tidak konsisten | Migration resmi + Schema.sql |
| Sidebar collapsed mengganggu mobile | Layout rusak | Pisahkan desktop collapse dan mobile drawer |

---

# 18. Strategi Commit yang Disarankan

1. `fix(tickets): scope user tickets by reporter and harden access`
2. `fix(layout): keep brand logo visible in collapsed sidebar`
3. `style(dashboard): align total asset card with brand palette`
4. `feat(dashboard): add asset analytics charts`
5. `feat(tickets): add CASP rating for resolved tickets`
6. `test(tickets): cover access scopes and CASP authorization`
7. `docs: update implementation and rollout notes`

Setiap commit harus tetap buildable dan sebisa mungkin dapat diuji secara independen.

---

# 19. Definition of Done

Pekerjaan dinyatakan selesai jika:

- [ ] Logo tetap terlihat saat sidebar desktop di-collapse.
- [ ] User biasa melihat tiket yang dibuatnya sendiri.
- [ ] Tidak ada kebocoran tiket lintas user atau queue.
- [ ] Tombol administratif tidak tersedia untuk user biasa.
- [ ] Card Total Aset menggunakan palette yang sesuai dan terpusat.
- [ ] Dashboard menampilkan Line, Bar, Pie, dan Donut Chart dengan data real.
- [ ] CASP bintang 1–5 hanya dapat diberikan oleh reporter setelah resolve.
- [ ] Assignee tidak dapat memberikan CASP.
- [ ] CASP tersimpan, dapat ditampilkan kembali, dan tercatat di audit tiket.
- [ ] Migration aman dijalankan ulang.
- [ ] Backend tests lulus.
- [ ] Frontend production build lulus.
- [ ] Responsive dan keyboard navigation telah diuji.
- [ ] Staging smoke test lulus untuk user, admin queue, dan superadmin.

---

# 20. Prioritas Akhir

Urutan prioritas implementasi:

1. **My Ticket + authorization**, karena menyangkut fungsi utama dan keamanan data.
2. **CASP**, karena bergantung pada reporter/assignee yang benar.
3. **Dashboard charts**, karena memerlukan kontrak data analytics baru.
4. **Sidebar logo dan card color**, karena terutama perubahan layout/visual dan risikonya lebih rendah.

Walaupun prioritas bisnis dapat mengubah urutan pengerjaan UI, perbaikan authorization harus tetap masuk sebelum CASP dirilis.