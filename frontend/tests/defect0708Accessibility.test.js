import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Helper: Calculate relative luminance according to WCAG 2.1
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function hexToRgb(hex) {
  const cleanHex = hex.replace('#', '')
  const num = parseInt(cleanHex, 16)
  return [num >> 16, (num >> 8) & 255, num & 255]
}

function getContrastRatio(hex1, hex2) {
  const lum1 = getLuminance(...hexToRgb(hex1))
  const lum2 = getLuminance(...hexToRgb(hex2))
  const brightest = Math.max(lum1, lum2)
  const darkest = Math.min(lum1, lum2)
  return (brightest + 0.05) / (darkest + 0.05)
}

test('DEFECT-07 & DEFECT-08 — Accessibility (WCAG 2 AA & Image Alt) Audit Suite', async (t) => {
  await t.test('TEST 1 — Color Contrast Ratios meet WCAG 2 AA (>= 4.5:1 for normal text)', () => {
    const colorPairs = [
      { text: '#0F172A', bg: '#FFFFFF', label: 'Primary text on white' },
      { text: '#475569', bg: '#FFFFFF', label: 'Muted text on white' },
      { text: '#15803D', bg: '#DCFCE7', label: 'Success badge text on success bg' },
      { text: '#854D0E', bg: '#FEF9C3', label: 'Warning badge text on warning bg' },
      { text: '#B91C1C', bg: '#FEE2E2', label: 'Danger badge text on danger bg' },
      { text: '#1E40AF', bg: '#DBEAFE', label: 'Info badge text on info bg' },
      { text: '#0369A1', bg: '#E0F2FE', label: 'Cyan badge text on cyan bg' },
      { text: '#334155', bg: '#F1F5F9', label: 'Default badge text on default bg' },
      { text: '#047857', bg: '#ECFDF5', label: 'Success stat card text on bg' },
      { text: '#B45309', bg: '#FFFBEB', label: 'Warning stat card text on bg' },
      { text: '#B91C1C', bg: '#FEF2F2', label: 'Danger stat card text on bg' },
    ]

    for (const pair of colorPairs) {
      const ratio = getContrastRatio(pair.text, pair.bg)
      assert.ok(
        ratio >= 4.5,
        `Contrast ratio for ${pair.label} (${pair.text} on ${pair.bg}) must be >= 4.5:1, got ${ratio.toFixed(2)}:1`,
      )
    }
  })

  await t.test('TEST 2 — AppBadge.vue uses WCAG 2 AA contrast compliant colors', () => {
    const path = resolve(process.cwd(), 'src/components/ui/AppBadge.vue')
    const content = readFileSync(path, 'utf8')
    assert.equal(content.includes('text-[#13DEB9]'), false, 'AppBadge must not use low-contrast #13DEB9 text')
    assert.equal(content.includes('text-[#FFAE1F]'), false, 'AppBadge must not use low-contrast #FFAE1F text')
    assert.equal(content.includes('text-[#FA896B]'), false, 'AppBadge must not use low-contrast #FA896B text')
    assert.equal(content.includes('text-[#7C8BAC]'), false, 'AppBadge must not use low-contrast #7C8BAC text')
  })

  await t.test('TEST 3 — StatCard.vue uses WCAG 2 AA contrast compliant colors', () => {
    const path = resolve(process.cwd(), 'src/components/ui/StatCard.vue')
    const content = readFileSync(path, 'utf8')
    assert.equal(content.includes('text-[#13DEB9]'), false, 'StatCard must not use low-contrast #13DEB9 text')
    assert.equal(content.includes('text-[#FFAE1F]'), false, 'StatCard must not use low-contrast #FFAE1F text')
    assert.equal(content.includes('text-[#FA896B]'), false, 'StatCard must not use low-contrast #FA896B text')
    assert.equal(content.includes('text-[#7C8BAC]'), false, 'StatCard must not use low-contrast #7C8BAC text')
  })

  await t.test('TEST 4 — LoginView.vue images have descriptive alt text', () => {
    const path = resolve(process.cwd(), 'src/views/LoginView.vue')
    const content = readFileSync(path, 'utf8')
    const imgMatches = content.match(/<img[^>]+>/g) || []
    for (const imgTag of imgMatches) {
      assert.ok(imgTag.includes('alt="'), `Image tag ${imgTag} must contain an alt attribute`)
      assert.equal(imgTag.includes('alt="image"'), false, `Image tag ${imgTag} must not use generic alt="image"`)
      assert.equal(imgTag.includes('alt="picture"'), false, `Image tag ${imgTag} must not use generic alt="picture"`)
    }
  })

  await t.test('TEST 5 — Material Symbols icons inside interactive components have aria-hidden="true"', () => {
    const componentPaths = [
      'src/components/ui/AppBadge.vue',
      'src/components/ui/StatCard.vue',
      'src/components/ui/AppRowActions.vue',
      'src/components/ui/AppPagination.vue',
      'src/components/ui/SearchableSelect.vue',
      'src/components/ui/AppModal.vue',
    ]

    for (const compFile of componentPaths) {
      const path = resolve(process.cwd(), compFile)
      const content = readFileSync(path, 'utf8')
      const spanMatches = content.match(/<span[^>]*class="[^"]*material-symbols-outlined[^"]*"[^>]*>/g) || []
      for (const spanTag of spanMatches) {
        assert.ok(
          spanTag.includes('aria-hidden="true"'),
          `Material symbol span in ${compFile} (${spanTag}) must have aria-hidden="true"`,
        )
      }
    }
  })

  await t.test('TEST 6 — Icon-only buttons have explicit aria-label or title', () => {
    const filesToAudit = [
      'src/components/ui/AppRowActions.vue',
      'src/components/ui/AppPagination.vue',
      'src/components/ui/AppModal.vue',
      'src/components/layout/AppHeader.vue',
      'src/views/LoginView.vue',
    ]

    for (const relFile of filesToAudit) {
      const path = resolve(process.cwd(), relFile)
      const content = readFileSync(path, 'utf8')
      const buttonMatches = content.match(/<button[^>]*>[\s\S]*?<\/button>/g) || []
      for (const buttonTag of buttonMatches) {
        // If button contains only material symbol or icon without visible text, it must have aria-label
        const textWithoutTag = buttonTag.replace(/<[^>]+>/g, '').trim()
        if (!textWithoutTag || textWithoutTag.length <= 1) {
          assert.ok(
            buttonTag.includes('aria-label="') || buttonTag.includes(':aria-label="'),
            `Icon-only button in ${relFile} (${buttonTag.substring(0, 80)}...) must have aria-label`,
          )
        }
      }
    }
  })

  await t.test('TEST 7 — Form controls in LoginView have labels and input id', () => {
    const path = resolve(process.cwd(), 'src/views/LoginView.vue')
    const content = readFileSync(path, 'utf8')
    assert.ok(content.includes('<label for="email"'), 'LoginView must have <label for="email">')
    assert.ok(content.includes('id="email"'), 'LoginView must have id="email" on email input')
    assert.ok(content.includes('<label for="password"'), 'LoginView must have <label for="password">')
    assert.ok(content.includes('id="password"'), 'LoginView must have id="password" on password input')
  })

  await t.test('TEST 8 — AppModal.vue has accessibility dialog attributes', () => {
    const path = resolve(process.cwd(), 'src/components/ui/AppModal.vue')
    const content = readFileSync(path, 'utf8')
    assert.ok(content.includes('role="dialog"'), 'AppModal must have role="dialog"')
    assert.ok(content.includes('aria-modal="true"'), 'AppModal must have aria-modal="true"')
    assert.ok(content.includes(':aria-labelledby='), 'AppModal must bind aria-labelledby')
  })
})
