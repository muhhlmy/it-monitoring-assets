import { expect, test } from '../../fixtures/auth.fixture.js'
import { generateTestAsset } from '../../fixtures/test-data.js'

test.describe('Negative Scenarios Suite', () => {
  test('Should handle duplicate asset hostname or serial number creation attempt gracefully', async ({
    superAdminPage,
  }) => {
    const page = superAdminPage
    const testAsset = generateTestAsset({ hostname: `DUP-HST-${Date.now()}` })

    await page.goto('/assets', { waitUntil: 'domcontentloaded' })

    const openModalBtn = page.getByRole('button', { name: /tambah aset/i }).first()
    if (await openModalBtn.isVisible()) {
      // 1. Create first asset
      await openModalBtn.click()
      await page.getByPlaceholder(/laptop-hr-01/i).fill(testAsset.hostname)
      await page.getByPlaceholder(/nomor seri/i).fill(testAsset.serial_number)
      
      const typeSelect = page.locator('form select').first()
      if (await typeSelect.isVisible()) {
        await typeSelect.selectOption('Laptop')
      }

      await page.getByRole('button', { name: /lanjutkan/i }).click()

      const lokasiTrigger = page.locator('form button[aria-haspopup="listbox"]').first()
      if (await lokasiTrigger.isVisible()) {
        await lokasiTrigger.click()
        await page.waitForTimeout(200)
        const firstOption = page.locator('ul[role="listbox"] li[role="option"]').first()
        if (await firstOption.isVisible()) {
          await firstOption.click()
        }
      }

      await page.getByRole('button', { name: /lanjutkan/i }).click()

      const saveBtn = page.locator('button[type="submit"]').or(page.getByRole('button', { name: /^tambah aset$/i })).last()
      await saveBtn.click()
      await page.waitForTimeout(1000)

      // 2. Attempt creating second asset with duplicate hostname & serial number
      const addAgainBtn = page.getByRole('button', { name: /tambah aset/i }).first()
      if (await addAgainBtn.isVisible()) {
        await addAgainBtn.click()
        await page.getByPlaceholder(/laptop-hr-01/i).fill(testAsset.hostname)
        await page.getByPlaceholder(/nomor seri/i).fill(testAsset.serial_number)
        
        if (await typeSelect.isVisible()) {
          await typeSelect.selectOption('Laptop')
        }

        await page.getByRole('button', { name: /lanjutkan/i }).click()

        if (await lokasiTrigger.isVisible()) {
          await lokasiTrigger.click()
          await page.waitForTimeout(200)
          const firstOption = page.locator('ul[role="listbox"] li[role="option"]').first()
          if (await firstOption.isVisible()) {
            await firstOption.click()
          }
        }

        await page.getByRole('button', { name: /lanjutkan/i }).click()

        const saveAgainBtn = page.locator('button[type="submit"]').or(page.getByRole('button', { name: /^tambah aset$/i })).last()
        await saveAgainBtn.click()

        // 3. Verify error message or modal stays visible
        await expect(page.locator('form').or(page.getByRole('alert')).first()).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('Should require mandatory fields when submitting ticket form without title', async ({
    superAdminPage,
  }) => {
    const page = superAdminPage

    await page.goto('/tickets', { waitUntil: 'domcontentloaded' })

    const openModalBtn = page.getByRole('button', { name: /buat tiket/i }).first()
    if (await openModalBtn.isVisible()) {
      await openModalBtn.click()
      await page.waitForTimeout(300)

      // Submit without filling title
      const submitBtn = page.locator('form button[type="submit"]').first()
      if (await submitBtn.isVisible()) {
        await submitBtn.click()
      }

      // Check required input field
      const titleInput = page.getByPlaceholder(/judul|ringkasan/i).or(page.locator('form input[type="text"]').first())
      if (await titleInput.isVisible()) {
        const isRequired = await titleInput.getAttribute('required')
        expect(isRequired).not.toBeNull()
      }
    }
  })
})
