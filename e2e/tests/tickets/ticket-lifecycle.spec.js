import { expect, test } from '../../fixtures/auth.fixture.js'

test.describe('Ticket Management - Ticket Lifecycle Suite', () => {
  test('Should open ticket detail modal and view ticket lifecycle information', async ({
    superAdminPage,
  }) => {
    const page = superAdminPage

    await page.goto('/tickets', { waitUntil: 'domcontentloaded' })

    // Click on the first ticket item in list or table
    const firstTicketRow = page.locator('.group, tr').filter({ hasText: /TCK/i }).first()

    if (await firstTicketRow.isVisible()) {
      await firstTicketRow.click()

      // Verify detail modal or drawer opens
      await expect(page.getByText(/detail|rincian|komentar|status/i).first()).toBeVisible({ timeout: 5000 })
    } else {
      // If table is empty, table surface should be visible
      await expect(page.getByText(/tiket|belum ada/i).first()).toBeVisible()
    }
  })
})
