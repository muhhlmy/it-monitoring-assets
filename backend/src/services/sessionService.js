import crypto from 'node:crypto'
import { pool } from '../config/database.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

/**
 * Idempotently ensure user_sessions table & indexes exist.
 */
export async function ensureUserSessionsTable(queryable = pool) {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
        id                          SERIAL          PRIMARY KEY,
        session_id                  UUID            NOT NULL UNIQUE,
        user_id                     INTEGER         NOT NULL,
        issued_at                   TIMESTAMP       NOT NULL,
        expires_at                  TIMESTAMP       NOT NULL,
        revoked_at                  TIMESTAMP       NULL,
        last_seen_at                TIMESTAMP       NULL,
        created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT fk_user_sessions_user
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_sid ON user_sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked ON user_sessions(revoked_at);
  `)
}

/**
 * Create a new cryptographically secure session for a user.
 */
export async function createSession(userId, { ttlHours = 12, queryable = pool } = {}) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) {
    throw new Error('Invalid userId for session creation.')
  }

  const numericUserId = Number(userId)
  const sessionId = crypto.randomUUID()
  const nowMs = Date.now()
  const issuedAt = new Date(nowMs)
  const expiresAt = new Date(nowMs + ttlHours * 3600 * 1000)

  // Ensure table exists
  await ensureUserSessionsTable(queryable)

  const result = await queryable.query(
    `INSERT INTO user_sessions (session_id, user_id, issued_at, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING session_id, user_id, issued_at, expires_at`,
    [sessionId, numericUserId, issuedAt, expiresAt]
  )

  if (result.rowCount !== 1) {
    throw new Error('Failed to persist user session.')
  }

  return {
    sessionId,
    userId: numericUserId,
    issuedAt: result.rows[0].issued_at,
    expiresAt: result.rows[0].expires_at,
  }
}

/**
 * Verify a session by sessionId and userId against database.
 */
export async function verifySession(sessionId, userId, { queryable = pool } = {}) {
  if (!isValidUuid(sessionId) || !Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) {
    return null
  }

  const numericUserId = Number(userId)
  const result = await queryable.query(
    `SELECT session_id, user_id, issued_at, expires_at, revoked_at, last_seen_at
     FROM user_sessions
     WHERE session_id = $1
       AND user_id = $2`,
    [sessionId, numericUserId]
  )

  if (result.rowCount === 0) {
    return null
  }

  const session = result.rows[0]

  // Check if session is revoked
  if (session.revoked_at !== null && session.revoked_at !== undefined) {
    return null
  }

  // Check if session is expired
  const now = new Date()
  if (new Date(session.expires_at) <= now) {
    return null
  }

  // Asynchronously update last_seen_at
  queryable.query(
    `UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = $1`,
    [sessionId]
  ).catch((err) => {
    console.error('Failed to update session last_seen_at:', err.message)
  })

  return session
}

/**
 * Revoke a single active session by sessionId.
 */
export async function revokeSession(sessionId, { queryable = pool } = {}) {
  if (!isValidUuid(sessionId)) {
    return false
  }

  const result = await queryable.query(
    `UPDATE user_sessions
     SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE session_id = $1
       AND revoked_at IS NULL`,
    [sessionId]
  )

  return result.rowCount > 0
}

/**
 * Revoke all active sessions belonging to a user (e.g. on password change).
 */
export async function revokeAllUserSessions(userId, { queryable = pool } = {}) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) {
    return 0
  }

  const result = await queryable.query(
    `UPDATE user_sessions
     SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [Number(userId)]
  )

  return result.rowCount
}

/**
 * Cleanup expired or long-revoked sessions from database.
 */
export async function cleanupExpiredSessions({ queryable = pool } = {}) {
  try {
    const result = await queryable.query(
      `DELETE FROM user_sessions
       WHERE expires_at < CURRENT_TIMESTAMP
          OR (revoked_at IS NOT NULL AND revoked_at < CURRENT_TIMESTAMP - INTERVAL '30 days')`
    )
    return result.rowCount
  } catch (err) {
    console.error('Error cleaning up user sessions:', err.message)
    return 0
  }
}
