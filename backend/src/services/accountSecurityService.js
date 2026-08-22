import { pool } from '../config/database.js'

// Pre-computed valid bcrypt hash for dummy password comparison when account does not exist.
// Equalizes execution time of bcrypt to prevent timing-based account enumeration.
export const DUMMY_BCRYPT_HASH = '$2b$10$e8w8X9nZgLp5oN4n44444eR8oOSkDpOPxE/Cu0000000000000000'

export async function ensureAccountSecurityTable(databaseClient) {
  const client = databaseClient || pool
  await client.query(`
    CREATE TABLE IF NOT EXISTS account_security_state (
      account_key VARCHAR(255) PRIMARY KEY,
      failed_attempt_count INT NOT NULL DEFAULT 0,
      first_failed_at TIMESTAMPTZ,
      last_failed_at TIMESTAMPTZ,
      locked_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_account_security_locked_until ON account_security_state (locked_until);
  `)
}

export function normalizeAccountKey(email) {
  if (typeof email !== 'string' || !email.trim()) return null
  return email.trim().toLowerCase().slice(0, 150)
}

export function calculateLockoutSeconds(failedAttemptCount) {
  if (failedAttemptCount < 5) return 0
  switch (failedAttemptCount) {
    case 5:
      return 30
    case 6:
      return 60
    case 7:
      return 120
    case 8:
    default:
      return 300 // Max 5 minutes cap
  }
}

/**
 * Checks if the account associated with the given email is currently locked due to brute-force attempts.
 */
export async function checkAccountLockout(email) {
  const accountKey = normalizeAccountKey(email)
  if (!accountKey) return { isLocked: false, retryAfterSeconds: 0, failedAttemptCount: 0 }

  await ensureAccountSecurityTable().catch(() => {})

  const res = await pool.query(
    `SELECT account_key, failed_attempt_count, locked_until 
     FROM account_security_state 
     WHERE account_key = $1`,
    [accountKey],
  )

  if (res.rowCount === 0) {
    return { isLocked: false, retryAfterSeconds: 0, failedAttemptCount: 0 }
  }

  const row = res.rows[0]
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1000),
    )
    return {
      isLocked: true,
      retryAfterSeconds,
      failedAttemptCount: row.failed_attempt_count,
    }
  }

  return {
    isLocked: false,
    retryAfterSeconds: 0,
    failedAttemptCount: row.failed_attempt_count || 0,
  }
}

/**
 * Records a failed login attempt atomically in PostgreSQL and updates lockout duration if threshold is reached.
 */
export async function recordFailedLogin(email) {
  const accountKey = normalizeAccountKey(email)
  if (!accountKey) return { failedAttemptCount: 0, lockedUntil: null, retryAfterSeconds: 0 }

  await ensureAccountSecurityTable().catch(() => {})

  const res = await pool.query(
    `
    INSERT INTO account_security_state (account_key, failed_attempt_count, first_failed_at, last_failed_at, locked_until, updated_at)
    VALUES ($1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT (account_key) DO UPDATE SET
      failed_attempt_count = CASE
        WHEN account_security_state.locked_until IS NOT NULL AND account_security_state.locked_until <= CURRENT_TIMESTAMP
          THEN 1
        ELSE account_security_state.failed_attempt_count + 1
      END,
      first_failed_at = CASE
        WHEN account_security_state.failed_attempt_count = 0 OR (account_security_state.locked_until IS NOT NULL AND account_security_state.locked_until <= CURRENT_TIMESTAMP)
          THEN CURRENT_TIMESTAMP
        ELSE account_security_state.first_failed_at
      END,
      last_failed_at = CURRENT_TIMESTAMP,
      locked_until = CASE
        WHEN (
          CASE
            WHEN account_security_state.locked_until IS NOT NULL AND account_security_state.locked_until <= CURRENT_TIMESTAMP THEN 1
            ELSE account_security_state.failed_attempt_count + 1
          END
        ) >= 5 THEN CURRENT_TIMESTAMP + (
          CASE
            WHEN (CASE WHEN account_security_state.locked_until IS NOT NULL AND account_security_state.locked_until <= CURRENT_TIMESTAMP THEN 1 ELSE account_security_state.failed_attempt_count + 1 END) = 5 THEN INTERVAL '30 seconds'
            WHEN (CASE WHEN account_security_state.locked_until IS NOT NULL AND account_security_state.locked_until <= CURRENT_TIMESTAMP THEN 1 ELSE account_security_state.failed_attempt_count + 1 END) = 6 THEN INTERVAL '60 seconds'
            WHEN (CASE WHEN account_security_state.locked_until IS NOT NULL AND account_security_state.locked_until <= CURRENT_TIMESTAMP THEN 1 ELSE account_security_state.failed_attempt_count + 1 END) = 7 THEN INTERVAL '120 seconds'
            ELSE INTERVAL '300 seconds'
          END
        )
        ELSE NULL
      END,
      updated_at = CURRENT_TIMESTAMP
    RETURNING failed_attempt_count, locked_until;
    `,
    [accountKey],
  )

  const row = res.rows[0]
  const failedAttemptCount = row ? row.failed_attempt_count : 1
  const lockedUntil = row && row.locked_until ? new Date(row.locked_until) : null
  const retryAfterSeconds =
    lockedUntil && lockedUntil.getTime() > Date.now()
      ? Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000))
      : 0

  return {
    failedAttemptCount,
    lockedUntil,
    retryAfterSeconds,
  }
}

/**
 * Resets failed attempt counter and clears lock state upon a successful login.
 */
export async function resetFailedLogin(email) {
  const accountKey = normalizeAccountKey(email)
  if (!accountKey) return

  await ensureAccountSecurityTable().catch(() => {})

  await pool.query(
    `UPDATE account_security_state
     SET failed_attempt_count = 0, first_failed_at = NULL, last_failed_at = NULL, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE account_key = $1`,
    [accountKey],
  )
}
