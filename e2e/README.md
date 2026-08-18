# End-to-End (E2E) Test Automation Suite — TrackIT (`it-monitoring-assets`)

Panduan lengkap untuk menjalankan **Playwright End-to-End Test Suite** pada repository `muhhlmy/it-monitoring-assets`.

---

## 1. Arsitektur E2E

Automation test menguji journey pengguna secara nyata melintasi seluruh layer aplikasi:

```text
Playwright (Browser Automation)
   ↓
Vue 3 + Vite Frontend (http://localhost:5173)
   ↓
Express.js REST API (http://localhost:3000)
   ↓
PostgreSQL Database (assets_monitoring)
```

---

## 2. Struktur Directory `e2e/`

```text
e2e/
├── global-setup.js                  # Bootstraps auth storage state untuk superadmin, admin, user
├── auth/                            # Directory penyimpan storageState JSON
│   ├── superadmin.json
│   ├── admin.json
│   └── user.json
├── fixtures/                        # Playwright test fixtures & data generators
│   ├── auth.fixture.js              # Menyediakan fixture superAdminPage, adminPage, userPage
│   ├── test-data.js                 # Generator data unik (E2E-AUTO-<timestamp>)
│   └── users.js                     # Credential mapping & user definitions
├── helpers/                         # Helpers API & database
│   ├── api.js                       # Precondition API helper
│   ├── database.js                  # Database query helper
│   └── cleanup.js                   # Safe E2E-AUTO test data cleanup
├── tests/                           # Test specs berdasarkan modul aplikasi
│   ├── auth/
│   │   ├── login.spec.js            # Test UI Login & validasi form (@smoke)
│   │   ├── logout.spec.js           # Test UI Logout & guard route
│   │   └── authentication.spec.js   # Test invalid session & token expiration
│   ├── dashboard/
│   │   └── dashboard.spec.js        # Test KPI cards, charts, & navigasi (@smoke)
│   ├── assets/
│   │   ├── asset-list.spec.js       # Test tabel list asset & pencarian (@smoke)
│   │   ├── asset-create.spec.js     # Test alur tambah asset via modal UI (@smoke)
│   │   ├── asset-edit.spec.js       # Test edit spesifikasi & note asset
│   │   ├── asset-assignment.spec.js # Test penempatan & pemegang aset
│   │   └── asset-delete.spec.js     # Test soft delete asset
│   ├── tickets/
│   │   ├── ticket-create.spec.js    # Test buat tiket helpdesk (@smoke)
│   │   ├── ticket-lifecycle.spec.js # Test rincian & siklus tiket
│   │   └── ticket-permission.spec.js# Test hak akses & kontrol tiket
│   ├── rbac/
│   │   └── role-access.spec.js      # Test RBAC User vs Admin vs Superadmin
│   └── negative/
│       └── negative-scenarios.spec.js# Test penanganan error & duplicate inputs
└── README.md                        # Dokumentasi E2E
```

---

## 3. Prasyarat Environment

Pastikan Node.js (v22+ atau v20+) dan PostgreSQL sudah berjalan.

Copy file konfigurasi `.env.e2e.example`:

```bash
cp .env.e2e.example .env.e2e
```

Pastikan server PostgreSQL memiliki database `assets_monitoring` yang telah di-seed dengan skema `backend/esb_trackit_db.sql`.

---

## 4. Cara Menjalankan E2E Test

### A. Install Playwright Browser
Pertama kali jalankan:

```bash
npx playwright install chromium
```

### B. Menjalankan Smoke Test Suite (Cepat / Critical PR Flow)
Smoke test suite ditandai dengan tag `@smoke`:

```bash
npm run test:e2e:smoke
```

### C. Menjalankan Full E2E Regression Suite
Menjalankan seluruh spec E2E:

```bash
npm run test:e2e
```

### D. Menjalankan E2E dalam Mode Headed (Visual Browser)
Melihat interaksi browser secara langsung:

```bash
npm run test:e2e:headed
```

### E. Menjalankan E2E dalam Mode Playwright UI Interactive Mode

```bash
npm run test:e2e:ui
```

### F. Melihat HTML Report Setelah Test Selesai

```bash
npm run test:e2e:report
```

---

## 5. Strategi Data Test & Safety Rules

1. **Aturan Utama**: E2E test **TIDAK BOLEH** menggunakan atau merusak database produksi.
2. **Identifier Unik**: Setiap data yang dibuat oleh E2E test menggunakan prefix `E2E-AUTO-<timestamp>-<rand>` (misal `E2E-AST-1787028123-456`).
3. **Cleanup**: Script cleanup hanya akan menghapus data yang memiliki identitas `E2E-AUTO` atau `E2E-AST` dan tidak menggunakan query destruktif massal seperti `DELETE FROM assets`.

---

## 6. GitHub Actions Integration

Workflow CI/CD dikonfigurasi di file `.github/workflows/e2e-tests.yml`:
- **Pull Request (PR)**: Menjalankan `npm run test:e2e:smoke` untuk umpan balik cepat.
- **Merge ke Branch `main`**: Menjalankan seluruh regression suite.
- **Artifacts**: Mengunggah HTML report dan screenshot/video rekaman saat terjadi test failure.
