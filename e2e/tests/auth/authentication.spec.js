import { expect, test } from '@playwright/test'

test.describe('Authentication - Session & Guard Suite', () => {
  test('Should redirect unauthenticated visitor trying to access protected route to /login', async ({
    page,
  }) => {
    await page.goto('/assets')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('Should redirect to /login when token in storage is invalid or removed', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('token', 'invalid_jwt_token_12345')
      localStorage.setItem('user', JSON.stringify({ email: 'fake@test.com', role: 'user' }))
    })

    await page.goto('/')
    // App router or API interceptor should reject invalid token and return to /login
    await expect(page.getByRole('button', { name: /masuk/i }).or(page.getByText(/login/i))).toBeVisible()
  })
})
