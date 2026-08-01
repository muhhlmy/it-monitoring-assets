import { timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { env } from '../config/env.js'

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

export function isBcryptPasswordHash(value) {
  return typeof value === 'string' && BCRYPT_HASH_PATTERN.test(value)
}

export async function hashPassword(password) {
  return bcrypt.hash(password, env.password.bcryptRounds)
}

function verifyLegacyPlaintextPassword(submittedPassword, storedPassword) {
  const submitted = Buffer.from(submittedPassword, 'utf8')
  const stored = Buffer.from(storedPassword, 'utf8')
  if (submitted.length !== stored.length) return false
  return timingSafeEqual(submitted, stored)
}

export async function verifyPassword(
  submittedPassword,
  storedPassword,
  { legacyMode = env.password.legacyMode } = {},
) {
  if (typeof submittedPassword !== 'string' || typeof storedPassword !== 'string') return false

  if (isBcryptPasswordHash(storedPassword)) {
    try {
      return await bcrypt.compare(submittedPassword, storedPassword)
    } catch {
      return false
    }
  }

  if (legacyMode !== 'verify-plaintext') return false
  return verifyLegacyPlaintextPassword(submittedPassword, storedPassword)
}
