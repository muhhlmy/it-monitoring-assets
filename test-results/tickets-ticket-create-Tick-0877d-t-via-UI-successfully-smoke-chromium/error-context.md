# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tickets\ticket-create.spec.js >> Ticket Management - Create Ticket Suite >> SMOKE-05: Should create a new helpdesk ticket via UI successfully @smoke
- Location: e2e\tests\tickets\ticket-create.spec.js:5:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /buat tiket|request ticket/i }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('button', { name: /buat tiket|request ticket/i }).first()

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
  2  | import { generateTestTicket } from '../../fixtures/test-data.js'
  3  | 
  4  | test.describe('Ticket Management - Create Ticket Suite', () => {
  5  |   test('SMOKE-05: Should create a new helpdesk ticket via UI successfully @smoke', async ({
  6  |     superAdminPage,
  7  |   }) => {
  8  |     const page = superAdminPage
  9  |     const testTicket = generateTestTicket()
  10 | 
  11 |     await page.goto('/tickets', { waitUntil: 'domcontentloaded' })
  12 | 
  13 |     // 1. Click + Buat Tiket / Request Ticket button
  14 |     const openModalBtn = page.getByRole('button', { name: /buat tiket|request ticket/i }).first()
> 15 |     await expect(openModalBtn).toBeVisible({ timeout: 10000 })
     |                                ^ Error: expect(locator).toBeVisible() failed
  16 |     await openModalBtn.click()
  17 | 
  18 |     // 2. Fill Judul Kendala
  19 |     await page.getByPlaceholder(/laptop tidak dapat/i).fill(testTicket.judul)
  20 | 
  21 |     // Fill Deskripsi
  22 |     const descInput = page.getByPlaceholder(/jelaskan kendala/i)
  23 |     if (await descInput.isVisible()) {
  24 |       await descInput.fill(testTicket.deskripsi)
  25 |     }
  26 | 
  27 |     // Select Unit Tujuan queue if available
  28 |     const queueSelect = page.locator('form select').filter({ hasText: /pilih unit/i }).or(
  29 |       page.locator('form select').nth(1)
  30 |     )
  31 |     if (await queueSelect.isVisible()) {
  32 |       await page.waitForTimeout(300)
  33 |       const optionsCount = await queueSelect.locator('option').count()
  34 |       if (optionsCount > 1) {
  35 |         await queueSelect.selectOption({ index: 1 })
  36 |       }
  37 |     }
  38 | 
  39 |     // 3. Submit form using explicit modal form submit button
  40 |     const submitBtn = page.locator('form button[type="submit"]').last()
  41 |     await submitBtn.click()
  42 | 
  43 |     // 4. Filter or Search for created ticket if needed and verify visibility
  44 |     const searchInput = page.getByPlaceholder(/cari ticket/i)
  45 |     if (await searchInput.isVisible()) {
  46 |       await searchInput.fill(testTicket.judul)
  47 |       await searchInput.press('Enter')
  48 |     }
  49 | 
  50 |     await expect(page.getByText(testTicket.judul)).toBeVisible({ timeout: 10000 })
  51 |   })
  52 | })
  53 | 
```