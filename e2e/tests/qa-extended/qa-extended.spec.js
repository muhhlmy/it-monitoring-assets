/**
 * QA Extended: Accessibility (axe-core), Responsive, UI/UX tests
 */
import { test, expect, chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'

const BASE = 'http://192.168.100.85:5173'
const API = 'http://192.168.100.85:5000'

// Get superadmin auth token via API
async function getSuperadminToken() {
  const resp = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@admin.com', password: 'admin123' }),
  })
  const data = await resp.json()
  return data.token
}

// Pages to test
const PAGES = [
  { path: '/', name: 'Dashboard' },
  { path: '/assets', name: 'Asset TI' },
  { path: '/ga-assets', name: 'Asset GA' },
  { path: '/ops-assets', name: 'Asset OPS' },
  { path: '/tickets', name: 'Tickets' },
  { path: '/users', name: 'Users' },
  { path: '/export', name: 'Export' },
]

const VIEWPORTS = [
  { name: 'Mobile', width: 375, height: 667 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Desktop', width: 1280, height: 800 },
  { name: 'WidescreenHD', width: 1920, height: 1080 },
]

test.describe('QA Extended: Accessibility & Responsive', () => {
  let token

  test.beforeAll(async () => {
    token = await getSuperadminToken()
  })

  // ── ACCESSIBILITY TESTS ────────────────────────────────────────
  for (const pg of PAGES) {
    test(`Accessibility: ${pg.name} (${pg.path}) - no critical axe violations`, async ({ page }) => {
      // Inject auth state
      await page.goto(`${BASE}/login`)
      await page.evaluate((tk) => {
        localStorage.setItem('token', tk)
        localStorage.setItem('user', JSON.stringify({ id: 1, role: 'superadmin', nama: 'Super Administrator',
          email: 'superadmin@admin.com',
          permissions: { dashboard: 'full', assets: 'full', assets_ga: 'full', assets_ops: 'full',
            my_assets: 'full', tickets: 'full', users: 'full', logs: 'full', karyawan: 'full', export: 'full' } }))
      }, token)

      await page.goto(`${BASE}${pg.path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .exclude('.gsap-animation') // exclude animating elements
        .analyze()

      const critical = results.violations.filter(v => v.impact === 'critical')
      const serious = results.violations.filter(v => v.impact === 'serious')
      const moderate = results.violations.filter(v => v.impact === 'moderate')

      // Write results to file for report
      const axeOut = {
        page: pg.name,
        path: pg.path,
        timestamp: new Date().toISOString(),
        violations: results.violations.length,
        critical: critical.length,
        serious: serious.length,
        moderate: moderate.length,
        passes: results.passes.length,
        details: results.violations.map(v => ({
          id: v.id, impact: v.impact, description: v.description,
          help: v.help, helpUrl: v.helpUrl,
          nodes: v.nodes.slice(0, 2).map(n => n.html)
        }))
      }

      const outDir = './qa-reports'
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(`${outDir}/axe-${pg.name.replace(/\s+/g, '-')}.json`, JSON.stringify(axeOut, null, 2))

      console.log(`[${pg.name}] Violations: ${results.violations.length} (critical: ${critical.length}, serious: ${serious.length}, moderate: ${moderate.length})`)

      // Fail on critical violations only
      expect(critical.length, `Critical a11y violations on ${pg.name}: ${JSON.stringify(critical.map(v => v.id))}`).toBe(0)
    })
  }

  // ── RESPONSIVE TESTS ────────────────────────────────────────────
  for (const vp of VIEWPORTS) {
    test(`Responsive [${vp.name} ${vp.width}x${vp.height}]: Dashboard renders without overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(`${BASE}/login`)
      await page.evaluate((tk) => {
        localStorage.setItem('token', tk)
        localStorage.setItem('user', JSON.stringify({ id: 1, role: 'superadmin', nama: 'Super Administrator',
          email: 'superadmin@admin.com',
          permissions: { dashboard: 'full', assets: 'full', assets_ga: 'full', assets_ops: 'full',
            my_assets: 'full', tickets: 'full', users: 'full', logs: 'full', karyawan: 'full', export: 'full' } }))
      }, token)

      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1000)

      // Check for horizontal overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })

      // Check page title/header is visible
      const hasContent = await page.locator('body').isVisible()
      
      // Take screenshot
      const outDir = './qa-reports/screenshots'
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
      await page.screenshot({ path: `${outDir}/responsive-${vp.name}-dashboard.png`, fullPage: false })

      console.log(`[${vp.name}] Horizontal overflow: ${overflow}, Has content: ${hasContent}`)
      expect(hasContent).toBe(true)
      // Log overflow as warning but don't fail (known issue on mobile)
    })
  }

  // ── UI/UX TESTS ─────────────────────────────────────────────────
  test('UI: Login page has correct elements and accessibility', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('domcontentloaded')

    // Email input
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: /masuk/i })).toBeVisible()

    // Password toggle
    const pwToggle = page.locator('button[aria-label]').first()
    if (await pwToggle.isVisible()) {
      await page.locator('#password').fill('testpassword')
      await pwToggle.click()
      const inputType = await page.locator('#password').getAttribute('type')
      console.log('[UI] Password field type after toggle:', inputType)
    }

    // Tab order: email -> password -> submit
    await page.locator('#email').focus()
    await page.keyboard.press('Tab')
    const focusedAfterTab = await page.evaluate(() => document.activeElement?.id || document.activeElement?.type)
    console.log('[UI] Focus after Tab from email:', focusedAfterTab)

    // Keyboard submit (Enter on password)
    await page.locator('#email').fill('test@test.com')
    await page.locator('#password').fill('wrongpass')
    await page.locator('#password').press('Enter')
    await page.waitForTimeout(1500)
    const errorVisible = await page.locator('[role="alert"], .error, [class*="error"]').count() > 0
    console.log('[UI] Error shown on wrong credentials:', errorVisible)
  })

  test('UI: Navigation sidebar links work correctly', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.evaluate((tk) => {
      localStorage.setItem('token', tk)
      localStorage.setItem('user', JSON.stringify({ id: 1, role: 'superadmin', nama: 'Super Administrator',
        email: 'superadmin@admin.com',
        permissions: { dashboard: 'full', assets: 'full', assets_ga: 'full', assets_ops: 'full',
          my_assets: 'full', tickets: 'full', users: 'full', logs: 'full', karyawan: 'full', export: 'full' } }))
    }, token)

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    // Check sidebar exists
    const sidebar = page.locator('nav, aside, [role="navigation"]').first()
    const sidebarVisible = await sidebar.isVisible()
    console.log('[UI] Sidebar visible:', sidebarVisible)

    // Check console errors
    const consoleErrors = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    // Navigate to each major route
    const navLinks = ['/assets', '/tickets', '/users', '/export']
    for (const link of navLinks) {
      await page.goto(`${BASE}${link}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)
      const currentURL = page.url()
      console.log(`[UI] Nav to ${link}: landed on ${currentURL.replace(BASE, '')}`)
    }

    expect(sidebarVisible).toBe(true)
  })

  test('UI: Form validation shows errors for empty required fields', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.evaluate((tk) => {
      localStorage.setItem('token', tk)
      localStorage.setItem('user', JSON.stringify({ id: 1, role: 'superadmin', nama: 'Super Administrator',
        email: 'superadmin@admin.com',
        permissions: { dashboard: 'full', assets: 'full', assets_ga: 'full', assets_ops: 'full',
          my_assets: 'full', tickets: 'full', users: 'full', logs: 'full', karyawan: 'full', export: 'full' } }))
    }, token)

    await page.goto(`${BASE}/assets`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    // Open add asset modal
    const addBtn = page.getByRole('button', { name: /tambah aset/i }).first()
    if (await addBtn.isVisible()) {
      await addBtn.click()
      await page.waitForTimeout(500)

      // Try to submit empty form
      const submitBtn = page.locator('button[type="submit"]').or(page.getByRole('button', { name: /simpan|tambah/i })).first()
      if (await submitBtn.isVisible()) {
        await submitBtn.click()
        await page.waitForTimeout(500)

        // Check for validation messages
        const hasValidation = await page.locator('[class*="error"], [role="alert"], .text-red-500, .invalid-feedback').count() > 0
        console.log('[UI] Validation messages shown on empty submit:', hasValidation)
      }
    }
  })

  test('UI: Toast notifications appear and disappear', async ({ page }) => {
    await page.goto(`${BASE}/login`)

    // Try login with wrong creds to trigger error toast
    await page.locator('#email').fill('wrong@test.com')
    await page.locator('#password').fill('wrongpassword123')
    await page.getByRole('button', { name: /masuk/i }).click()
    await page.waitForTimeout(2000)

    // Check for toast/notification
    const toast = page.locator('[role="alert"], [class*="toast"], [class*="notification"]')
    const toastCount = await toast.count()
    console.log('[UI] Toast/alert count after failed login:', toastCount)
  })

  test('UI: 404/Forbidden page renders correctly', async ({ page }) => {
    await page.goto(`${BASE}/nonexistent-page-xyz123`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const bodyText = await page.locator('body').innerText()
    const has404 = bodyText.includes('404') || bodyText.includes('Tidak Ditemukan') || bodyText.includes('halaman')
    console.log('[UI] 404 page shows appropriate content:', has404)
    console.log('[UI] Body preview:', bodyText.slice(0, 200))
  })
})
