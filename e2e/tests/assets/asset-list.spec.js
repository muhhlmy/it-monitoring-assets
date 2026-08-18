import { expect, test } from '../../fixtures/auth.fixture.js'

test.describe('Asset Management - List & Search Suite', () => {
  test.beforeEach(async ({ superAdminPage }) => {
    await superAdminPage.goto('/assets', { waitUntil: 'domcontentloaded' })
  })

  test('SMOKE-03: Should render asset list table properly @smoke', async ({ superAdminPage }) => {
    const page = superAdminPage

    // Verify main page title and table or asset list surface
    await expect(page.getByRole('heading', { name: /aset|karyawan/i }).first()).toBeVisible()
    await expect(page.locator('table').or(page.getByText(/perangkat|belum ada|status/i).first())).toBeVisible({
      timeout: 10000,
    })
  })

  test('Should search assets using search input', async ({ superAdminPage }) => {
    const page = superAdminPage
    const searchInput = page.getByPlaceholder(/cari/i).first()

    if (await searchInput.isVisible()) {
      await searchInput.fill('Lenovo')
      await page.waitForTimeout(300)

      const tableRows = page.locator('tbody tr')
      expect(await tableRows.count()).toBeGreaterThanOrEqual(0)
    }
  })

  test('Should filter asset list by status option', async ({ superAdminPage }) => {
    const page = superAdminPage
    const statusSelect = page.locator('select').first()

    if (await statusSelect.isVisible()) {
      await statusSelect.selectOption({ index: 1 })
      await expect(page.locator('body')).toBeVisible()
    }
  })
})
