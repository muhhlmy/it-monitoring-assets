import { expect, test } from '../../fixtures/auth.fixture.js'

test.describe('Role-Based Access Control (RBAC) Suite', () => {
  test('Normal User should be denied access to Superadmin-only Users Management page (/users)', async ({
    userPage,
  }) => {
    const page = userPage

    await page.goto('/users', { waitUntil: 'domcontentloaded' })

    // Should redirect away from /users
    await expect(page).not.toHaveURL(/\/users$/)
  })

  test('Normal User should be denied access to Export Data page (/export)', async ({
    userPage,
  }) => {
    const page = userPage

    await page.goto('/export', { waitUntil: 'domcontentloaded' })

    // Should redirect away from /export
    await expect(page).not.toHaveURL(/\/export$/)
  })

  test('Superadmin should have full access to Users Management page (/users)', async ({
    superAdminPage,
  }) => {
    const page = superAdminPage

    await page.goto('/users', { waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(/\/users$/)
    await expect(page.getByRole('heading', { name: /pengguna|user management/i }).first()).toBeVisible()
  })
})
