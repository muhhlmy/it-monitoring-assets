import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import jwt from 'jsonwebtoken'
import { isCanonicalAuthQuery } from './helpers/canonicalAuth.js'

const testJwtSecret = 'u'.repeat(32)

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = testJwtSecret
process.env.DB_HOST = '127.0.0.1'
process.env.DB_PORT = '5432'
process.env.DB_USER = 'test_user'
process.env.DB_PASSWORD = 'test_password_not_used'
process.env.DB_NAME = 'test_database'
process.env.CORS_ORIGINS = 'http://localhost:5173'
process.env.PASSWORD_BCRYPT_ROUNDS = '10'

const { app } = await import('../src/app.js')
const { pool } = await import('../src/config/database.js')
const { isBcryptPasswordHash } = await import('../src/security/passwordService.js')
const {
  USER_MANAGEMENT_ROLES,
  canCreateManagedUser,
  canDeleteManagedUser,
  canUpdateManagedUser,
  normalizeUserManagementRole
} = await import('../src/services/userAccessService.js')

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim()
}

function createToken({ id = 1, role = 'admin' } = {}) {
  return jwt.sign(
    {
      id,
      nama: `Test ${role}`,
      email: `${role.replaceAll(' ', '')}@example.test`,
      role,
      permissions: { users: 'full', export: 'none' }
    },
    testJwtSecret,
    { expiresIn: '5m' }
  )
}

async function startServer(t) {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  })

  return server.address().port
}

test('user-management policy canonicalizes roles and enforces the role hierarchy', () => {
  assert.equal(
    normalizeUserManagementRole(' super admin '),
    USER_MANAGEMENT_ROLES.SUPERADMIN
  )
  assert.equal(
    normalizeUserManagementRole('administrator'),
    USER_MANAGEMENT_ROLES.UNKNOWN
  )

  const safePermissions = { tickets: 'full', users: 'none', export: 'none' }
  const sensitivePermissions = { users: 'read_only', export: 'none' }

  assert.equal(canCreateManagedUser('admin', 'user', safePermissions), true)
  assert.equal(canCreateManagedUser('admin', 'admin', safePermissions), false)
  assert.equal(canCreateManagedUser('admin', 'superadmin', safePermissions), false)
  assert.equal(canCreateManagedUser('admin', 'user', sensitivePermissions), false)

  assert.equal(
    canUpdateManagedUser('admin', 'user', 'user', safePermissions),
    true
  )
  assert.equal(
    canUpdateManagedUser('admin', 'admin', 'admin', safePermissions),
    false
  )
  assert.equal(
    canUpdateManagedUser('admin', 'super admin', 'user', safePermissions),
    false
  )
  assert.equal(canDeleteManagedUser('admin', 'user'), false)
  assert.equal(canDeleteManagedUser('superadmin', 'user'), true)
  assert.equal(canDeleteManagedUser('superadmin', 'super admin'), false)
})

