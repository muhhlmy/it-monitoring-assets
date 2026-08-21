import { expect, test } from '../../fixtures/auth.fixture.js'

test.describe('Aset OPS Management Suite', () => {
  test('Should open Aset OPS view and display title @smoke', async ({ superAdminPage }) => {
    const page = superAdminPage
    await page.goto('/assets-ops', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: /aset ops/i }).last()).toBeVisible({ timeout: 10000 })
  })
})
