import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { TEST_USERS } from './fixtures/users.js'

export default async function globalSetup(config) {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:5173'
  const authDir = path.join(process.cwd(), 'e2e', 'auth')

  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  const browser = await chromium.launch()
  const roles = Object.keys(TEST_USERS)
  const failures = []

  for (const roleKey of roles) {
    const userCred = TEST_USERS[roleKey]
    const storageStatePath = path.join(authDir, `${roleKey}.json`)

    const page = await browser.newPage()
    try {
      await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' })

      // Use deterministic locators — #email and #password are stable DOM ids
      await page.locator('#email').fill(userCred.email)
      await page.locator('#password').fill(userCred.password)
      await page.getByRole('button', { name: /masuk/i }).click()

      await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 10000 })

      // Fail fast — jangan lanjut dengan empty auth state
      if (page.url().includes('/login')) {
        throw new Error(
          `Authentication failed for role "${roleKey}": still on login page after submit. ` +
          `URL: ${page.url()}`
        )
      }

      await page.context().storageState({ path: storageStatePath })

      // Validate auth state is not empty
      const raw = fs.readFileSync(storageStatePath, 'utf-8')
      const state = JSON.parse(raw)
      const hasCookies = Array.isArray(state.cookies) && state.cookies.length > 0
      const hasOrigins = Array.isArray(state.origins) && state.origins.length > 0

      if (!hasCookies && !hasOrigins) {
        throw new Error(
          `Authentication state empty for role "${roleKey}". ` +
          `cookies: ${state.cookies?.length || 0}, origins: ${state.origins?.length || 0}`
        )
      }

      console.log(`[global-setup] ✓ Authenticated as "${roleKey}" (${userCred.email})`)
    } catch (err) {
      const reason = err.message || String(err)
      console.error(`[global-setup] ✗ Failed to authenticate "${roleKey}": ${reason}`)
      failures.push({ role: roleKey, error: reason })
    } finally {
      await page.close()
    }
  }

  await browser.close()

  if (failures.length > 0) {
    const summary = failures.map((f) => `  - ${f.role}: ${f.error}`).join('\n')
    throw new Error(
      `Global setup failed: ${failures.length}/${roles.length} role(s) could not authenticate.\n${summary}`
    )
  }
}