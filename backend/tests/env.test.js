import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const envModuleUrl = new URL('../src/config/env.js', import.meta.url).href
const testWorkingDirectory = new URL('.', import.meta.url)
const validDatabasePassword = 'test-database-password'
const validJwtSecret = 'j'.repeat(32)

function importEnvironment(overrides = {}) {
  const childEnvironment = { ...process.env }

  delete childEnvironment.DB_PASSWORD
  delete childEnvironment.JWT_SECRET

  Object.assign(childEnvironment, overrides)

  const script = `
    const { env } = await import(${JSON.stringify(envModuleUrl)});
    process.stdout.write(JSON.stringify({
      databasePassword: env.database.password,
      jwtSecret: env.jwt.secret
    }));
  `

  return spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: testWorkingDirectory,
    env: childEnvironment,
    encoding: 'utf8',
  })
}

test('gagal saat boot jika DB_PASSWORD tidak tersedia atau kosong', () => {
  for (const databasePassword of [undefined, '   ']) {
    const overrides = { JWT_SECRET: validJwtSecret }

    if (databasePassword !== undefined) {
      overrides.DB_PASSWORD = databasePassword
    }

    const result = importEnvironment(overrides)

    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /DB_PASSWORD wajib diisi melalui environment dan tidak boleh kosong/,
    )
  }
})

test('gagal saat boot jika JWT_SECRET tidak tersedia atau kurang dari 32 karakter', () => {
  for (const jwtSecret of [undefined, 'j'.repeat(31)]) {
    const overrides = { DB_PASSWORD: validDatabasePassword }

    if (jwtSecret !== undefined) {
      overrides.JWT_SECRET = jwtSecret
    }

    const result = importEnvironment(overrides)

    assert.notEqual(result.status, 0)
    assert.match(
      result.stderr,
      /JWT_SECRET wajib diisi melalui environment dengan minimal 32 karakter/,
    )
  }
})

test('meneruskan secret valid tanpa fallback atau perubahan nilai', () => {
  const result = importEnvironment({
    DB_PASSWORD: validDatabasePassword,
    JWT_SECRET: validJwtSecret,
  })

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), {
    databasePassword: validDatabasePassword,
    jwtSecret: validJwtSecret,
  })
})

test('controller dan middleware memakai satu sumber JWT dari konfigurasi', () => {
  const controllerSource = readFileSync(
    new URL('../src/controllers/authController.js', import.meta.url),
    'utf8',
  )
  const middlewareSource = readFileSync(
    new URL('../src/middleware/authMiddleware.js', import.meta.url),
    'utf8',
  )

  for (const source of [controllerSource, middlewareSource]) {
    assert.doesNotMatch(source, /process\.env\.JWT_SECRET/)
    assert.doesNotMatch(source, /const\s+JWT_SECRET/)
    assert.match(source, /import\s+\{\s*env\s*\}\s+from\s+['"]\.\.\/config\/env\.js['"]/)
    assert.match(source, /env\.jwt\.secret/)
  }
})
