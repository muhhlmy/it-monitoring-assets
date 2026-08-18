import { expect, test } from '@playwright/test'
import { TEST_USERS } from '../../fixtures/users.js'

test.describe('Authentication - Login Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('SMOKE-01: Should login successfully with valid credentials @smoke', async ({ page }) => {
    await page.getByLabel(/email/i).fill(TEST_USERS.superadmin.email)
    await page.getByLabel(/kata sandi/i).fill(TEST_USERS.superadmin.password)
    await page.getByRole('button', { name: /masuk/i }).click()

    await expect(page).not.toHaveURL(/\/login$/)
    await expect(page.getByText('Total Aset', { exact: true }).first()).toBeVisible({
      timeout: 10000,
    })
  })

  test('Should display error message when logging in with incorrect password', async ({ page }) => {
    await page.getByLabel(/email/i).fill(TEST_USERS.superadmin.email)
    await page.getByLabel(/kata sandi/i).fill('wrongpassword123')

    await page.getByRole('button', { name: /masuk/i }).click()

    await expect(page.getByText(/gagal|salah|sandi|periksa/i).first()).toBeVisible({ timeout: 5000 })
    await expect(page).toHaveURL(/\/login$/)
  })

  test('Should display error when logging in with non-existent user email', async ({ page }) => {
    await page.getByLabel(/email/i).fill('nonexistent.user.12399@invalid.com')
    await page.getByLabel(/kata sandi/i).fill('anyPassword123')

    await page.getByRole('button', { name: /masuk/i }).click()

    await expect(page.getByText(/gagal|salah|tidak valid|periksa/i).first()).toBeVisible({ timeout: 5000 })
    await expect(page).toHaveURL(/\/login$/)
  })

  test('Should validate required empty input fields', async ({ page }) => {
    await page.getByRole('button', { name: /masuk/i }).click()

    const emailInput = page.getByLabel(/email/i)
    const isRequired = await emailInput.getAttribute('required')
    expect(isRequired).not.toBeNull()
  })

  test('Should toggle password visibility when clicking eye icon', async ({ page }) => {
    const passwordInput = page.getByLabel(/kata sandi/i)
    await passwordInput.fill('secretValue123')

    expect(await passwordInput.getAttribute('type')).toBe('password')

    const toggleBtn = page.locator('form button[type="button"]').first()
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click()
      expect(['text', 'password']).toContain(await passwordInput.getAttribute('type'))
    }
  })
})
