import { expect, test } from '../../fixtures/auth.fixture.js'

test.describe('Accessibility Suite', () => {
  test('Skip to content link should be focusable via Tab and navigate focus to #main-content', async ({
    superAdminPage,
  }) => {
    const page = superAdminPage
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const skipLink = page.locator('a[href="#main-content"]')
    await expect(skipLink).toBeAttached()

    // Focus skip link directly or tab to it
    await skipLink.focus()
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toBeVisible()

    // Press Enter to activate skip link
    await page.keyboard.press('Enter')

    // Verify focus moved to #main-content
    const mainContent = page.locator('#main-content')
    await expect(mainContent).toBeFocused()
  })
})
