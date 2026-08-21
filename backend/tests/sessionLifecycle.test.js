import test from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { pool } from '../src/config/database.js'
import { env } from '../src/config/env.js'
import {
  createSession,
  verifySession,
  revokeSession,
  revokeAllUserSessions,
  isValidUuid,
  ensureUserSessionsTable,
} from '../src/services/sessionService.js'

test('Session Lifecycle & Token Rotation Security Suite (DEFECT-01)', async (t) => {
  await ensureUserSessionsTable(pool)

  let testUserId = null
  const testUserEmail = `session.test.${Date.now()}@company.com`
  const testUserPasswordHash = '$2b$10$KUuuaQWHvErN2WNcqrJOXeRC1Ym6GRyxcIzwpmRboOSkDpOPxE/Cu' // 'Admin123!'

  await t.test('Setup Test User', async () => {
    const result = await pool.query(
      `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
       VALUES ('Session Test User', $1, $2, 'admin', '{"assets":"full"}'::jsonb, true)
       RETURNING id`,
      [testUserEmail, testUserPasswordHash],
    )
    testUserId = result.rows[0].id
    assert.ok(testUserId > 0)
  })

  await t.test('TEST 1 — Token Rotation (T1 !== T2 & sid1 !== sid2)', async () => {
    const session1 = await createSession(testUserId)
    const session2 = await createSession(testUserId)

    assert.notEqual(session1.sessionId, session2.sessionId)

    const token1 = jwt.sign(
      { sub: String(testUserId), id: testUserId, sid: session1.sessionId, role: 'admin' },
      env.jwt.secret,
      { expiresIn: '12h' },
    )
    const token2 = jwt.sign(
      { sub: String(testUserId), id: testUserId, sid: session2.sessionId, role: 'admin' },
      env.jwt.secret,
      { expiresIn: '12h' },
    )

    assert.notEqual(token1, token2)

    const payload1 = jwt.decode(token1)
    const payload2 = jwt.decode(token2)

    assert.ok(isValidUuid(payload1.sid))
    assert.ok(isValidUuid(payload2.sid))
    assert.notEqual(payload1.sid, payload2.sid)
    assert.ok(payload1.iat > 0)
    assert.ok(payload2.iat > 0)
  })

  await t.test('TEST 2 — Session Stored in Database', async () => {
    const session = await createSession(testUserId, { ttlHours: 6 })
    assert.ok(isValidUuid(session.sessionId))

    const dbRes = await pool.query(
      'SELECT session_id, user_id, issued_at, expires_at, revoked_at FROM user_sessions WHERE session_id = $1',
      [session.sessionId],
    )

    assert.equal(dbRes.rowCount, 1)
    const row = dbRes.rows[0]
    assert.equal(row.session_id, session.sessionId)
    assert.equal(row.user_id, testUserId)
    assert.equal(row.revoked_at, null)
    assert.ok(new Date(row.expires_at) > new Date())
  })

  await t.test('TEST 3 — Multiple Active Simultaneous Sessions Supported', async () => {
    const sessionA = await createSession(testUserId)
    const sessionB = await createSession(testUserId)

    const verifiedA = await verifySession(sessionA.sessionId, testUserId)
    const verifiedB = await verifySession(sessionB.sessionId, testUserId)

    assert.ok(verifiedA !== null)
    assert.ok(verifiedB !== null)
    assert.equal(verifiedA.session_id, sessionA.sessionId)
    assert.equal(verifiedB.session_id, sessionB.sessionId)
  })

  await t.test('TEST 4 — Logout Invalidates Exact Session (T1 Revoked, T2 Remains Active)', async () => {
    const sessionT1 = await createSession(testUserId)
    const sessionT2 = await createSession(testUserId)

    // Revoke exact session T1
    const revoked = await revokeSession(sessionT1.sessionId)
    assert.equal(revoked, true)

    // Verification for T1 should fail
    const verifiedT1 = await verifySession(sessionT1.sessionId, testUserId)
    assert.equal(verifiedT1, null)

    // Verification for T2 should still pass
    const verifiedT2 = await verifySession(sessionT2.sessionId, testUserId)
    assert.ok(verifiedT2 !== null)
    assert.equal(verifiedT2.session_id, sessionT2.sessionId)
  })

  await t.test('TEST 5 — Invalid SID Rejection', async () => {
    const fakeSid = crypto.randomUUID()
    const verified = await verifySession(fakeSid, testUserId)
    assert.equal(verified, null)
  })

  await t.test('TEST 6 — SID / User ID Mismatch Rejection', async () => {
    const session = await createSession(testUserId)
    const otherUserId = testUserId + 99999

    const verified = await verifySession(session.sessionId, otherUserId)
    assert.equal(verified, null)
  })

  await t.test('TEST 7 — Expired Session Rejection', async () => {
    const expiredSid = crypto.randomUUID()
    const pastDate = new Date(Date.now() - 3600 * 1000)

    await pool.query(
      `INSERT INTO user_sessions (session_id, user_id, issued_at, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [expiredSid, testUserId, pastDate, pastDate],
    )

    const verified = await verifySession(expiredSid, testUserId)
    assert.equal(verified, null)
  })

  await t.test('TEST 8 — Non-UUID SID Format Validation', async () => {
    const invalidSid = 'not-a-valid-uuid'
    assert.equal(isValidUuid(invalidSid), false)
    const verified = await verifySession(invalidSid, testUserId)
    assert.equal(verified, null)
  })

  await t.test('TEST 9 — Repeated Logins (5x) Produce 5 Unique Tokens and SIDs', async () => {
    const tokens = []
    const sids = []

    for (let i = 0; i < 5; i++) {
      const session = await createSession(testUserId)
      const token = jwt.sign(
        { sub: String(testUserId), id: testUserId, sid: session.sessionId },
        env.jwt.secret,
      )
      tokens.push(token)
      sids.push(session.sessionId)
    }

    const uniqueTokens = new Set(tokens)
    const uniqueSids = new Set(sids)

    assert.equal(uniqueTokens.size, 5)
    assert.equal(uniqueSids.size, 5)
  })

  await t.test('TEST 10 — Logout Idempotency (Revoking twice does not error)', async () => {
    const session = await createSession(testUserId)

    const firstRevoke = await revokeSession(session.sessionId)
    assert.equal(firstRevoke, true)

    const secondRevoke = await revokeSession(session.sessionId)
    assert.equal(secondRevoke, false) // Returns false because already revoked
  })

  await t.test('TEST 11 — Revoke All Sessions on Password Change', async () => {
    const session1 = await createSession(testUserId)
    const session2 = await createSession(testUserId)

    const revokedCount = await revokeAllUserSessions(testUserId)
    assert.ok(revokedCount >= 2)

    const verified1 = await verifySession(session1.sessionId, testUserId)
    const verified2 = await verifySession(session2.sessionId, testUserId)

    assert.equal(verified1, null)
    assert.equal(verified2, null)
  })

  await t.test('Teardown Test User & Sessions', async () => {
    if (testUserId) {
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [testUserId])
      await pool.query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [testUserId])
    }
  })
})
