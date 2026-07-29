# Implementation Plan — Revisi & Peningkatan System IT Monitoring Assets

Dokumen ini berisi rencana implementasi teknis lengkap untuk lima revisi utama sistem IT Monitoring Assets beserta seluruh penyempurnaan keamanan, arsitektur database, dan struktur frontend.

---

## User Review Required

> [!IMPORTANT]
> **Skema Otorisasi & Perubahan Endpoint Tiket**
> - Parameter `tab=mine` pada endpoint `GET /api/tickets` akan disesuaikan:
>   - **User Biasa**: Menampilkan tiket yang **dibuat oleh user tersebut** (`pelapor_user_id = JWT.id`).
>   - **Admin Queue**: Menampilkan tiket yang **sedang ditangani oleh admin tersebut** (`assigned_to_user_id = JWT.id`).
> - Endpoint `POST /api/tickets/:id/claim` akan ditambahkan proteksi `requireAdmin` (User biasa akan menerima HTTP 403 Forbidden).
> - Identitas komentar pada `POST /api/tickets/:id/comments` akan dipaksa mengambil nama & role dari JWT (`req.user`), mengabaikan data dari request body.

> [!NOTE]
> **Penambahan Dependency Frontend**
> - Menginstall `chart.js` dan `vue-chartjs` untuk visualisasi analytics dashboard secara responsive dan modular.

---

## Open Questions

Tidak ada open question kritis saat ini. Semua kontrak API, skema DB, dan aturan otorisasi sudah didefinisikan dengan jelas.

---

## Proposed Changes

---

### Backend Components

#### [NEW] [ticketAccessService.js](file:///c:/Users/Edward%20Dj/it-monitoring-assets/backend/src/services/ticketAccessService.js)
- Membuat service helper terpusat untuk otorisasi tiket:
  - `buildTicketScopeQuery(user, queryParams)`: Menggenerasikan klausa SQL `WHERE` dan `params` berdasarkan role (`superadmin`, `admin`, `user`) dan `scope` (`reported`, `assigned`, `queue`, `unassigned`, `all`).
  - `canAccessTicket(user, ticketId)`: Memeriksa apakah user berhak membaca/mengomentari tiket tertentu (Reporter, Admin Queue, atau Superadmin).
  - `canRateCasp(user, ticket)`: Validasi eligibility CASP (harus status `Resolved`, user adalah reporter, dan user **bukan** assignee).

#### [NEW] [20260728_full_schema_revision.sql](file:///c:/Users/Edward%20Dj/it-monitoring-assets/backend/migrations/20260728_full_schema_revision.sql)
- Script migrasi database idempotent:
  - Penambahan kolom `resolved_at` dan `resolved_by_user_id` pada tabel `tickets`.
  - Pembuatan tabel `ticket_casp_ratings` beserta constraint rating (1–5), unique constraint (`ticket_id`), dan beda aktor (`reporter_user_id <> assignee_user_id`).
  - Penambahan indeks performa: `idx_tickets_pelapor_user`, `idx_tickets_assigned_user`, `idx_casp_assignee_submitted`, dan `idx_casp_reporter_submitted`.
  - Script backfill otomatis untuk tiket legacy tanpa `pelapor_user_id`.

#### [MODIFY] [Schema.sql](file:///c:/Users/Edward%20Dj/it-monitoring-assets/backend/Schema.sql)
- Menyaraskan DDL utama dengan menambahkan tabel `tickets`, `log_riwayat_tiket`, `komentar_tiket`, `ticket_queues`, `user_ticket_queues`, dan `ticket_casp_ratings` agar skema repositori konsisten.

