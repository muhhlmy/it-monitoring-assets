# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assets\asset-list.spec.js >> Asset Management - List & Search Suite >> SMOKE-03: Should render asset list table properly @smoke
- Location: e2e\tests\assets\asset-list.spec.js:8:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /aset|karyawan/i }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: /aset|karyawan/i }).first()

```

```yaml
- img "ESB People Technology Logo"
- text: IT Assets Monitoring
- heading "TrackIT" [level=1]
- paragraph: Platform terpadu untuk pengawasan aset IT, inventarisasi perangkat, dan manajemen tiket support secara real-time.
- text: "Asset Control Health Monitoring Support Desk © 2026 ESB People Technology #AhlinyaBisnisKuliner"
- heading "Selamat datang kembali" [level=2]
- paragraph: Masuk dengan akun enterprise Anda untuk melanjutkan.
- text: Email atau nama pengguna
- textbox "Email atau nama pengguna":
  - /placeholder: admin@esb.co.id
- text: Kata sandi
- textbox "Kata sandi":
  - /placeholder: ••••••••
- button "Tampilkan kata sandi"
- checkbox "Ingat saya"
- text: Ingat saya
- button "Masuk"
```

# Test source

```ts
  1  | import { expect, test } from '../../fixtures/auth.fixture.js'
  2  | 
  3  | test.describe('Asset Management - List & Search Suite', () => {
  4  |   test.beforeEach(async ({ superAdminPage }) => {
  5  |     await superAdminPage.goto('/assets', { waitUntil: 'domcontentloaded' })
  6  |   })
  7  | 
  8  |   test('SMOKE-03: Should render asset list table properly @smoke', async ({ superAdminPage }) => {
  9  |     const page = superAdminPage
  10 | 
  11 |     // Verify main page title and table or asset list surface
> 12 |     await expect(page.getByRole('heading', { name: /aset|karyawan/i }).first()).toBeVisible()
     |                                                                                 ^ Error: expect(locator).toBeVisible() failed
  13 |     await expect(page.locator('table').or(page.getByText(/perangkat|belum ada|status/i).first())).toBeVisible({
  14 |       timeout: 10000,
  15 |     })
  16 |   })
  17 | 
  18 |   test('Should search assets using search input', async ({ superAdminPage }) => {
  19 |     const page = superAdminPage
  20 |     const searchInput = page.getByPlaceholder(/cari/i).first()
  21 | 
  22 |     if (await searchInput.isVisible()) {
  23 |       await searchInput.fill('Lenovo')
  24 |       await page.waitForTimeout(300)
  25 | 
  26 |       const tableRows = page.locator('tbody tr')
  27 |       expect(await tableRows.count()).toBeGreaterThanOrEqual(0)
  28 |     }
  29 |   })
  30 | 
  31 |   test('Should filter asset list by status option', async ({ superAdminPage }) => {
  32 |     const page = superAdminPage
  33 |     const statusSelect = page.locator('select').first()
  34 | 
  35 |     if (await statusSelect.isVisible()) {
  36 |       await statusSelect.selectOption({ index: 1 })
  37 |       await expect(page.locator('body')).toBeVisible()
  38 |     }
  39 |   })
  40 | })
  41 | 
```