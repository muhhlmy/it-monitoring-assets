import { test as base } from '@playwright/test'
import path from 'node:path'
import { TEST_USERS } from './users.js'

async function ensureAuthenticated(page, userCred, baseURL) {
  const targetBase = baseURL || 'http://localhost:5173'
  await page.goto(`${targetBase}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(200)
  if (page.url().includes('/login')) {
    await page.getByLabel(/email/i).fill(userCred.email)
    await page.getByLabel(/kata sandi/i).fill(userCred.password)
    await page.getByRole('button', { name: /masuk/i }).click()
    await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 10000 }).catch(() => {})
  }
}

export const test = base.extend({
  // Superadmin authenticated page fixture
  superAdminPage: async ({ browser, baseURL }, use) => {
    const storageStatePath = path.join(process.cwd(), 'e2e', 'auth', 'superadmin.json')
    let context
    try {
      context = await browser.newContext({ storageState: storageStatePath })
    } catch {
      context = await browser.newContext()
    }
    const page = await context.newPage()
    await ensureAuthenticated(page, TEST_USERS.superadmin, baseURL)
    await use(page)
    await context.close()
  },

  // Admin authenticated page fixture
  adminPage: async ({ browser, baseURL }, use) => {
    const storageStatePath = path.join(process.cwd(), 'e2e', 'auth', 'admin.json')
    let context
    try {
      context = await browser.newContext({ storageState: storageStatePath })
    } catch {
      context = await browser.newContext()
    }
    const page = await context.newPage()
    await ensureAuthenticated(page, TEST_USERS.admin, baseURL)
    await use(page)
    await context.close()
  },

  // Normal User authenticated page fixture
  userPage: async ({ browser, baseURL }, use) => {
    const storageStatePath = path.join(process.cwd(), 'e2e', 'auth', 'user.json')
    let context
    try {
      context = await browser.newContext({ storageState: storageStatePath })
    } catch {
      context = await browser.newContext()
    }
    const page = await context.newPage()
    await ensureAuthenticated(page, TEST_USERS.user, baseURL)
    await use(page)
    await context.close()
  },
})

export { expect } from '@playwright/test'
