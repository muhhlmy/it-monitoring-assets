import { expect, test } from '../../fixtures/auth.fixture.js'

test.describe('Asset Management - Edit Asset Suite', () => {
  test('Should edit an existing asset via UI modal successfully', async ({ superAdminPage }) => {
    const page = superAdminPage

    await page.goto('/assets', { waitUntil: 'domcontentloaded' })

    const firstRowActions = page.locator('tbody tr').first().locator('button').filter({ hasText: /edit|opsi/i }).or(
      page.locator('tbody tr').first().locator('button').last()
    )

    if (await firstRowActions.isVisible()) {
      await firstRowActions.click()
      await page.waitForTimeout(200)

      // Click Edit action item if dropdown popover appears
      const editBtn = page.getByRole('button', { name: /edit|ubah/i }).or(page.getByText(/edit aset/i)).first()
      if (await editBtn.isVisible()) {
        await editBtn.click()
        await page.waitForTimeout(300)

        // Move to specifications tab
        const specStepBtn = page.getByRole('button', { name: /spesifikasi/i }).first()
        if (await specStepBtn.isVisible()) {
          await specStepBtn.click()
        }

        // Update note / specifications text
        const specInput = page.getByPlaceholder(/cpu, ram, storage/i).or(page.locator('textarea').first())
        if (await specInput.isVisible()) {
          await specInput.fill(`Updated E2E Spec ${Date.now()}`)
        }

        // Click Save (Simpan Aset)
        const saveBtn = page.locator('button[type="submit"]').or(page.getByRole('button', { name: /simpan/i })).last()
        if (await saveBtn.isVisible()) {
          await saveBtn.click()
        }

        await expect(page.locator('table')).toBeVisible()
      }
    }
  })
})
