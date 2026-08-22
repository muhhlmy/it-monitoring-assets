# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard\dashboard.spec.js >> Dashboard Suite >> SMOKE-02: Should load dashboard and display key KPI cards & charts @smoke
- Location: e2e\tests\dashboard\dashboard.spec.js:4:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Total Aset', { exact: true }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('Total Aset', { exact: true }).first()

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
  3  | test.describe('Dashboard Suite', () => {
  4  |   test('SMOKE-02: Should load dashboard and display key KPI cards & charts @smoke', async ({
  5  |     superAdminPage,
  6  |   }) => {
  7  |     const page = superAdminPage
  8  |     const consoleErrors = []
  9  | 
  10 |     page.on('console', (msg) => {
  11 |       if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
  12 |         consoleErrors.push(msg.text())
  13 |       }
  14 |     })
  15 | 
  16 |     await page.goto('/')
  17 |     await page.waitForLoadState('domcontentloaded')
  18 | 
  19 |     // Verify main KPI cards
> 20 |     await expect(page.getByText('Total Aset', { exact: true }).first()).toBeVisible({ timeout: 10000 })
     |                                                                         ^ Error: expect(locator).toBeVisible() failed
  21 |     await expect(page.getByText('Digunakan', { exact: true }).first()).toBeVisible()
  22 |     await expect(page.getByText('Stok', { exact: true }).first()).toBeVisible()
  23 |     await expect(page.getByText('Dalam Perawatan', { exact: true }).first()).toBeVisible()
  24 | 
  25 |     // Verify charts containers
  26 |     await expect(page.getByText('Tren Aset Bulanan', { exact: true })).toBeVisible()
  27 |     await expect(page.getByText('Status Aset', { exact: true }).first()).toBeVisible()
  28 |     await expect(page.getByText('Kondisi Aset', { exact: true }).first()).toBeVisible()
  29 | 
  30 |     expect(consoleErrors).toHaveLength(0)
  31 |   })
  32 | 
  33 |   test('Should navigate to Asset Management when clicking + Tambah on Total Asset card', async ({
  34 |     superAdminPage,
  35 |   }) => {
  36 |     const page = superAdminPage
  37 |     await page.goto('/')
  38 |     await page.waitForLoadState('domcontentloaded')
  39 | 
  40 |     const addBtn = page.getByRole('button', { name: /\+\s*tambah/i }).first()
  41 |     if (await addBtn.isVisible()) {
  42 |       await addBtn.click()
  43 |       await expect(page).toHaveURL(/\/assets/)
  44 |     }
  45 |   })
  46 | })
  47 | 
```