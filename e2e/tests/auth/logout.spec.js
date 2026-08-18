import { expect, test } from '@playwright/test'
import { TEST_USERS } from '../../fixtures/users.js'

test.describe('Authentication - Logout Suite', () => {
  test('Should log in via UI and perform logout successfully', async ({ page }) => {
    // 1. Login
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(TEST_USERS.superadmin.email)
    await page.getByLabel(/kata sandi/i).fill(TEST_USERS.superadmin.password)
    await page.getByRole('button', { name: /masuk/i }).click()

    // Verify redirected away from /login
    await expect(page).not.toHaveURL(/\/login$/)

    // 2. Open user profile popover
    const profileBtn = page.locator('header button').filter({ hasText: TEST_USERS.superadmin.name.charAt(0) }).or(
      page.getByText(TEST_USERS.superadmin.name)
    )
    await profileBtn.first().click()

    // 3. Click "Keluar" (Logout)
    const logoutBtn = page.getByRole('button', { name: /keluar/i })
    await expect(logoutBtn).toBeVisible()
    await logoutBtn.click()

    // 4. Verify redirected back to /login
    await expect(page).toHaveURL(/\/login$/)

    // 5. Verify protected route cannot be accessed without session
    await page.goto('/assets')
    await expect(page).toHaveURL(/\/login$/)
  })
})
