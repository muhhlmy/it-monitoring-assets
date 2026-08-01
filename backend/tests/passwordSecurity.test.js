import assert from 'node:assert/strict'
import test from 'node:test'

process.env.DB_PASSWORD = 'test-password-not-used'
process.env.JWT_SECRET = 'w'.repeat(32)
process.env.PASSWORD_BCRYPT_ROUNDS = '10'
process.env.PASSWORD_LEGACY_MODE = 'disabled'

const { hashPassword, isBcryptPasswordHash, verifyPassword } = await import(
  '../src/security/passwordService.js'
)
const { parseNewPassword } = await import('../src/security/requestValidation.js')

test('password baru selalu disimpan sebagai bcrypt dan dapat diverifikasi', async () => {
  const password = 'correct horse battery staple 2026'
  const hash = await hashPassword(password)

  assert.equal(isBcryptPasswordHash(hash), true)
  assert.notEqual(hash, password)
  assert.equal(await verifyPassword(password, hash), true)
  assert.equal(await verifyPassword(`${password}!`, hash), false)
})

test('plaintext legacy fail closed kecuali mode transisi diberikan eksplisit', async () => {
  const legacyPassword = 'legacy-password-value'

  assert.equal(await verifyPassword(legacyPassword, legacyPassword), false)
  assert.equal(
    await verifyPassword(legacyPassword, legacyPassword, {
      legacyMode: 'verify-plaintext',
    }),
    true,
  )
  assert.equal(
    await verifyPassword('wrong-password-value', legacyPassword, {
      legacyMode: 'verify-plaintext',
    }),
    false,
  )
})

test('password policy menolak nilai lemah, tipe non-string, control byte, dan input >72 byte', () => {
  for (const value of [
    'short',
    123456789012,
    ' '.repeat(12),
    'valid-length\npassword',
    'é'.repeat(37),
  ]) {
    assert.throws(() => parseNewPassword(value), /Password/)
  }

  assert.equal(parseNewPassword('this is a valid passphrase 2026'), 'this is a valid passphrase 2026')
})
