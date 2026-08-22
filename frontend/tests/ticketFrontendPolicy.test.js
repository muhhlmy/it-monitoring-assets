import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  TICKET_ROLES,
  canAccessFrontendFeature,
  canReadPermission,
  canWritePermission,
  findFirstAllowedRoute,
  getTicketEligibility,
  isSuperAdminRole,
  normalizeTicketRole,
} from '../src/utils/permissionAccess.js'

const routerSourceUrl = new URL('../src/router/index.js', import.meta.url)
const ticketsSourceUrl = new URL('../src/views/TicketsView.vue', import.meta.url)
const usersSourceUrl = new URL('../src/views/UsersView.vue', import.meta.url)
const appHeaderSourceUrl = new URL(
  '../src/components/layout/AppHeader.vue',
  import.meta.url,
)

function sourceSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`)

  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`)
  return source.slice(start, end)
}

test('permission access recognizes explicit levels and legacy booleans', () => {
  const cases = [
    { value: 'none', canRead: false, canWrite: false },
    { value: 'read_only', canRead: true, canWrite: false },
    { value: 'full', canRead: true, canWrite: true },
    { value: true, canRead: true, canWrite: true },
    { value: false, canRead: false, canWrite: false },
  ]

  for (const permissionCase of cases) {
    assert.equal(
      canReadPermission(permissionCase.value),
      permissionCase.canRead,
      `Unexpected read access for ${String(permissionCase.value)}`,
    )
    assert.equal(
      canWritePermission(permissionCase.value),
      permissionCase.canWrite,
      `Unexpected write access for ${String(permissionCase.value)}`,
    )
  }
})

test('ticket frontend role handling mirrors the backend and denies unknown roles', () => {
  assert.equal(normalizeTicketRole('user'), TICKET_ROLES.REPORTER)
  assert.equal(normalizeTicketRole('reporter'), TICKET_ROLES.REPORTER)
  assert.equal(normalizeTicketRole('admin'), TICKET_ROLES.ADMIN)
  assert.equal(normalizeTicketRole('super admin'), TICKET_ROLES.SUPERADMIN)
  assert.equal(normalizeTicketRole('teknisi'), TICKET_ROLES.UNKNOWN)

  assert.deepEqual(
    getTicketEligibility({
      role: 'teknisi',
      permissions: { tickets: 'full' },
    }),
    { role: TICKET_ROLES.UNKNOWN, canRead: false, canWrite: false },
  )
  assert.deepEqual(
    getTicketEligibility({
      role: 'admin',
      permissions: { tickets: 'read_only' },
    }),
    { role: TICKET_ROLES.ADMIN, canRead: true, canWrite: false },
  )
})

test('user management recognizes only exact superadmin role aliases', () => {
  assert.equal(isSuperAdminRole('superadmin'), true)
  assert.equal(isSuperAdminRole(' super admin '), true)
  assert.equal(isSuperAdminRole('admin'), false)
  assert.equal(isSuperAdminRole('administrator'), false)
  assert.equal(isSuperAdminRole(null), false)
})

