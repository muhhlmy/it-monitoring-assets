import { pool } from '../config/database.js';
import bcrypt from 'bcryptjs'
import { env } from '../config/env.js'

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

export function isBcryptPasswordHash(value) {
  return typeof value === 'string' && BCRYPT_HASH_PATTERN.test(value)
}

console.log('[DEBUG] passwordService loaded, bcrypt type:', typeof bcrypt);
console.log('[DEBUG] bcrypt methods:', Object.keys(bcrypt).join(', '));

export async function hashPassword(password) {
  console.log('[DEBUG] hashPassword called');
  const rounds = env.password.bcryptRounds;
  console.log('[DEBUG] Using bcrypt rounds:', rounds);
  return bcrypt.hash(password, rounds)
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
  console.log('[DEBUG] verifyPassword called with password_length=' + (submittedPassword || '').length);
  console.log('[DEBUG] storedPassword type:', typeof storedPassword);
  console.log('[DEBUG] storedPassword starts with $2?', (storedPassword || '').startsWith('$2'));
  
  if (typeof submittedPassword !== 'string' || typeof storedPassword !== 'string') {
    console.log('[DEBUG] Failed: bad types');
    return false
  }

  if (isBcryptPasswordHash(storedPassword)) {
    try {
      console.log('[DEBUG] Calling bcrypt.compare...');
      const result = await bcrypt.compare(submittedPassword, storedPassword);
      console.log('[DEBUG] bcrypt.compare returned:', result);
      return result;
    } catch (err) {
      console.error('[DEBUG] bcrypt.compare error:', err.message);
      return false
    }
  }

  console.log('[DEBUG] Not a bcrypt hash, legacy mode:', legacyMode);
  if (legacyMode !== 'verify-plaintext') {
    console.log('[DEBUG] Returning false due to legacyMode check');
    return false
  }
  return verifyLegacyPlaintextPassword(submittedPassword, storedPassword)
}
