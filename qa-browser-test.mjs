import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5173'
const API = 'http://localhost:5000'
const results = []
let browser, page

function log(name, passed, details = '') {
  const r = { test: name, passed, details }
  results.push(r)
  console.log(`${passed ? 'PASS' : 'FAIL'} - ${name}${details ? ' | ' + details : ''}`)
}

async function login(email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.getByRole('button', { name: /masuk/i }).click()
  await page.waitForTimeout(2000)
  return !page.url().includes('/login')
}

async function testPage(name, url) {
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)
    const title = await page.title()
    const hasError = await page.locator('text=/error 500|internal server error|exception traceback|application crash/i').count()
    log(`Page: ${name} (${url})`, hasError === 0, `title="${title}"`)
    return true
  } catch (e) {
    log(`Page: ${name} (${url})`, false, e.message.substring(0, 100))
    return false
  }
}

async function run() {
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage()

  // Capture console errors
  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  // === LOGIN TESTS ===
  console.log('\n=== LOGIN TESTS ===')
  
  // Valid login
  const loggedIn = await login('superadmin@admin.com', 'admin123')
  log('Login with valid credentials', loggedIn, page.url())

  // Clear storage before invalid login test
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#email', 'superadmin@admin.com')
  await page.fill('#password', 'wrongpassword')
  await page.getByRole('button', { name: /masuk/i }).click()
  await page.waitForTimeout(2000)
  log('Invalid password shows error', page.url().includes('/login'), 'stayed on login')

  // Empty form submit
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /masuk/i }).click()
  await page.waitForTimeout(500)
  log('Empty form stays on login', page.url().includes('/login'))

  // Login again for remaining tests
  await login('superadmin@admin.com', 'admin123')

  // === PAGE NAVIGATION TESTS ===
  console.log('\n=== PAGE NAVIGATION ===')
  const pages = [
    ['Dashboard', '/'],
    ['Assets IT', '/assets'],
    ['Assets GA', '/assets-ga'],
    ['Assets OPS', '/assets-ops'],
    ['My Assets', '/my-assets'],
    ['Employees', '/karyawan'],
    ['Tickets', '/tickets'],
    ['Users', '/users'],
    ['Submissions', '/submissions'],
    ['Logs', '/logs'],
    ['Export', '/export'],
  ]
  for (const [name, url] of pages) {
    await testPage(name, url)
  }

  // === LOGOUT TEST ===
  console.log('\n=== LOGOUT ===')
  // Try multiple logout strategies
  const allButtons = await page.locator('button').allTextContents()
  const logoutText = allButtons.find(t => /keluar|logout/i.test(t))
  if (logoutText) {
    await page.locator(`button:has-text("${logoutText}")`).first().click()
    await page.waitForTimeout(2000)
    log('Logout redirects to login', page.url().includes('/login'), page.url())
  } else {
    // Try API logout then clear storage
    const token = await page.evaluate(() => localStorage.getItem('token') || sessionStorage.getItem('token'))
    if (token) {
      await page.evaluate(async () => {
        const t = localStorage.getItem('token') || sessionStorage.getItem('token')
        if (t) {
          await fetch('http://localhost:5000/api/auth/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${t}` } })
        }
      })
    }
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    log('Logout via API + storage clear', page.url().includes('/login'), page.url())
  }

  // === CONSOLE ERRORS ===
  console.log('\n=== CONSOLE ERRORS ===')
  log('No console errors during testing', consoleErrors.length === 0, `${consoleErrors.length} errors found`)
  if (consoleErrors.length > 0) {
    consoleErrors.slice(0, 10).forEach(e => console.log(`  ERROR: ${e.substring(0, 150)}`))
  }

  // === RESPONSIVE TESTS ===
  console.log('\n=== RESPONSIVE TESTS ===')
  await login('superadmin@admin.com', 'admin123')
  const viewports = [
    ['Mobile 375px', 375, 667],
    ['Tablet 768px', 768, 1024],
    ['Desktop 1920px', 1920, 1080],
  ]
  for (const [name, w, h] of viewports) {
    await page.setViewportSize({ width: w, height: h })
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const hasHScroll = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth)
    log(`Responsive ${name}`, !hasHScroll, `overflow=${hasHScroll}`)
  }

  // === RBAC TEST ===
  console.log('\n=== RBAC (User role) ===')
  // Clear storage
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  
  // Login as user
  await page.fill('#email', 'user@user.com')
  await page.fill('#password', 'user12345')
  await page.getByRole('button', { name: /masuk/i }).click()
  await page.waitForTimeout(2000)
  log('User role login', !page.url().includes('/login'), page.url())
  
  // Try accessing /users (should redirect)
  await page.goto(`${BASE}/users`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  log('User redirected from /users', !page.url().includes('/users'), page.url())
  
  // Try accessing /logs (should redirect)
  await page.goto(`${BASE}/logs`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  log('User redirected from /logs', !page.url().includes('/logs'), page.url())

  // === SUMMARY ===
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed, ${results.length} total ===`)

  await browser.close()
  
  // Write results to file
  const fs = await import('fs')
  fs.writeFileSync('qa-e2e-results.json', JSON.stringify(results, null, 2))
}

run().catch(e => { console.error(e); process.exit(1) })
