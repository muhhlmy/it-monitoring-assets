# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tickets\ticket-permission.spec.js >> Ticket Management - Permissions Suite >> Superadmin should have administrative ticket controls visible
- Location: e2e\tests\tickets\ticket-permission.spec.js:4:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /tiket|helpdesk/i }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: /tiket|helpdesk/i }).first()

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
  3  | test.describe('Ticket Management - Permissions Suite', () => {
  4  |   test('Superadmin should have administrative ticket controls visible', async ({
  5  |     superAdminPage,
  6  |   }) => {
  7  |     const page = superAdminPage
  8  | 
  9  |     await page.goto('/tickets', { waitUntil: 'domcontentloaded' })
  10 | 
  11 |     // Superadmin view shows administrative header / controls
> 12 |     await expect(page.getByRole('heading', { name: /tiket|helpdesk/i }).first()).toBeVisible()
     |                                                                                  ^ Error: expect(locator).toBeVisible() failed
  13 |   })
  14 | 
  15 |   test('Normal user view should hide admin-only export / assignment actions', async ({
  16 |     userPage,
  17 |   }) => {
  18 |     const page = userPage
  19 | 
  20 |     await page.goto('/tickets', { waitUntil: 'domcontentloaded' })
  21 | 
  22 |     // Normal user should not see superadmin delete or admin queue configuration controls
  23 |     await expect(page.getByRole('button', { name: /kelola queue/i })).not.toBeVisible()
  24 |   })
  25 | })
  26 | 
```