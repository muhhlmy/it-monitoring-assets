# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assets\asset-ga.spec.js >> Aset GA Management Suite >> Should open Aset GA view and display title @smoke
- Location: e2e\tests\assets\asset-ga.spec.js:4:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /aset ga/i }).last()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: /aset ga/i }).last()

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
  3  | test.describe('Aset GA Management Suite', () => {
  4  |   test('Should open Aset GA view and display title @smoke', async ({ superAdminPage }) => {
  5  |     const page = superAdminPage
  6  |     await page.goto('/assets-ga', { waitUntil: 'domcontentloaded' })
  7  | 
> 8  |     await expect(page.getByRole('heading', { name: /aset ga/i }).last()).toBeVisible({ timeout: 10000 })
     |                                                                          ^ Error: expect(locator).toBeVisible() failed
  9  |   })
  10 | })
  11 | 
```