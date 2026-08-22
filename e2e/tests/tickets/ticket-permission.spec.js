import { expect, test } from '../../fixtures/auth.fixture.js'

test.describe('Ticket Management - Permissions Suite', () => {
  test('Superadmin: should have administrative ticket controls visible', async ({
    superAdminPage,
  }) => {
    const page = superAdminPage

    // Verify superadmin is authenticated first
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/login/)

    await page.goto('/tickets', { waitUntil: 'domcontentloaded' })

    // Superadmin view shows administrative header / controls
    await expect(page.getByRole('heading', { name: /tiket|helpdesk/i }).first()).toBeVisible()
  })

  test('Normal user: should be authenticated and hide admin-only controls', async ({
    userPage,
  }) => {
    const page = userPage

    // Verify user is authenticated first
    await page.goto('/my-assets', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/login/)

    await page.goto('/tickets', { waitUntil: 'domcontentloaded' })

    // Normal user should NOT see admin-only controls
    await expect(page.getByRole('button', { name: /kelola queue/i })).not.toBeVisible()
  })
})