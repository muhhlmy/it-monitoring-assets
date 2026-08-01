import assert from 'node:assert/strict'
import test from 'node:test'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'l'.repeat(32)
process.env.DB_HOST = '127.0.0.1'
process.env.DB_PORT = '5432'
process.env.DB_USER = 'test_user'
process.env.DB_PASSWORD = 'test_password_not_used'
process.env.DB_NAME = 'test_database'
process.env.CORS_ORIGINS = 'http://localhost:5173'

const { normalizeLoginCredentials } = await import('../src/controllers/authController.js')

test('login credentials use a strict bounded payload before database lookup', () => {
  assert.deepEqual(
    normalizeLoginCredentials({
      email: '  User@Example.COM ',
      password: ' password bytes are preserved ',
      nama_pengguna: 'ignored spoofed actor',
      role: 'superadmin',
    }),
    {
      email: 'user@example.com',
      password: ' password bytes are preserved ',
    },
  )

  for (const payload of [
    null,
    [],
    {},
    { email: 'user@example.com', password: '' },
    { email: '', password: 'secret' },
    { email: 123, password: 'secret' },
    { email: 'user@example.com', password: 123 },
    { email: `${'e'.repeat(140)}@example.com`, password: 'secret' },
    { email: 'user@example.com', password: 'p'.repeat(256) },
  ]) {
    assert.equal(normalizeLoginCredentials(payload), null)
  }
})
