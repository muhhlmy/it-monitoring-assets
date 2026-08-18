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

  for (const roleKey of roles) {
    const userCred = TEST_USERS[roleKey]
    const storageStatePath = path.join(authDir, `${roleKey}.json`)

    const page = await browser.newPage()
    try {
      await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' })

      await page.getByLabel(/email/i).fill(userCred.email)
      await page.getByLabel(/kata sandi/i).fill(userCred.password)
      await page.getByRole('button', { name: /masuk/i }).click()

      await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 10000 }).catch(() => {})

      if (!page.url().includes('/login')) {
        await page.context().storageState({ path: storageStatePath })
      } else {
        const fallbackState = { cookies: [], origins: [] }
        fs.writeFileSync(storageStatePath, JSON.stringify(fallbackState, null, 2))
      }
    } catch {
      const fallbackState = { cookies: [], origins: [] }
      fs.writeFileSync(storageStatePath, JSON.stringify(fallbackState, null, 2))
    } finally {
      await page.close()
    }
  }

  await browser.close()
}
