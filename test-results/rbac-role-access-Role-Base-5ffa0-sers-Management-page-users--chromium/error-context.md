# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rbac\role-access.spec.js >> Role-Based Access Control (RBAC) Suite >> Superadmin should have full access to Users Management page (/users)
- Location: e2e\tests\rbac\role-access.spec.js:26:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /pengguna|user management/i }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: /pengguna|user management/i }).first()

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
  3  | test.describe('Role-Based Access Control (RBAC) Suite', () => {
  4  |   test('Normal User should be denied access to Superadmin-only Users Management page (/users)', async ({
  5  |     userPage,
  6  |   }) => {
  7  |     const page = userPage
  8  | 
  9  |     await page.goto('/users', { waitUntil: 'domcontentloaded' })
  10 | 
  11 |     // Should redirect away from /users
  12 |     await expect(page).not.toHaveURL(/\/users$/)
  13 |   })
  14 | 
  15 |   test('Normal User should be denied access to Export Data page (/export)', async ({
  16 |     userPage,
  17 |   }) => {
  18 |     const page = userPage
  19 | 
  20 |     await page.goto('/export', { waitUntil: 'domcontentloaded' })
  21 | 
  22 |     // Should redirect away from /export
  23 |     await expect(page).not.toHaveURL(/\/export$/)
  24 |   })
  25 | 
  26 |   test('Superadmin should have full access to Users Management page (/users)', async ({
  27 |     superAdminPage,
  28 |   }) => {
  29 |     const page = superAdminPage
  30 | 
  31 |     await page.goto('/users', { waitUntil: 'domcontentloaded' })
  32 | 
  33 |     await expect(page).toHaveURL(/\/users$/)
> 34 |     await expect(page.getByRole('heading', { name: /pengguna|user management/i }).first()).toBeVisible()
     |                                                                                            ^ Error: expect(locator).toBeVisible() failed
  35 |   })
  36 | })
  37 | 
```