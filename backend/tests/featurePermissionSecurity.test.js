import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'p'.repeat(32)
process.env.DB_HOST = '127.0.0.1'
process.env.DB_PORT = '5432'
process.env.DB_USER = 'test_user'
process.env.DB_PASSWORD = 'test_password_not_used'
process.env.DB_NAME = 'test_database'
process.env.CORS_ORIGINS = 'http://localhost:5173'

const {
  authorizeAnyPermission,
  authorizePermission,
  hasReadFeaturePermission,
  hasWriteFeaturePermission,
} = await import('../src/middleware/authMiddleware.js')
const {
  normalizePermissions,
  DEFAULT_USER_PERMISSIONS,
} = await import('../src/services/permissionService.js')

function evaluateMiddleware(middleware, user) {
  let nextCalled = false
  let statusCode = null
  let body = null
  const response = {
    status(value) {
      statusCode = value
      return this
    },
    json(value) {
      body = value
      return this
    },
  }

  middleware({ user }, response, () => {
    nextCalled = true
  })
  return { nextCalled, statusCode, body }
}

test('feature permission levels separate read from write and fail closed', () => {
  for (const [level, read, write] of [
    ['none', false, false],
    ['read_only', true, false],
    ['full', true, true],
    [true, true, true],
    [false, false, false],
    [undefined, false, false],
    ['unexpected', false, false],
  ]) {
    assert.equal(hasReadFeaturePermission(level), read)
    assert.equal(hasWriteFeaturePermission(level), write)
  }

  const readUsers = authorizePermission('users', 'read')
  const writeUsers = authorizePermission('users', 'write')

  assert.equal(evaluateMiddleware(readUsers, undefined).statusCode, 401)
  assert.equal(
    evaluateMiddleware(readUsers, {
      role: 'admin',
      permissions: { users: 'none' },
    }).statusCode,
    403,
  )
  assert.equal(
    evaluateMiddleware(readUsers, {
      role: 'admin',
      permissions: { users: 'read_only' },
    }).nextCalled,
    true,
  )
  assert.equal(
    evaluateMiddleware(writeUsers, {
      role: 'admin',
      permissions: { users: 'read_only' },
    }).statusCode,
    403,
  )
  assert.equal(
    evaluateMiddleware(writeUsers, {
      role: 'admin',
      permissions: { users: 'full' },
    }).nextCalled,
    true,
  )
  assert.equal(
    evaluateMiddleware(writeUsers, {
      role: 'admin',
      permissions: { users: true },
    }).nextCalled,
    true,
  )
  assert.equal(
    evaluateMiddleware(writeUsers, {
      role: 'auditor',
      permissions: { users: 'full' },
    }).statusCode,
    403,
  )
  assert.equal(
    evaluateMiddleware(writeUsers, {
      role: 'super admin',
      permissions: { users: 'none' },
    }).nextCalled,
    true,
  )
})

test('canonical permission normalization preserves legacy true as full and rejects corrupt values', () => {
  const normalized = normalizePermissions(
    {
      assets: true,
      tickets: 'unexpected',
      users: false,
    },
    { defaults: DEFAULT_USER_PERMISSIONS },
  )

  assert.equal(normalized.assets, 'full')
  assert.equal(normalized.tickets, 'none')
  assert.equal(normalized.users, 'none')
  assert.equal(normalized.my_assets, 'read_only')
})

test('any-permission read supports shared reference endpoints without weakening write', () => {
  const readSharedAssets = authorizeAnyPermission(
    ['assets', 'submissions'],
    'read',
  )
  const writeAssets = authorizeAnyPermission(['assets'], 'write')
  const submissionsReader = {
    role: 'admin',
    permissions: { assets: 'none', submissions: 'read_only' },
  }

  assert.equal(evaluateMiddleware(readSharedAssets, submissionsReader).nextCalled, true)
  assert.equal(evaluateMiddleware(writeAssets, submissionsReader).statusCode, 403)
  assert.equal(
    evaluateMiddleware(authorizeAnyPermission([], 'read'), {
      role: 'superadmin',
      permissions: {},
    }).statusCode,
    403,
  )
  assert.equal(
    evaluateMiddleware(authorizeAnyPermission(['assets'], 'owner'), {
      role: 'superadmin',
      permissions: {},
    }).statusCode,
    403,
  )
})

test('feature routes declare read and write permission boundaries', async () => {
  const [assetRoutes, employeeRoutes, userRoutes, logRoutes] = await Promise.all([
    readFile(new URL('../src/routes/assetRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/employeeRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/userRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/logRoutes.js', import.meta.url), 'utf8'),
  ])

  assert.match(assetRoutes, /authorizePermission\('my_assets', 'read'\)/)
  assert.match(
    assetRoutes,
    /authorizeAnyPermission\(\['dashboard', 'assets'\], 'read'\)/,
  )
  assert.match(
    assetRoutes,
    /authorizeAnyPermission\(\['assets', 'submissions'\], 'read'\)/,
  )
  assert.match(assetRoutes, /authorizePermission\('assets', 'write'\)/)

  for (const feature of ['karyawan', 'assets', 'submissions', 'my_assets']) {
    assert.match(employeeRoutes, new RegExp(`['"]${feature}['"]`))
  }
  assert.match(employeeRoutes, /authorizeAnyPermission\([\s\S]*'read'/)

  assert.match(userRoutes, /authorizePermission\('users', 'read'\)/)
  assert.match(userRoutes, /authorizePermission\('users', 'write'\)/)
  assert.match(userRoutes, /userRouter\.get\('\/', requireUsersRead/)
  for (const method of ['post', 'put', 'delete']) {
    assert.match(userRoutes, new RegExp(`userRouter\\.${method}\\([^\\n]+requireUsersWrite`))
  }

  assert.match(logRoutes, /authorizePermission\('logs', 'read'\)/)
  assert.match(logRoutes, /requireLogsRead/)
})
