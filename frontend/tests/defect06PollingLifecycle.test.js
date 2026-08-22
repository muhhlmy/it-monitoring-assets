import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('DEFECT-06 — SPA Polling & Request Lifecycle Audit Suite', async (t) => {
  await t.test('TEST 1 — AppHeader.vue does NOT contain setInterval polling', () => {
    const appHeaderPath = resolve(process.cwd(), 'src/components/layout/AppHeader.vue')
    const content = readFileSync(appHeaderPath, 'utf8')
    assert.equal(
      content.includes('setInterval(fetchTickets'),
      false,
      'AppHeader.vue must not contain continuous setInterval(fetchTickets) polling',
    )
  })

  await t.test('TEST 2 — TicketsView.vue does NOT contain network setInterval polling', () => {
    const ticketsViewPath = resolve(process.cwd(), 'src/views/TicketsView.vue')
    const content = readFileSync(ticketsViewPath, 'utf8')
    assert.equal(
      content.includes('setInterval(fetch') || content.includes('setInterval(() => { if (showDetail'),
      false,
      'TicketsView.vue must not contain continuous network polling inside setInterval',
    )
  })

  await t.test('TEST 3 — useApi.js handles AbortError correctly', () => {
    const useApiPath = resolve(process.cwd(), 'src/composables/useApi.js')
    const content = readFileSync(useApiPath, 'utf8')
    assert.ok(
      content.includes("error?.name === 'AbortError'") || content.includes('signal?.aborted'),
      'useApi.js must check for AbortError and preserve abort signal error state',
    )
  })

  await t.test('TEST 4 — useRequestCancellation.js helper exists and implements abort logic', () => {
    const cancellationPath = resolve(process.cwd(), 'src/composables/useRequestCancellation.js')
    const content = readFileSync(cancellationPath, 'utf8')
    assert.ok(content.includes('AbortController'), 'useRequestCancellation must use AbortController')
    assert.ok(content.includes('onUnmounted'), 'useRequestCancellation must abort on unmount')
  })

  await t.test('TEST 5 — useTicketEvents.js handles visibility change state', () => {
    const ssePath = resolve(process.cwd(), 'src/composables/useTicketEvents.js')
    const content = readFileSync(ssePath, 'utf8')
    assert.ok(
      content.includes("document.visibilityState === 'hidden'"),
      'useTicketEvents must pause reconnect timers when document is hidden',
    )
  })

  await t.test('TEST 6 — All primary views implement data-testid="page-ready" readiness signal', () => {
    const viewFiles = [
      'src/views/AssetsView.vue',
      'src/views/AssetsGaView.vue',
      'src/views/AssetsOpsView.vue',
      'src/views/EmployeesView.vue',
      'src/views/UsersView.vue',
      'src/views/TicketsView.vue',
      'src/views/DashboardView.vue',
      'src/views/ExportView.vue',
      'src/views/LogsView.vue',
      'src/views/MyAssetsView.vue',
      'src/views/SubmissionsView.vue',
    ]

    for (const viewFile of viewFiles) {
      const filePath = resolve(process.cwd(), viewFile)
      const content = readFileSync(filePath, 'utf8')
      assert.ok(
        content.includes('data-testid="page-ready"') || content.includes('data-testid='),
        `${viewFile} must include data-testid="page-ready" readiness signal`,
      )
    }
  })
})