test('user management UI never derives superadmin permissions from ordinary admin', async () => {
  const source = await readFile(usersSourceUrl, 'utf8')
  const roleChangeSection = sourceSection(
    source,
    'function handleRoleChange()',
    'function getPermissionBadge',
  )
  const badgeSection = sourceSection(
    source,
    'function getPermissionBadge(u)',
    'const filteredUsers',
  )
  const editSection = sourceSection(source, 'function openEdit(u)', 'function openDelete')

  assert.doesNotMatch(source, /\.includes\(\s*['"]admin['"]\s*\)/)
  assert.match(roleChangeSection, /const isSuper = isRoleSuperAdmin\(form\.value\.role\)/)
  assert.match(badgeSection, /const isSuper = isRoleSuperAdmin\(u\.role\)/)
  assert.match(editSection, /const isSuper = isRoleSuperAdmin\(u\.role\)/)
  assert.match(
    roleChangeSection,
    /if \(isSuper\) \{[\s\S]*form\.value\.permissions = superadminPermissions\(\)/,
  )
  assert.match(editSection, /isSuper[\s\S]*\? superadminPermissions\(\)/)
})

test('read-only users permission hides and blocks user mutation controls', async () => {
  const source = await readFile(usersSourceUrl, 'utf8')
  const openAddSection = sourceSection(source, 'function openAdd()', 'function openEdit')
  const openEditSection = sourceSection(source, 'function openEdit(u)', 'function openDelete')
  const saveSection = sourceSection(source, 'async function saveUser()', 'async function deleteUser')

  assert.match(source, /const \{ isSuperAdmin, hasWritePermission \} = useAuth\(\)/)
  assert.match(
    source,
    /const canWriteUsers = computed\(\(\) => hasWritePermission\('users'\)\)/,
  )
  assert.match(openAddSection, /if \(!canWriteUsers\.value\) return/)
  assert.match(openEditSection, /if \(!canWriteUsers\.value\) return/)
  assert.match(saveSection, /if \(!canWriteUsers\.value\)/)
  assert.match(
    source,
    /v-if="canWriteUsers"[\s\S]{0,180}?@click="openAdd"/,
  )
  assert.match(
    source,
    /if\s*\(\s*canWriteUsers\.value\s*&&\s*\(\s*isSuperAdmin\.value\s*\|\|\s*!isRoleSuperAdmin\(u\.role\)\s*\)\s*\)[\s\S]*?openEdit\(u\)/,
  )
  assert.match(source, /type="submit"[\s\S]*?:disabled="isSubmitting \|\| !canWriteUsers"/)
  assert.match(
    source,
    /if\s*\(\s*isSuperAdmin\.value\s*&&\s*!isRoleSuperAdmin\(u\.role\)\s*\)[\s\S]*?openDelete\(u\)/,
  )
})

test('router uses explicit permission evaluation instead of string truthiness', async () => {
  const source = await readFile(routerSourceUrl, 'utf8')

  assert.doesNotMatch(source, /!!\s*userPerms\s*\[\s*key\s*\]/)
  assert.match(source, /canAccessFrontendFeature\(user, key\)/)
  assert.match(source, /findFirstAllowedRoute\(user, allowedRouteMap\)/)
  assert.equal((source.match(/const allowedRouteMap\s*=/g) || []).length, 1)
  for (const key of ['assets', 'submissions', 'logs', 'users']) {
    assert.match(source, new RegExp(`key: ['"]${key}['"]`))
  }

  const routeMap = [
    { key: 'dashboard', name: 'dashboard' },
    { key: 'tickets', name: 'tickets' },
    { key: 'assets', name: 'assets' },
    { key: 'export', name: 'export' },
  ]
  const assetsOnly = { role: 'user', permissions: { assets: 'read_only' } }
  const exportOnlyAdmin = { role: 'admin', permissions: { export: 'full' } }
  const unknownTicketRole = {
    role: 'teknisi',
    permissions: { tickets: 'full' },
  }

  assert.equal(findFirstAllowedRoute(assetsOnly, routeMap)?.name, 'assets')
  assert.equal(findFirstAllowedRoute(exportOnlyAdmin, routeMap), null)
  assert.equal(canAccessFrontendFeature(exportOnlyAdmin, 'export'), false)
  assert.equal(canAccessFrontendFeature(unknownTicketRole, 'tickets'), false)
  assert.equal(
    canAccessFrontendFeature({ role: 'super admin', permissions: {} }, 'export'),
    true,
  )
})

test('ticket create and update payloads contain only server-supported fields', async () => {
  const source = await readFile(ticketsSourceUrl, 'utf8')
  const saveSection = sourceSection(
    source,
    'async function saveTicket()',
    'async function confirmDeleteTicket',
  )

  assert.match(saveSection, /const payload\s*=\s*\{/)
  assert.match(saveSection, /queue_id:\s*Number\(form\.value\.queue_id\)/)
  assert.match(saveSection, /status_tiket:\s*form\.value\.status_tiket/)
  assert.doesNotMatch(saveSection, /assigned_to_user_id/)
  assert.doesNotMatch(saveSection, /nama_pengguna|role_pengguna/)
  assert.doesNotMatch(saveSection, /post\([^\n]+form\.value/)
  assert.doesNotMatch(saveSection, /put\([^\n]+form\.value\s*\)/)
})

test('ticket comments omit client-authored actor fields', async () => {
  const source = await readFile(ticketsSourceUrl, 'utf8')
  const commentSection = sourceSection(
    source,
    'async function sendComment()',
    'async function claimTicket',
  )

  assert.match(commentSection, /\/comments`,\s*\{/)
  assert.match(commentSection, /\bpesan\s*:/)
  assert.doesNotMatch(commentSection, /\bnama_pengguna\s*:/)
  assert.doesNotMatch(commentSection, /\brole_pengguna\s*:/)
})

test('queue admin fan-out is denied before requests for non-superadmins', async () => {
  const source = await readFile(ticketsSourceUrl, 'utf8')
  const queueAdminSection = sourceSection(
    source,
    'async function fetchQueueAdmins()',
    'function getAdminsForQueue',
  )
  const denyGateIndex = queueAdminSection.indexOf('if (!isSuperAdmin.value)')
  const fanOutIndex = queueAdminSection.indexOf('await Promise.all')

  assert.notEqual(denyGateIndex, -1)
  assert.notEqual(fanOutIndex, -1)
  assert.ok(
    denyGateIndex < fanOutIndex,
    'superadmin deny gate must run before queue-admin fan-out',
  )
  assert.match(queueAdminSection, /queueAdmins\.value\s*=\s*\{\}\s*[\r\n]+\s*return/)
})

test('ticket delete control is visible to superadmin only', async () => {
  const source = await readFile(ticketsSourceUrl, 'utf8')

  assert.match(
    source,
    /if\s*\(\s*isSuperAdmin\.value\s*\)\s*\{[\s\S]*?onClick:\s*\(\)\s*=>\s*openDelete\(ticket\)/,
  )
})

test('app header gates ticket fetch and SSE behind ticket permission', async () => {
  const source = await readFile(appHeaderSourceUrl, 'utf8')
  const mountSection = sourceSection(source, 'onMounted(() => {', 'onBeforeUnmount')
  const permissionGateIndex = mountSection.indexOf(
    "if (!hasPermission('tickets')) return",
  )
  const fetchIndex = mountSection.indexOf('fetchTickets()')
  const connectIndex = mountSection.indexOf('connectSSE()')

  assert.notEqual(permissionGateIndex, -1)
  for (const guardedIndex of [fetchIndex, connectIndex]) {
    assert.notEqual(guardedIndex, -1)
    assert.ok(
      permissionGateIndex < guardedIndex,
      'ticket permission gate must run before ticket fetch and SSE',
    )
  }
})

test('frontend ticket event handlers do not depend on attachment payloads', async () => {
  const [ticketsSource, appHeaderSource] = await Promise.all([
    readFile(ticketsSourceUrl, 'utf8'),
    readFile(appHeaderSourceUrl, 'utf8'),
  ])
  const ticketsEventSection = sourceSection(
    ticketsSource,
    'const handleTicketCreated = (data) => {',
    '// Debounced stats refresh',
  )
  const headerEventSection = sourceSection(
    appHeaderSource,
    "onSSE('TICKET_UPDATED'",
    'onBeforeUnmount(() => {',
  )

  assert.doesNotMatch(ticketsEventSection, /\battachment\b/)
  assert.doesNotMatch(headerEventSection, /\battachment\b/)
})

test('ticket attachments are loaded individually and never through list or comment polling', async () => {
  const source = await readFile(ticketsSourceUrl, 'utf8')
  const commentListSection = sourceSection(
    source,
    'async function fetchTicketComments',
    'async function loadCommentAttachment',
  )
  const commentAttachmentSection = sourceSection(
    source,
    'async function loadCommentAttachment',
    'const chatContainer',
  )
  const pollingSection = sourceSection(source, 'function startChatPoll', 'function stopChatPoll')
  const editSection = sourceSection(source, 'function openEdit(ticket)', 'function openDetail')
  const detailSection = sourceSection(
    source,
    'function openDetail(ticket)',
    'async function loadSelectedTicketAttachment',
  )
  const saveSection = sourceSection(
    source,
    'async function saveTicket()',
    'async function confirmDeleteTicket',
  )

  assert.match(source, /v-if="ticket\.has_attachment"[\s\S]*?attach_file/)
  assert.doesNotMatch(commentListSection, /comments\/\$\{[^}]+\}\/attachment/)
  assert.match(
    commentAttachmentSection,
    /comments\/\$\{comment\.id\}\/attachment/,
  )
  assert.match(source, /@click="loadCommentAttachment\(c\)"/)
  assert.doesNotMatch(pollingSection, /loadCommentAttachment/)
  assert.match(editSection, /loadSelectedTicketAttachment\(ticket\.id, 'edit'\)/)
  assert.match(detailSection, /loadSelectedTicketAttachment\(ticket\.id, 'detail'\)/)
  assert.match(saveSection, /if \(attachmentChanged\.value\) payload\.attachment/)
})
