import { expect, test } from '../../fixtures/auth.fixture.js'

test.describe('Role-Based Access Control (RBAC) Suite', () => {
  test('Normal User: should be authenticated and redirected to /my-assets', async ({
    userPage,
  }) => {
    const page = userPage

    // Positive assertion: user is authenticated
    await page.goto('/my-assets', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/my-assets/)
    await expect(page.getByRole('heading', { name: /aset/i }).first()).toBeVisible({ timeout: 10000 })
  })

  test('Normal User: should be denied access to Superadmin-only Users Management page (/users)', async ({
    userPage,
  }) => {
    const page = userPage

    // First confirm user is authenticated via /my-assets
    await page.goto('/my-assets', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/login/)

    // Then attempt to access restricted route
    await page.goto('/users', { waitUntil: 'domcontentloaded' })

    // Should redirect away from /users (either to /my-assets or /)
    await expect(page).not.toHaveURL(/\/users$/)
  })

  test('Normal User: should be denied access to Export Data page (/export)', async ({
    userPage,
  }) => {
    const page = userPage

    // First confirm user is authenticated
    await page.goto('/my-assets', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/login/)

    // Then attempt to access restricted route
    await page.goto('/export', { waitUntil: 'domcontentloaded' })

    // Should redirect away from /export
    await expect(page).not.toHaveURL(/\/export$/)
  })

  test('Superadmin: should have full access to Users Management page (/users)', async ({
    superAdminPage,
  }) => {
    const page = superAdminPage

    // First confirm superadmin is authenticated
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByText('Total Aset', { exact: true }).first()).toBeVisible({ timeout: 10000 })

    // Then verify access to /users
    await page.goto('/users', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/users$/)
    await expect(page.getByRole('heading', { name: /pengguna|user management/i }).first()).toBeVisible()
  })

  test('Admin: should be authenticated and have access to Dashboard & Asset Management', async ({
    adminPage,
  }) => {
    const page = adminPage

    // First confirm admin is authenticated via Dashboard
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByText('Total Aset', { exact: true }).first()).toBeVisible({ timeout: 10000 })

    // Then verify access to /assets
    await page.goto('/assets', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/assets$/)
    await expect(page.getByRole('heading', { name: /aset/i }).first()).toBeVisible()
  })
})