import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSourceUrl = new URL('../src/App.vue', import.meta.url)
const logsSourceUrl = new URL('../src/views/LogsView.vue', import.meta.url)
const routerSourceUrl = new URL('../src/router/index.js', import.meta.url)

test('app shell does not write client-authored audit events', async () => {
  const source = await readFile(appSourceUrl, 'utf8')
  const forbiddenPatterns = [
    ['audit endpoint', /\/api\/logs\/audit/],
    ['API composable', /\buseApi\b/],
    ['client actor field', /\bnama_pengguna\s*:/],
    ['hard-coded actor name', /Admin IT/],
    ['hard-coded actor email', /admin@esb\.co\.id/],
    ['hard-coded actor IP address', /127\.0\.0\.1/],
  ]

  for (const [label, pattern] of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, `App.vue still contains ${label}`)
  }
})

test('export route is marked and guarded as superadmin-only UX', async () => {
  const source = await readFile(routerSourceUrl, 'utf8')

  assert.match(
    source,
    /name:\s*'export'[\s\S]*?superadminOnly:\s*true/,
    'export route must declare the superadmin-only UX boundary',
  )
  assert.match(
    source,
    /if\s*\(to\.meta\.superadminOnly\s*&&\s*!isSuper\)/,
    'router must deny the superadmin-only route to other roles',
  )
})

test('login audit UI and request are conditional on superadmin', async () => {
  const source = await readFile(logsSourceUrl, 'utf8')

  assert.match(source, /if\s*\(isSuperAdmin\.value\)[\s\S]*?get\('\/api\/logs\/audit'\)/)
  assert.match(source, /v-if="isSuperAdmin"[\s\S]*?Audit Aktivitas Login/)
})
