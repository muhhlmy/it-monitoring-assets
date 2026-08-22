import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import jwt from 'jsonwebtoken'
import { app } from '../src/app.js'
import { pool } from '../src/config/database.js'
import { env } from '../src/config/env.js'
import { createSession, ensureUserSessionsTable } from '../src/services/sessionService.js'

function makeRequest(server, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address()
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method: 'GET',
        headers,
      },
      (res) => {
        let resData = ''
        res.on('data', (chunk) => {
          resData += chunk
        })
        res.on('end', () => {
          let json = null
          try {
            json = JSON.parse(resData)
          } catch {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: resData,
            json,
          })
        })
      },
    )

    req.on('error', reject)
    req.end()
  })
}

test('DEFECT-14 — API Naming Standardization & Backward Compatibility Suite (API-07)', async (t) => {
  let server
  let superadminToken
  let superadminId
  let createdGaId
  let createdOpsId
  let createdEmpId

  t.before(async () => {
    await ensureUserSessionsTable(pool).catch(() => {})

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })

    const ts = Date.now().toString().slice(-8)

    // Create Superadmin
    const resSA = await pool.query(
      `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
       VALUES ('Superadmin Naming Test', $1, '$2b$10$e8w8X9nZgLp5oN4n44444eR8oOSkDpOPxE/Cu0000000000000000', 'superadmin', '{}'::jsonb, true)
       RETURNING id`,
      [`naming_sa_${ts}@company.com`],
    )
    superadminId = resSA.rows[0].id

    const sessionSA = await createSession(superadminId)
    superadminToken = jwt.sign(
      {
        sub: String(superadminId),
        id: superadminId,
        sid: sessionSA.sessionId,
        email: `naming_sa_${ts}@company.com`,
        role: 'superadmin',
        permissions: {},
      },
      env.jwt.secret,
      { expiresIn: '1h' },
    )

    // Insert GA Asset
    const resGA = await pool.query(
      `INSERT INTO aset_ga (hostname, nama_asset, tipe_fasilitas, quantity, lokasi, kondisi)
       VALUES ($1, 'Meja Rest', 'Meja Kerja', 1, 'Jakarta HQ', 'Baik') RETURNING id`,
      [`GA-NAME-${ts}`],
    )
    createdGaId = resGA.rows[0].id

    // Insert OPS Asset
    const resOPS = await pool.query(
      `INSERT INTO aset_ops (hostname, nama_asset, kategori, lokasi, kondisi, status)
       VALUES ($1, 'POS Rest', 'POS', 'Jakarta HQ', 'Baik', 'Aktif') RETURNING id`,
      [`OPS-NAME-${ts}`],
    )
    createdOpsId = resOPS.rows[0].id

    // Insert Employee
    const resEMP = await pool.query(
      `INSERT INTO karyawan (nik, nama_karyawan, status, title, job_level, departemen, directorate, tanggal_mulai_bekerja, employeement_status, email_kantor, lokasi_kerja)
       VALUES ($1, 'Karyawan Naming Test', 'Active', 'Staff', 'L1', 'IT', 'Tech', CURRENT_DATE, 'Permanent', $2, 'Jakarta HQ') RETURNING id`,
      [`NK-N-${ts}`, `emp_name_${ts}@company.com`],
    )
    createdEmpId = resEMP.rows[0].id
  })

  t.after(async () => {
    if (createdGaId) {
      await pool.query('DELETE FROM aset_ga WHERE id = $1', [createdGaId]).catch(() => {})
    }
    if (createdOpsId) {
      await pool.query('DELETE FROM aset_ops WHERE id = $1', [createdOpsId]).catch(() => {})
    }
    if (createdEmpId) {
      await pool.query('DELETE FROM karyawan WHERE id = $1', [createdEmpId]).catch(() => {})
    }
    if (superadminId) {
      await pool.query('DELETE FROM users WHERE id = $1', [superadminId]).catch(() => {})
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  await t.test('TEST 1 — Canonical GET /api/ga-assets returns 200 OK', async () => {
    const res = await makeRequest(server, '/api/ga-assets', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.json))
  })

  await t.test('TEST 2 — Canonical GET /api/ops-assets returns 200 OK', async () => {
    const res = await makeRequest(server, '/api/ops-assets', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.json))
  })

  await t.test('TEST 3 — Canonical GET /api/employees returns 200 OK', async () => {
    const res = await makeRequest(server, '/api/employees', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.json))
  })

  await t.test('TEST 4 — Backward-compatible alias GET /api/assets_ga returns identical 200 OK data', async () => {
    const resCanonical = await makeRequest(server, '/api/ga-assets', {
      Authorization: `Bearer ${superadminToken}`,
    })
    const resAlias = await makeRequest(server, '/api/assets_ga', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(resAlias.status, 200)
    assert.equal(resAlias.body, resCanonical.body)
  })

  await t.test('TEST 5 — Backward-compatible alias GET /api/assets_ops returns identical 200 OK data', async () => {
    const resCanonical = await makeRequest(server, '/api/ops-assets', {
      Authorization: `Bearer ${superadminToken}`,
    })
    const resAlias = await makeRequest(server, '/api/assets_ops', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(resAlias.status, 200)
    assert.equal(resAlias.body, resCanonical.body)
  })

  await t.test('TEST 6 — Backward-compatible alias GET /api/karyawan returns identical 200 OK data', async () => {
    const resCanonical = await makeRequest(server, '/api/employees', {
      Authorization: `Bearer ${superadminToken}`,
    })
    const resAlias = await makeRequest(server, '/api/karyawan', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(resAlias.status, 200)
    assert.equal(resAlias.body, resCanonical.body)
  })

  await t.test('TEST 7 — Unauthenticated requests to both canonical and alias endpoints return 401', async () => {
    const resCanonical = await makeRequest(server, '/api/ga-assets')
    const resAlias = await makeRequest(server, '/api/assets_ga')
    assert.equal(resCanonical.status, 401)
    assert.equal(resAlias.status, 401)
    assert.equal(resCanonical.json.error.code, 'AUTHENTICATION_REQUIRED')
    assert.equal(resAlias.json.error.code, 'AUTHENTICATION_REQUIRED')
  })

  await t.test('TEST 8 — Server-side pagination parameters work identically on canonical endpoints', async () => {
    const res = await makeRequest(server, '/api/ga-assets?page=1&limit=2', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers['x-page'], '1')
    assert.equal(res.headers['x-page-size'], '2')
  })
})
