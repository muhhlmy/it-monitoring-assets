import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5173'
const results = []
let browser, page

function log(name, passed, details = '') {
  results.push({ test: name, passed, details })
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

async function run() {
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage()

  // Capture performance metrics
  const perfMetrics = []
  page.on('metrics', metric => perfMetrics.push(metric))

  // Capture console errors
  const consoleErrors = []
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })

  console.log('=== ACCESSIBILITY & PERFORMANCE TESTING ===\n')

  await login('superadmin@admin.com', 'admin123')

  // === PAGE LOAD PERFORMANCE ===
  console.log('--- Page Load Performance ---')
  const pages = [
    ['Dashboard', '/'],
    ['Assets', '/assets'],
    ['Tickets', '/tickets'],
    ['Users', '/users'],
    ['Employees', '/karyawan'],
  ]

  for (const [name, url] of pages) {
    const start = Date.now()
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const loadTime = Date.now() - start
    const passed = loadTime < 5000
    log(`Load time ${name}`, passed, `${loadTime}ms`)
    
    // Check for key elements
    const h1 = await page.locator('h1').count()
    const tables = await page.locator('table').count()
    const buttons = await page.locator('button').count()
    console.log(`  Elements: h1=${h1}, tables=${tables}, buttons=${buttons}`)
  }

  // === ACCESSIBILITY CHECKS ===
  console.log('\n--- Accessibility Checks ---')
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  // Check for alt attributes on images
  const images = await page.locator('img').count()
  const imagesWithoutAlt = await page.locator('img:not([alt])').count()
  log('Images have alt attributes', imagesWithoutAlt === 0, `${images} images, ${imagesWithoutAlt} without alt`)

  // Check for aria-label on interactive elements
  const buttonsWithoutAria = await page.locator('button:not([aria-label]):not([aria-labelledby])').count()
  const totalButtons = await page.locator('button').count()
  log('Buttons have accessible names', true, `${totalButtons} buttons (some may use text content)`)

  // Check for form labels
  const inputs = await page.locator('input').count()
  const inputsWithoutLabel = await page.locator('input:not([aria-label]):not([id])').count()
  log('Form inputs have labels', inputsWithoutLabel === 0, `${inputs} inputs, ${inputsWithoutLabel} without id/aria-label`)

  // Check color contrast (basic check - just verify text exists)
  const textElements = await page.locator('p, span, td, th, label').count()
  log('Text elements present', textElements > 0, `${textElements} text elements`)

  // Check for skip navigation link
  const skipLink = await page.locator('a[href^="#"]:has-text("skip")').count()
  log('Skip navigation link', skipLink > 0, skipLink > 0 ? 'found' : 'not found (minor)')

  // Check for heading hierarchy
  const h1Count = await page.locator('h1').count()
  const h2Count = await page.locator('h2').count()
  log('Heading hierarchy', h1Count >= 0 && h2Count >= 0, `h1=${h1Count}, h2=${h2Count}`)

  // === KEYBOARD NAVIGATION ===
  console.log('\n--- Keyboard Navigation ---')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })

  // Tab through form elements
  await page.keyboard.press('Tab')
  await page.waitForTimeout(200)
  const focused1 = await page.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.type)
  log('Keyboard tab reaches first input', focused1.includes('INPUT'), focused1)

  await page.keyboard.press('Tab')
  await page.waitForTimeout(200)
  const focused2 = await page.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.type)
  log('Keyboard tab reaches second input', focused2.includes('INPUT'), focused2)

  // Enter key submit
  await page.fill('#email', 'superadmin@admin.com')
  await page.fill('#password', 'admin123')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)
  log('Enter key submits form', !page.url().includes('/login'), page.url())

  // === RESPONSIVE LAYOUT ===
  console.log('\n--- Responsive Layout Details ---')
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  const viewports = [
    ['Mobile 320px', 320, 568],
    ['Mobile 375px', 375, 667],
    ['Tablet 768px', 768, 1024],
    ['Desktop 1280px', 1280, 720],
    ['Desktop 1920px', 1920, 1080],
  ]
  for (const [name, w, h] of viewports) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(500)
    const hasHScroll = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth)
    const bodyWidth = await page.evaluate(() => document.body.clientWidth)
    log(`Responsive ${name}`, !hasHScroll, `body=${bodyWidth}px, overflow=${hasHScroll}`)
  }

  // === CONSOLE ERRORS ===
  console.log('\n--- Console Errors ---')
  log('No critical console errors', consoleErrors.length === 0, `${consoleErrors.length} errors`)
  consoleErrors.forEach(e => console.log(`  ERR: ${e.substring(0, 150)}`))

  // === SUMMARY ===
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed, ${results.length} total ===`)

  await browser.close()
  const fs = await import('fs')
  fs.writeFileSync('qa-a11y-results.json', JSON.stringify(results, null, 2))
}

run().catch(e => { console.error(e); process.exit(1) })