test('user-management HTTP mutations deny escalation before database mutation', async (t) => {
  const users = new Map([
    [1, {
      id: 1,
      nama: 'Admin Actor',
      email: 'admin@example.test',
      password: 'existing-password',
      role: 'admin',
      permissions: { tickets: 'full', users: 'full', export: 'none' },
      is_active: true
    }],
    [2, {
      id: 2,
      nama: 'Protected Superadmin',
      email: 'super@example.test',
      password: 'existing-password',
      role: 'super admin',
      permissions: { users: 'full', export: 'full' },
      is_active: true
    }],
    [3, {
      id: 3,
      nama: 'Managed User',
      email: 'user@example.test',
      password: 'existing-password',
      role: 'user',
      permissions: { tickets: 'read_only', users: 'none', export: 'none' },
      is_active: true
    }],
    [4, {
      id: 4,
      nama: 'Peer Admin',
      email: 'peer-admin@example.test',
      password: 'existing-password',
      role: 'admin',
      permissions: { tickets: 'full', users: 'none', export: 'none' },
      is_active: true
    }],
    [5, {
      id: 5,
      nama: 'Concurrent User',
      email: 'concurrent-user@example.test',
      password: 'existing-password',
      role: 'user',
      permissions: { tickets: 'read_only', users: 'none', export: 'none' },
      is_active: true
    }],
    [6, {
      id: 6,
      nama: 'No Users Access Admin',
      email: 'no-users-access@example.test',
      password: 'existing-password',
      role: 'admin',
      permissions: { users: 'none' },
      is_active: true
    }],
    [7, {
      id: 7,
      nama: 'Read Only Users Admin',
      email: 'read-users-access@example.test',
      password: 'existing-password',
      role: 'admin',
      permissions: { users: 'read_only' },
      is_active: true
    }],
    [9, {
      id: 9,
      nama: 'Superadmin Actor',
      email: 'superadmin-actor@example.test',
      password: 'existing-password',
      role: 'superadmin',
      permissions: { users: 'full', export: 'full' },
      is_active: true
    }]
  ])
  const queryLog = []
  let nextUserId = 10
  let failNextQueueInsert = false
  let promoteBeforeGuardedDelete = false
  const originalQuery = pool.query
  const originalConnect = pool.connect

  pool.query = async (sql, parameters = []) => {
    const normalized = normalizeSql(sql)
    queryLog.push({ sql: normalized, parameters })

    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) {
      return { rows: [], rowCount: 0 }
    }

    if (isCanonicalAuthQuery(normalized)) {
      const user = users.get(parameters[0])
      const liveUser = user && user.deleted_at == null ? user : null
      return {
        rows: liveUser
          ? [{
              ...liveUser,
              nik: '',
              jabatan: liveUser.role
            }]
          : [],
        rowCount: liveUser ? 1 : 0
      }
    }

    if (
      normalized.startsWith('SELECT id FROM users WHERE is_active = true') &&
      normalized.includes("LOWER(TRIM(role)) IN ('superadmin', 'super admin')")
    ) {
      const rows = [...users.values()]
        .filter(
          (user) =>
            user.is_active === true &&
            user.deleted_at == null &&
            ['superadmin', 'super admin'].includes(user.role.trim().toLowerCase()),
        )
        .sort((left, right) => left.id - right.id)
        .map((user) => ({ id: user.id }))
      return { rows, rowCount: rows.length }
    }

    if (
      normalized.startsWith(
        'SELECT id, nama, email, password, role, permissions, is_active FROM users'
      )
    ) {
      const user = users.get(parameters[0])
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 }
    }

    if (normalized.startsWith('SELECT role FROM users WHERE id = $1')) {
      const user = users.get(parameters[0])
      return {
        rows: user ? [{ role: user.role }] : [],
        rowCount: user ? 1 : 0
      }
    }

    if (
      normalized.startsWith(
        'SELECT u.id, u.nama, u.email, u.role, u.permissions, u.is_active,'
      ) &&
      normalized.includes('GROUP BY u.id')
    ) {
      return {
        rows: [...users.values()].filter((user) => user.deleted_at == null).map((user) => ({
          id: user.id,
          nama: user.nama,
          email: user.email,
          role: user.role,
          permissions: { ...user.permissions },
          is_active: user.is_active,
          queues: []
        })),
        rowCount: users.size
      }
    }

    if (normalized.startsWith('INSERT INTO users')) {
      const id = nextUserId
      nextUserId += 1
      const user = {
        id,
        nama: parameters[0],
        email: parameters[1],
        password: parameters[2],
        role: parameters[3],
        permissions: JSON.parse(parameters[4]),
        is_active: parameters[5]
      }
      users.set(id, user)
      return { rows: [{ ...user }], rowCount: 1 }
    }

    if (normalized.startsWith('UPDATE users SET nama')) {
      const updatesPassword = normalized.includes('password = $3')
      const id = parameters[updatesPassword ? 6 : 5]
      const current = users.get(id)
      const requiresUserRole = normalized.includes("LOWER(TRIM(role)) = 'user'")

      if (!current || (requiresUserRole && current.role.trim().toLowerCase() !== 'user')) {
        return { rows: [], rowCount: 0 }
      }

      const updated = {
        ...current,
        nama: parameters[0],
        email: parameters[1],
        password: updatesPassword ? parameters[2] : current.password,
        role: parameters[updatesPassword ? 3 : 2],
        permissions: JSON.parse(parameters[updatesPassword ? 4 : 3]),
        is_active: parameters[updatesPassword ? 5 : 4]
      }
      users.set(id, updated)
      return { rows: [{ ...updated }], rowCount: 1 }
    }

    if (normalized.startsWith('UPDATE users SET is_active = false, deleted_at')) {
      const user = users.get(parameters[0])
      if (promoteBeforeGuardedDelete && user) {
        user.role = 'superadmin'
        promoteBeforeGuardedDelete = false
      }
      const protectsSuperadmin = normalized.includes(
        "LOWER(TRIM(role)) NOT IN ('superadmin', 'super admin')"
      )
      if (
        protectsSuperadmin &&
        user &&
        ['superadmin', 'super admin'].includes(user.role.trim().toLowerCase())
      ) {
        return { rows: [], rowCount: 0 }
      }
      if (!user || user.deleted_at != null) return { rows: [], rowCount: 0 }
      user.is_active = false
      user.deleted_at = '2026-08-01T00:00:00.000Z'
      user.deleted_by_user_id = parameters[1]
      user.deletion_reason = parameters[2]
      return { rows: [{ id: parameters[0] }], rowCount: 1 }
    }

    if (normalized.startsWith('SELECT q.id, q.kode, q.nama FROM user_ticket_queues')) {
      return { rows: [], rowCount: 0 }
    }

    if (
      normalized.startsWith('DELETE FROM user_ticket_queues') ||
      normalized.startsWith('INSERT INTO user_ticket_queues')
    ) {
      if (
        failNextQueueInsert &&
        normalized.startsWith('INSERT INTO user_ticket_queues')
      ) {
        failNextQueueInsert = false
        throw new Error('Simulated queue mapping failure')
      }
      return { rows: [], rowCount: 0 }
    }

    throw new Error(`Unexpected user-management query: ${normalized}`)
  }
  pool.connect = async () => ({
    query: (...args) => pool.query(...args),
    release() {}
  })

  t.after(() => {
    pool.query = originalQuery
    pool.connect = originalConnect
  })

  const port = await startServer(t)
  const mutationCount = () =>
    queryLog.filter(({ sql }) => /^(ALTER|INSERT|UPDATE|DELETE)\b/.test(sql)).length
  const isAuthenticationQuery = isCanonicalAuthQuery
  const request = async (
    path,
    { method = 'POST', body, actor = { id: 1, role: 'admin' } } = {}
  ) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${createToken(actor)}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    return { response, body: await response.json() }
  }

  const createBody = (overrides = {}) => ({
    nama: 'New User',
    email: 'new-user@example.test',
    password: 'long-enough-password',
    role: 'user',
    permissions: { tickets: 'read_only', users: 'none', export: 'none' },
    queue_ids: [],
    ...overrides
  })

  const replaceBody = (overrides = {}) => ({
    nama: 'Managed User Updated',
    email: 'updated-user@example.test',
    role: 'user',
    permissions: { tickets: 'full', users: 'none', export: 'none' },
    queue_ids: [],
    is_active: true,
    ...overrides
  })

  await t.test('users permission separates read from write before controller work', async () => {
    let beforeQueries = queryLog.length
    let result = await request('/api/users', {
      method: 'GET',
      actor: { id: 6, role: 'admin' }
    })
    assert.equal(result.response.status, 403)
    assert.equal(
      queryLog.slice(beforeQueries).filter(({ sql }) => !isAuthenticationQuery(sql)).length,
      0
    )

    beforeQueries = queryLog.length
    result = await request('/api/users', {
      method: 'GET',
      actor: { id: 7, role: 'admin' }
    })
    assert.equal(result.response.status, 200)
    assert.equal(
      queryLog
        .slice(beforeQueries)
        .filter(({ sql }) => !isAuthenticationQuery(sql))
        .filter(({ sql }) => sql.includes('GROUP BY u.id')).length,
      1
    )

    const beforeMutations = mutationCount()
    beforeQueries = queryLog.length
    result = await request('/api/users', {
      actor: { id: 7, role: 'admin' },
      body: createBody()
    })
    assert.equal(result.response.status, 403)
    assert.equal(mutationCount(), beforeMutations)
    assert.equal(
      queryLog.slice(beforeQueries).filter(({ sql }) => !isAuthenticationQuery(sql)).length,
      0
    )

    result = await request('/api/users', {
      method: 'GET',
      actor: { id: 1, role: 'admin' }
    })
    assert.equal(result.response.status, 200)
  })

  await t.test('ordinary admin cannot create admin or superadmin roles', async () => {
    for (const role of ['admin', 'superadmin', 'super admin']) {
      const before = mutationCount()
      const result = await request('/api/users', { body: createBody({ role }) })
      assert.equal(result.response.status, 403)
      assert.equal(mutationCount(), before)
    }
  })

  await t.test('ordinary admin cannot grant users, export, or invented super permissions', async () => {
    for (const permissions of [
      { users: 'full' },
      { export: true },
      { superadmin: 'full' }
    ]) {
      let before = mutationCount()
      const createResult = await request('/api/users', {
        body: createBody({ permissions })
      })
      assert.ok([400, 403].includes(createResult.response.status))
      assert.equal(mutationCount(), before)

      before = mutationCount()
      const updateResult = await request('/api/users/3', {
        method: 'PUT',
        body: replaceBody({ permissions })
      })
      assert.ok([400, 403].includes(updateResult.response.status))
      assert.equal(mutationCount(), before)
    }
  })

  await t.test('ordinary admin cannot modify superadmin, peer admin, or itself', async () => {
    for (const id of [2, 4, 1]) {
      const before = mutationCount()
      const result = await request(`/api/users/${id}`, {
        method: 'PUT',
        body: {
          nama: 'Forged Change',
          email: 'forged@example.test',
          permissions: { tickets: 'full', users: 'none', export: 'none' }
        }
      })
      assert.equal(result.response.status, 403)
      assert.equal(mutationCount(), before)
    }
  })

  await t.test('ordinary admin cannot promote a user or demote a superadmin', async () => {
    let before = mutationCount()
    const promote = await request('/api/users/3', {
      method: 'PUT',
      body: replaceBody({ role: 'admin' })
    })
    assert.equal(promote.response.status, 403)
    assert.equal(mutationCount(), before)

    before = mutationCount()
    const demote = await request('/api/users/2', {
      method: 'PUT',
      body: replaceBody({ role: 'user' })
    })
    assert.equal(demote.response.status, 403)
    assert.equal(mutationCount(), before)
  })

  await t.test('ordinary admin cannot delete users and denial happens before lookup', async () => {
    const beforeQueries = queryLog.length
    const beforeMutations = mutationCount()
    const result = await request('/api/users/3', { method: 'DELETE' })

    assert.equal(result.response.status, 403)
    const requestQueries = queryLog.slice(beforeQueries)
    assert.equal(requestQueries.length, 1)
    assert.equal(isAuthenticationQuery(requestQueries[0].sql), true)
    assert.equal(mutationCount(), beforeMutations)
  })

  await t.test('superadmin target is locked and rejected without a delete mutation', async () => {
    const transactionStart = queryLog.length
    const result = await request('/api/users/2', {
      method: 'DELETE',
      actor: { id: 9, role: 'superadmin' }
    })

    assert.equal(result.response.status, 403)
    const transactionQueries = queryLog
      .slice(transactionStart)
      .filter(({ sql }) => !isAuthenticationQuery(sql))
      .map(({ sql }) => sql)
    assert.equal(transactionQueries[0], 'BEGIN')
    assert.match(transactionQueries[1], /SELECT role .* FOR UPDATE/)
    assert.equal(
      transactionQueries.some((sql) => sql.startsWith('UPDATE users SET is_active = false')),
      false
    )
    assert.equal(transactionQueries.at(-1), 'ROLLBACK')
  })

  await t.test('guarded delete rolls back if target role becomes superadmin', async () => {
    const transactionStart = queryLog.length
    promoteBeforeGuardedDelete = true
    const result = await request('/api/users/5', {
      method: 'DELETE',
      actor: { id: 9, role: 'superadmin' }
    })

    assert.equal(result.response.status, 409)
    const transactionQueries = queryLog
      .slice(transactionStart)
      .filter(({ sql }) => !isAuthenticationQuery(sql))
      .map(({ sql }) => sql)
    const guardedDelete = transactionQueries.find((sql) =>
      sql.startsWith('UPDATE users SET is_active = false')
    )
    assert.match(
      guardedDelete,
      /deleted_at IS NULL AND LOWER\(TRIM\(role\)\) NOT IN \('superadmin', 'super admin'\)/
    )
    assert.equal(transactionQueries.at(-1), 'ROLLBACK')
    assert.equal(transactionQueries.includes('COMMIT'), false)
    assert.equal(users.get(5).role, 'superadmin')
  })

  await t.test('ordinary admin can create a safe ordinary user', async () => {
    const transactionStart = queryLog.length
    const result = await request('/api/users', { body: createBody() })

    assert.equal(result.response.status, 201)
    assert.equal(result.body.role, 'user')
    assert.equal(result.body.permissions.users, 'none')
    assert.equal(result.body.permissions.export, 'none')

    const insert = queryLog.find(({ sql }) => sql.startsWith('INSERT INTO users'))
    assert.ok(insert)
    assert.equal(insert.parameters[3], 'user')
    assert.equal(isBcryptPasswordHash(insert.parameters[2]), true)
    assert.notEqual(insert.parameters[2], createBody().password)
    assert.deepEqual(JSON.parse(insert.parameters[4]), {
      dashboard: 'none',
      assets: 'none',
      my_assets: 'none',
      tickets: 'read_only',
      submissions: 'none',
      users: 'none',
      logs: 'none',
      karyawan: 'none',
      export: 'none'
    })
    assert.equal(
      queryLog.some(({ sql }) => sql.startsWith('DELETE FROM user_ticket_queues')),
      false
    )
    assert.deepEqual(
      queryLog
        .slice(transactionStart)
        .filter(({ sql }) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql))
        .map(({ sql }) => sql),
      ['BEGIN', 'COMMIT']
    )
    assert.equal(
      queryLog.some(({ sql }) => sql.startsWith('ALTER TABLE')),
      false
    )
  })

  await t.test('ordinary admin can update a user under an atomic role guard', async () => {
    const transactionStart = queryLog.length
    const result = await request('/api/users/3', {
      method: 'PUT',
      body: replaceBody()
    })

    assert.equal(result.response.status, 200)
    assert.equal(result.body.role, 'user')
    assert.equal(result.body.permissions.users, 'none')
    assert.equal(result.body.permissions.export, 'none')

    const update = queryLog.find(({ sql }) =>
      sql.startsWith('UPDATE users SET nama')
    )
    assert.ok(update)
    assert.match(update.sql, /WHERE id = \$6.*AND LOWER\(TRIM\(role\)\) = 'user'/)
    assert.deepEqual(
      queryLog
        .slice(transactionStart)
        .filter(({ sql }) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql))
        .map(({ sql }) => sql),
      ['BEGIN', 'COMMIT']
    )
  })

  await t.test('update preserves inactive state when is_active is omitted', async () => {
    users.get(3).is_active = false
    const body = replaceBody()
    delete body.is_active

    const result = await request('/api/users/3', {
      method: 'PUT',
      body,
    })

    assert.equal(result.response.status, 200)
    assert.equal(result.body.is_active, false)
    assert.equal(users.get(3).is_active, false)
  })

  await t.test('strict user payload rejects coercion, weak password, and unknown fields', async () => {
    for (const body of [
      createBody({ email: { value: 'coerced@example.test' } }),
      createBody({ password: 'too-short' }),
      createBody({ queue_ids: ['7'] }),
      createBody({ is_active: 'false' }),
      createBody({ unexpected: true }),
    ]) {
      const before = mutationCount()
      const result = await request('/api/users', { body })
      assert.equal(result.response.status, 400)
      assert.equal(mutationCount(), before)
    }
  })

  await t.test('last active superadmin cannot be demoted or deactivated', async () => {
    // The rollback mock above intentionally mutates user 5 to emulate a race;
    // restore its committed state before evaluating the active-super invariant.
    users.get(5).role = 'user'
    const demoteOther = await request('/api/users/2', {
      method: 'PUT',
      actor: { id: 9, role: 'superadmin' },
      body: replaceBody({
        role: 'admin',
        permissions: { users: 'full', export: 'none' },
      }),
    })
    assert.equal(demoteOther.response.status, 200)
    assert.equal(users.get(2).role, 'admin')

    const deactivateLast = await request('/api/users/9', {
      method: 'PUT',
      actor: { id: 9, role: 'superadmin' },
      body: replaceBody({
        role: 'superadmin',
        is_active: false,
        permissions: { users: 'full', export: 'full' },
      }),
    })
    assert.equal(deactivateLast.response.status, 409)
    assert.match(deactivateLast.body.message, /Superadmin aktif terakhir/)
    assert.equal(users.get(9).is_active, true)
    assert.equal(users.get(9).role, 'superadmin')
  })

  await t.test('queue mapping failure rolls the complete user mutation back', async () => {
    const transactionStart = queryLog.length
    failNextQueueInsert = true
    const originalConsoleError = console.error
    console.error = () => {}

    let result
    try {
      result = await request('/api/users', {
        actor: { id: 9, role: 'superadmin' },
        body: createBody({
          email: 'transaction-rollback@example.test',
          queue_ids: [7]
        })
      })
    } finally {
      console.error = originalConsoleError
    }

    assert.equal(result.response.status, 500)
    const transactionQueries = queryLog
      .slice(transactionStart)
      .filter(({ sql }) => !isAuthenticationQuery(sql))
      .map(({ sql }) => sql)
    assert.equal(transactionQueries[0], 'BEGIN')
    assert.ok(transactionQueries.some((sql) => sql.startsWith('INSERT INTO users')))
    assert.ok(
      transactionQueries.some((sql) =>
        sql.startsWith('DELETE FROM user_ticket_queues')
      )
    )
    assert.ok(
      transactionQueries.some((sql) =>
        sql.startsWith('INSERT INTO user_ticket_queues')
      )
    )
    assert.equal(transactionQueries.at(-1), 'ROLLBACK')
    assert.equal(transactionQueries.includes('COMMIT'), false)
  })
})
