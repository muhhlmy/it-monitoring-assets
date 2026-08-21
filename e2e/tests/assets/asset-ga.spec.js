import { expect, test } from '../../fixtures/auth.fixture.js'

test.describe('Aset GA Management Suite', () => {
  test('Should open Aset GA view and display title @smoke', async ({ superAdminPage }) => {
    const page = superAdminPage
    await page.goto('/assets-ga', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: /aset ga/i }).last()).toBeVisible({ timeout: 10000 })
  })
})
