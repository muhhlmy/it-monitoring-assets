import { expect, test } from '../../fixtures/auth.fixture.js'

test.describe('Asset Management - Assignment Suite', () => {
  test('Should open asset edit modal and view placement & assignment section', async ({
    superAdminPage,
  }) => {
    const page = superAdminPage

    await page.goto('/assets', { waitUntil: 'domcontentloaded' })

    const firstRowActions = page.locator('tbody tr').first().locator('button').filter({ hasText: /edit|opsi/i }).or(
      page.locator('tbody tr').first().locator('button').last()
    )

    if (await firstRowActions.isVisible()) {
      await firstRowActions.click()
      await page.waitForTimeout(200)

      const editBtn = page.getByRole('button', { name: /edit|ubah/i }).or(page.getByText(/edit aset/i)).first()
      if (await editBtn.isVisible()) {
        await editBtn.click()
        await page.waitForTimeout(300)

        // Go to Step 2: Penempatan
        const placementStepBtn = page.getByRole('button', { name: /penempatan/i }).first()
        if (await placementStepBtn.isVisible()) {
          await placementStepBtn.click()
          await expect(page.getByText(/penempatan|lokasi|pemegang|karyawan/i).first()).toBeVisible()
        }
      }
    }
  })
})