#### [MODIFY] [ticketController.js](file:///c:/Users/Edward%20Dj/it-monitoring-assets/backend/src/controllers/ticketController.js)
- Refactor `listTickets` & `getTicketStats` menggunakan `ticketAccessService`.
- Tambahkan periksa otorisasi objek (Object-Level Authorization) pada `getTicketHistory`, `getTicketComments`, dan `createTicketComment`.
- Paksa identitas komentar di `createTicketComment` menggunakan data dari JWT (`req.user.nama` & `req.user.role`).
- Tambahkan handler CASP:
  - `getTicketCasp`: Mengembalikan eligibility & data rating jika ada.
  - `submitTicketCasp`: Menggunakan DB transaction & `FOR UPDATE` lock untuk menyimpan rating CASP dan menulis `log_riwayat_tiket`.
- Update `updateTicket`: Jika status berubah ke `Resolved`, catat `resolved_at` & `resolved_by_user_id`.

#### [MODIFY] [ticketRoutes.js](file:///c:/Users/Edward%20Dj/it-monitoring-assets/backend/src/routes/ticketRoutes.js)
- Pasang middleware `requireAdmin` pada `POST /:id/claim`.
- Daftarkan endpoint CASP:
  - `GET /:id/casp` -> `getTicketCasp`
  - `POST /:id/casp` -> `submitTicketCasp`

#### [MODIFY] [assetController.js](file:///c:/Users/Edward%20Dj/it-monitoring-assets/backend/src/controllers/assetController.js)
- Tambahkan query `monthlyTrend` (12 bulan terakhir via PostgreSQL `generate_series`) pada fungsi `showAssetStats`.

---

### Frontend Components

#### [NEW] [ESB Logo Mark.svg](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/public/ESB%20Logo%20Mark.svg)
- Asset SVG logo ringkas (brand mark) untuk tampilan sidebar collapsed di desktop.

#### [MODIFY] [App.vue](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/App.vue)
- Refactor state navigasi menjadi dua:
  - `isMobileNavigationOpen` (boolean, default `false`)
  - `isDesktopSidebarCollapsed` (boolean, disinkronkan dengan `localStorage: app_sidebar_collapsed`)
- Tambahkan penanganan breakpoint visual secara responsive.

#### [MODIFY] [AppSidebar.vue](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/components/layout/AppSidebar.vue)
- Implementasikan mode desktop collapsed (lebar ~76px) vs expanded (lebar ~260px).
- Tampilkan `ESB Logo.svg` saat expanded dan `ESB Logo Mark.svg` saat collapsed.
- Icon menu navigasi tetap terlihat dan dapat diklik di mode collapsed dengan tooltip pembantu.
- Penyesuaian drawer overlay terpisah untuk layar mobile.

#### [MODIFY] [AppHeader.vue](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/components/layout/AppHeader.vue)
- Sesuaikan tombol hamburger mobile dan tombol collapse rail desktop.
- Tampilkan brand mark pada header mobile ketika drawer ditutup.

#### [MODIFY] [main.css](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/assets/main.css)
- Deklarasikan design token warna brand ESB (Primary: `#FC841B`, Dark: `#E26F10`, Light: `#FFF2E7`).
- Buat utility class reusable `.dashboard-total-assets-card` dengan gradien oranye brand.

#### [MODIFY] [DashboardView.vue](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/views/DashboardView.vue)
- Update warna card Total Aset IT menggunakan gradien brand oranye ESB.
- Integrasikan 4 komponen chart baru (Line, Bar, Pie, Donut) dalam layout grid 12-kolom yang responsive.

#### [NEW] [BaseChartCard.vue](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/components/charts/BaseChartCard.vue)
- Card pembungkus chart reusable dengan dukungan skeleton loading, error state, dan empty state.

#### [NEW] [useChartTheme.js](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/composables/useChartTheme.js)
- Composable penyedia konfigurasi warna, font, tooltip, dan formatter angka terpusat untuk Chart.js.

#### [NEW] [AssetTrendLineChart.vue](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/components/charts/AssetTrendLineChart.vue)
- Komponen Line Chart untuk tren penambahan aset 12 bulan terakhir.

