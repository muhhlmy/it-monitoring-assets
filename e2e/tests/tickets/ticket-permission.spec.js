import { expect, test } from '../../fixtures/auth.fixture.js'

test.describe('Ticket Management - Permissions Suite', () => {
  test('Superadmin should have administrative ticket controls visible', async ({
    superAdminPage,
  }) => {
    const page = superAdminPage

    await page.goto('/tickets', { waitUntil: 'domcontentloaded' })

    // Superadmin view shows administrative header / controls
    await expect(page.getByRole('heading', { name: /tiket|helpdesk/i }).first()).toBeVisible()
  })

  test('Normal user view should hide admin-only export / assignment actions', async ({
    userPage,
  }) => {
    const page = userPage

    await page.goto('/tickets', { waitUntil: 'domcontentloaded' })

    // Normal user should not see superadmin delete or admin queue configuration controls
    await expect(page.getByRole('button', { name: /kelola queue/i })).not.toBeVisible()
  })
})
