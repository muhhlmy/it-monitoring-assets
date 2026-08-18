import { expect, test } from '../../fixtures/auth.fixture.js'
import { generateTestTicket } from '../../fixtures/test-data.js'

test.describe('Ticket Management - Create Ticket Suite', () => {
  test('SMOKE-05: Should create a new helpdesk ticket via UI successfully @smoke', async ({
    superAdminPage,
  }) => {
    const page = superAdminPage
    const testTicket = generateTestTicket()

    await page.goto('/tickets', { waitUntil: 'domcontentloaded' })

    // 1. Click + Buat Tiket / Request Ticket button
    const openModalBtn = page.getByRole('button', { name: /buat tiket|request ticket/i }).first()
    await expect(openModalBtn).toBeVisible({ timeout: 10000 })
    await openModalBtn.click()

    // 2. Fill Judul Kendala
    await page.getByPlaceholder(/laptop tidak dapat/i).fill(testTicket.judul)

    // Fill Deskripsi
    const descInput = page.getByPlaceholder(/jelaskan kendala/i)
    if (await descInput.isVisible()) {
      await descInput.fill(testTicket.deskripsi)
    }

    // Select Unit Tujuan queue if available
    const queueSelect = page.locator('form select').filter({ hasText: /pilih unit/i }).or(
      page.locator('form select').nth(1)
    )
    if (await queueSelect.isVisible()) {
      await page.waitForTimeout(300)
      const optionsCount = await queueSelect.locator('option').count()
      if (optionsCount > 1) {
        await queueSelect.selectOption({ index: 1 })
      }
    }

    // 3. Submit form using explicit modal form submit button
    const submitBtn = page.locator('form button[type="submit"]').last()
    await submitBtn.click()

    // 4. Filter or Search for created ticket if needed and verify visibility
    const searchInput = page.getByPlaceholder(/cari ticket/i)
    if (await searchInput.isVisible()) {
      await searchInput.fill(testTicket.judul)
      await searchInput.press('Enter')
    }

    await expect(page.getByText(testTicket.judul)).toBeVisible({ timeout: 10000 })
  })
})