#### [NEW] [AssetTypeBarChart.vue](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/components/charts/AssetTypeBarChart.vue)
- Komponen Bar Chart untuk distribusi tipe perangkat aset teratas.

#### [NEW] [AssetConditionPieChart.vue](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/components/charts/AssetConditionPieChart.vue)
- Komponen Pie Chart untuk distribusi kondisi aset (Baru, Baik, Rusak Ringan, Rusak Berat).

#### [NEW] [AssetStatusDonutChart.vue](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/components/charts/AssetStatusDonutChart.vue)
- Komponen Donut Chart untuk distribusi status aset (Digunakan, Tersedia, Maintenance, Rusak, Disposal).

#### [NEW] [TicketCaspRating.vue](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/components/tickets/TicketCaspRating.vue)
- Komponen UI penilaian bintang 1–5 dengan label deskriptif, hover effect, keyboard accessibility (`aria-label`), dan textarea feedback opsional.

#### [MODIFY] [TicketsView.vue](file:///c:/Users/Edward%20Dj/it-monitoring-assets/frontend/src/views/TicketsView.vue)
- Sesuaikan tab tiket berdasarkan role user:
  - **User Biasa**: Tab "Tiket Saya" (menampilkan tiket ciptaannya sendiri), sembunyikan tombol claim/edit/delete.
  - **Admin Queue**: Tab "Queue Saya", "Belum Diambil", "Ditangani Saya".
  - **Superadmin**: Tab "Semua Tiket", "Belum Diambil", "Ditangani Saya".
- Integrasikan komponen `TicketCaspRating` di dalam modal detail tiket berstatus `Resolved`.

---

## Verification Plan

### Automated Tests
- Menjalankan test suite backend yang ada dan menambahkan unit test baru:
  - `backend/tests/ticketAccess.test.js`: Verifikasi klausa query scope per role.
  - `backend/tests/ticketCasp.test.js`: Verifikasi aturan eligibility CASP, otorisasi pelapor vs assignee, dan pencegahan double submit.
  - `backend/tests/assetStats.test.js`: Verifikasi format JSON response stats & query monthly trend.
- Menjalankan linting dan build frontend:
  - `npm run check` pada folder backend.
  - `npm run build` pada folder frontend.

### Manual Verification
1. **Sidebar Collapse & Logo Test**:
   - Buka aplikasi pada tampilan Desktop (>=1024px). Klik tombol collapse. Pastikan lebar sidebar mengecil menjadi ~76px, brand mark tetap terlihat, icon menu tetap dapat diklik, dan state tersimpan setelah refresh.
   - Pada tampilan Mobile (<1024px), buka & tutup drawer navigation. Pastikan logo header mobile terlihat saat drawer tertutup.
2. **My Ticket & Access Matrix Test**:
   - Login sebagai **User Biasa**: Pastikan hanya melihat tiket yang dilaporkan oleh user tersebut. Pastikan tombol Claim, Edit, Delete tidak muncul.
   - Login sebagai **Admin Queue**: Pastikan dapat berpindah tab "Queue Saya", "Belum Diambil", dan "Ditangani Saya".
3. **Card Color & Dashboard Charts Test**:
   - Buka Dashboard: Pastikan card Total Aset berganti warna oranye ESB dengan kontras rasio WCAG AA.
   - Verifikasi keempat chart (Line, Bar, Pie, Donut) tampil dengan data aktual dari database.
4. **CASP Rating Test**:
   - Sebagai Admin, ubah status tiket milik User menjadi `Resolved`.
   - Login sebagai User (Pelapor): Buka detail tiket tersebut. Pastikan widget bintang CASP muncul. Berikan rating 5 bintang dan kirim.
   - Pastikan status berubah menjadi "Terpenuhi", rating tersimpan di database, dan dicatat pada log riwayat tiket.
   - Pastikan Admin/Assignee tiket tidak mendapat opsi untuk mengisi CASP tiket tersebut.
