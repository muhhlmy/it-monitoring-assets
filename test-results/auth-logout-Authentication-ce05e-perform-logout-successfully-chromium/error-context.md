# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth\logout.spec.js >> Authentication - Logout Suite >> Should log in via UI and perform logout successfully
- Location: e2e\tests\auth\logout.spec.js:5:3

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
            - text: superadmin@admin.com
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
  4  | test.describe('Authentication - Logout Suite', () => {
  5  |   test('Should log in via UI and perform logout successfully', async ({ page }) => {
  6  |     // 1. Login
  7  |     await page.goto('/login')
  8  |     await page.getByLabel(/email/i).fill(TEST_USERS.superadmin.email)
> 9  |     await page.getByLabel(/kata sandi/i).fill(TEST_USERS.superadmin.password)
     |                                          ^ Error: locator.fill: Error: strict mode violation: getByLabel(/kata sandi/i) resolved to 2 elements:
  10 |     await page.getByRole('button', { name: /masuk/i }).click()
  11 | 
  12 |     // Verify redirected away from /login
  13 |     await expect(page).not.toHaveURL(/\/login$/)
  14 | 
  15 |     // 2. Open user profile popover
  16 |     const profileBtn = page.locator('header button').filter({ hasText: TEST_USERS.superadmin.name.charAt(0) }).or(
  17 |       page.getByText(TEST_USERS.superadmin.name)
  18 |     )
  19 |     await profileBtn.first().click()
  20 | 
  21 |     // 3. Click "Keluar" (Logout)
  22 |     const logoutBtn = page.getByRole('button', { name: /keluar/i })
  23 |     await expect(logoutBtn).toBeVisible()
  24 |     await logoutBtn.click()
  25 | 
  26 |     // 4. Verify redirected back to /login
  27 |     await expect(page).toHaveURL(/\/login$/)
  28 | 
  29 |     // 5. Verify protected route cannot be accessed without session
  30 |     await page.goto('/assets')
  31 |     await expect(page).toHaveURL(/\/login$/)
  32 |   })
  33 | })
  34 | 
```