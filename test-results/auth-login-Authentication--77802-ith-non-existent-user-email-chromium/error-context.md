# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth\login.spec.js >> Authentication - Login Suite >> Should display error when logging in with non-existent user email
- Location: e2e\tests\auth\login.spec.js:30:3

# Error details

```
Error: locator.fill: Error: strict mode violation: getByLabel(/kata sandi/i) resolved to 2 elements:
    1) <input required="" id="password" type="password" data-v-45f5edd7="" placeholder="••••••••" autocomplete="current-password" class="h-11 w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-10 text-sm text-slate-900 transition-all duration-150 placeholder:text-slate-500 focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2563EB]/10"/> aka getByRole('textbox', { name: 'Kata sandi' })
    2) <button type="button" tabindex="-1" data-v-45f5edd7="" aria-label="Tampilkan kata sandi" class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700 transition-colors focus:outline-none focus:text-slate-700">…</button> aka getByRole('button', { name: 'Tampilkan kata sandi' })

Call log:
  - waiting for getByLabel(/kata sandi/i)

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - img "ESB People Technology Logo" [ref=e6]
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e9]: IT Assets Monitoring
        - heading "TrackIT" [level=1] [ref=e11]
      - paragraph [ref=e12]: Platform terpadu untuk pengawasan aset IT, inventarisasi perangkat, dan manajemen tiket support secara real-time.
      - generic [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]: inventory_2
          - generic [ref=e16]: Asset Control
        - generic [ref=e17]:
          - generic [ref=e18]: devices
          - generic [ref=e19]: Health Monitoring
        - generic [ref=e20]:
          - generic [ref=e21]: confirmation_number
          - generic [ref=e22]: Support Desk
    - generic [ref=e23]:
      - generic [ref=e24]: © 2026 ESB People Technology
      - generic [ref=e25]: "#AhlinyaBisnisKuliner"
  - generic [ref=e27]:
    - generic [ref=e28]:
      - heading "Selamat datang kembali" [level=2] [ref=e29]
      - paragraph [ref=e30]: Masuk dengan akun enterprise Anda untuk melanjutkan.
    - generic [ref=e31]:
      - generic [ref=e32]:
        - generic [ref=e33]: Email atau nama pengguna
        - generic [ref=e34]:
          - generic: mail
          - textbox "Email atau nama pengguna" [active] [ref=e35]:
            - /placeholder: admin@esb.co.id
            - text: nonexistent.user.12399@invalid.com
      - generic [ref=e36]:
        - generic [ref=e37]: Kata sandi
        - generic [ref=e38]:
          - generic: lock
          - textbox "Kata sandi" [ref=e39]:
            - /placeholder: ••••••••
          - button "Tampilkan kata sandi" [ref=e40] [cursor=pointer]:
            - generic [ref=e41]: visibility
      - generic [ref=e43] [cursor=pointer]:
        - checkbox "Ingat saya" [ref=e44]
        - generic [ref=e45]: Ingat saya
      - button "Masuk" [ref=e46] [cursor=pointer]:
        - generic [ref=e48]: arrow_forward
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test'
  2  | import { TEST_USERS } from '../../fixtures/users.js'
  3  | 
  4  | test.describe('Authentication - Login Suite', () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await page.goto('/login')
  7  |   })
  8  | 
  9  |   test('SMOKE-01: Should login successfully with valid credentials @smoke', async ({ page }) => {
  10 |     await page.getByLabel(/email/i).fill(TEST_USERS.superadmin.email)
  11 |     await page.getByLabel(/kata sandi/i).fill(TEST_USERS.superadmin.password)
  12 |     await page.getByRole('button', { name: /masuk/i }).click()
  13 | 
  14 |     await expect(page).not.toHaveURL(/\/login$/)
  15 |     await expect(page.getByText('Total Aset', { exact: true }).first()).toBeVisible({
  16 |       timeout: 10000,
  17 |     })
  18 |   })
  19 | 
  20 |   test('Should display error message when logging in with incorrect password', async ({ page }) => {
  21 |     await page.getByLabel(/email/i).fill(TEST_USERS.superadmin.email)
  22 |     await page.getByLabel(/kata sandi/i).fill('wrongpassword123')
  23 | 
  24 |     await page.getByRole('button', { name: /masuk/i }).click()
  25 | 
  26 |     await expect(page.getByText(/gagal|salah|sandi|periksa/i).first()).toBeVisible({ timeout: 5000 })
  27 |     await expect(page).toHaveURL(/\/login$/)
  28 |   })
  29 | 
  30 |   test('Should display error when logging in with non-existent user email', async ({ page }) => {
  31 |     await page.getByLabel(/email/i).fill('nonexistent.user.12399@invalid.com')
> 32 |     await page.getByLabel(/kata sandi/i).fill('anyPassword123')
     |                                          ^ Error: locator.fill: Error: strict mode violation: getByLabel(/kata sandi/i) resolved to 2 elements:
  33 | 
  34 |     await page.getByRole('button', { name: /masuk/i }).click()
  35 | 
  36 |     await expect(page.getByText(/gagal|salah|tidak valid|periksa/i).first()).toBeVisible({ timeout: 5000 })
  37 |     await expect(page).toHaveURL(/\/login$/)
  38 |   })
  39 | 
  40 |   test('Should validate required empty input fields', async ({ page }) => {
  41 |     await page.getByRole('button', { name: /masuk/i }).click()
  42 | 
  43 |     const emailInput = page.getByLabel(/email/i)
  44 |     const isRequired = await emailInput.getAttribute('required')
  45 |     expect(isRequired).not.toBeNull()
  46 |   })
  47 | 
  48 |   test('Should toggle password visibility when clicking eye icon', async ({ page }) => {
  49 |     const passwordInput = page.getByLabel(/kata sandi/i)
  50 |     await passwordInput.fill('secretValue123')
  51 | 
  52 |     expect(await passwordInput.getAttribute('type')).toBe('password')
  53 | 
  54 |     const toggleBtn = page.locator('form button[type="button"]').first()
  55 |     if (await toggleBtn.isVisible()) {
  56 |       await toggleBtn.click()
  57 |       expect(['text', 'password']).toContain(await passwordInput.getAttribute('type'))
  58 |     }
  59 |   })
  60 | })
  61 | 
```