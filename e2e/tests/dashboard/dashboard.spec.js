import { expect, test } from '../../fixtures/auth.fixture.js'

test.describe('Dashboard Suite', () => {
  test('SMOKE-02: Should load dashboard and display key KPI cards & charts @smoke', async ({
    superAdminPage,
  }) => {
    const page = superAdminPage
    const consoleErrors = []

    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Verify main KPI cards
    await expect(page.getByText('Total Aset', { exact: true }).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Digunakan', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Stok', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Dalam Perawatan', { exact: true }).first()).toBeVisible()

    // Verify charts containers
    await expect(page.getByText('Tren Aset Bulanan', { exact: true })).toBeVisible()
    await expect(page.getByText('Status Aset', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Kondisi Aset', { exact: true }).first()).toBeVisible()

    expect(consoleErrors).toHaveLength(0)
  })

  test('Should navigate to Asset Management when clicking + Tambah on Total Asset card', async ({
    superAdminPage,
  }) => {
    const page = superAdminPage
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const addBtn = page.getByRole('button', { name: /\+\s*tambah/i }).first()
    if (await addBtn.isVisible()) {
      await addBtn.click()
      await expect(page).toHaveURL(/\/assets/)
    }
  })
})
