# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assets\asset-create.spec.js >> Asset Management - Create Asset Suite >> SMOKE-04: Should create a new asset via UI modal successfully @smoke
- Location: e2e\tests\assets\asset-create.spec.js:5:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /tambah aset/i }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('button', { name: /tambah aset/i }).first()

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
  2  | import { generateTestAsset } from '../../fixtures/test-data.js'
  3  | 
  4  | test.describe('Asset Management - Create Asset Suite', () => {
  5  |   test('SMOKE-04: Should create a new asset via UI modal successfully @smoke', async ({
  6  |     superAdminPage,
  7  |   }) => {
  8  |     const page = superAdminPage
  9  |     const testAsset = generateTestAsset()
  10 | 
  11 |     await page.goto('/assets', { waitUntil: 'domcontentloaded' })
  12 | 
  13 |     // 1. Click + Tambah Aset button
  14 |     const openModalBtn = page.getByRole('button', { name: /tambah aset/i }).first()
> 15 |     await expect(openModalBtn).toBeVisible({ timeout: 10000 })
     |                                ^ Error: expect(locator).toBeVisible() failed
  16 |     await openModalBtn.click()
  17 | 
  18 |     // 2. Step 1 (Info): Hostname, Serial Number & Type
  19 |     await page.getByPlaceholder(/laptop-hr-01/i).fill(testAsset.hostname)
  20 |     await page.getByPlaceholder(/nomor seri/i).fill(testAsset.serial_number)
  21 | 
  22 |     const typeSelect = page.locator('form select').first()
  23 |     if (await typeSelect.isVisible()) {
  24 |       await typeSelect.selectOption('Laptop')
  25 |     }
  26 | 
  27 |     // Step 1 -> Step 2
  28 |     const nextBtn1 = page.getByRole('button', { name: /lanjutkan/i })
  29 |     await expect(nextBtn1).toBeVisible()
  30 |     await nextBtn1.click()
  31 | 
  32 |     // Step 2 (Placement): Select Lokasi Aset option from SearchableSelect
  33 |     const lokasiTrigger = page.locator('form button[aria-haspopup="listbox"]').first()
  34 |     if (await lokasiTrigger.isVisible()) {
  35 |       await lokasiTrigger.click()
  36 |       await page.waitForTimeout(200)
  37 |       const firstOption = page.locator('ul[role="listbox"] li[role="option"]').first()
  38 |       if (await firstOption.isVisible()) {
  39 |         await firstOption.click()
  40 |       } else {
  41 |         await page.locator('input[role="combobox"]').fill('Solo')
  42 |         await page.keyboard.press('Enter')
  43 |       }
  44 |     }
  45 | 
  46 |     // Step 2 -> Step 3
  47 |     const nextBtn2 = page.getByRole('button', { name: /lanjutkan/i })
  48 |     if (await nextBtn2.isVisible()) {
  49 |       await nextBtn2.click()
  50 |     }
  51 | 
  52 |     // 3. Step 3 (Specifications & Notes): Fill Spesifikasi
  53 |     const specInput = page.getByPlaceholder(/cpu, ram, storage/i).or(page.locator('textarea').first())
  54 |     if (await specInput.isVisible()) {
  55 |       await specInput.fill(testAsset.spesifikasi)
  56 |     }
  57 | 
  58 |     // 4. Click submit button on Step 3 (Button name is 'Tambah Aset' when modalMode === 'add')
  59 |     const saveBtn = page.locator('button[type="submit"]').or(page.getByRole('button', { name: /^tambah aset$/i })).last()
  60 |     await expect(saveBtn).toBeVisible({ timeout: 5000 })
  61 |     await saveBtn.click()
  62 | 
  63 |     // 5. Search for created asset and verify visibility in table
  64 |     const searchInput = page.getByPlaceholder(/cari/i).first()
  65 |     if (await searchInput.isVisible()) {
  66 |       await searchInput.fill(testAsset.hostname)
  67 |       await page.waitForTimeout(300)
  68 |     }
  69 | 
  70 |     await expect(page.getByText(testAsset.hostname, { exact: true }).first()).toBeVisible({
  71 |       timeout: 10000,
  72 |     })
  73 |   })
  74 | })
  75 | 
```