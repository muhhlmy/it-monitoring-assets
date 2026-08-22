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
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: resData,
          })
        })
      },
    )

    req.on('error', reject)
    req.end()
  })
}

test('DEFECT-12 — Server-Side Database Pagination Suite (API-05)', async (t) => {
  let server
  let superadminToken
  let superadminId
  const createdAssetIds = []
  const createdGaIds = []
  const createdOpsIds = []
  const createdUserIds = []
  const createdEmpIds = []

  t.before(async () => {
    await ensureUserSessionsTable(pool).catch(() => {})

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })

    const ts = Date.now().toString().slice(-8)

    // 1. Create Superadmin User in DB
    const resSA = await pool.query(
      `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
       VALUES ('Superadmin Pagination Test', $1, '$2b$10$e8w8X9nZgLp5oN4n44444eR8oOSkDpOPxE/Cu0000000000000000', 'superadmin', '{}'::jsonb, true)
       RETURNING id`,
      [`page_sa_${ts}@company.com`],
    )
    superadminId = resSA.rows[0].id

    const sessionSA = await createSession(superadminId)
    superadminToken = jwt.sign(
      {
        sub: String(superadminId),
        id: superadminId,
        sid: sessionSA.sessionId,
        email: `page_sa_${ts}@company.com`,
        role: 'superadmin',
        permissions: {},
      },
      env.jwt.secret,
      { expiresIn: '1h' },
    )

    // 2. Insert 12 test IT Assets
    for (let i = 1; i <= 12; i++) {
      const res = await pool.query(
        `INSERT INTO aset_ti (hostname, serial_number, tipe_perangkat, status, kondisi)
         VALUES ($1, $2, 'Laptop', 'Stock', 'Normal') RETURNING id`,
        [`PG-HST-${ts}-${i}`, `PG-SN-${ts}-${i}`],
      )
      createdAssetIds.push(res.rows[0].id)
    }

    // 3. Insert 12 test GA Assets
    for (let i = 1; i <= 12; i++) {
      const res = await pool.query(
        `INSERT INTO aset_ga (hostname, nama_asset, tipe_fasilitas, quantity, lokasi, kondisi)
         VALUES ($1, $2, 'Meja Kerja', 1, 'Jakarta HQ', 'Baik') RETURNING id`,
        [`GA-HOST-${ts}-${i}`, `GA-ASSET-${ts}-${i}`],
      )
      createdGaIds.push(res.rows[0].id)
    }

    // 4. Insert 12 test OPS Assets
    for (let i = 1; i <= 12; i++) {
      const res = await pool.query(
        `INSERT INTO aset_ops (hostname, nama_asset, kategori, lokasi, kondisi, status)
         VALUES ($1, $2, 'POS', 'Jakarta HQ', 'Baik', 'Aktif') RETURNING id`,
        [`OPS-HOST-${ts}-${i}`, `OPS-ASSET-${ts}-${i}`],
      )
      createdOpsIds.push(res.rows[0].id)
    }

    // 5. Insert 12 test Users
    for (let i = 1; i <= 12; i++) {
      const res = await pool.query(
        `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
         VALUES ($1, $2, '$2b$10$e8w8X9nZgLp5oN4n44444eR8oOSkDpOPxE/Cu0000000000000000', 'user', '{}'::jsonb, true) RETURNING id`,
        [`Page User ${ts}-${i}`, `pageuser_${ts}_${i}@company.com`],
      )
      createdUserIds.push(res.rows[0].id)
    }

    // 6. Insert 12 test Employees (NIK max 20 chars)
    for (let i = 1; i <= 12; i++) {
      const nik = `NK-${ts}-${i}`
      const res = await pool.query(
        `INSERT INTO karyawan (nik, nama_karyawan, status, title, job_level, departemen, directorate, tanggal_mulai_bekerja, employeement_status, email_kantor, lokasi_kerja)
         VALUES ($1, $2, 'Active', 'Staff', 'L1', 'IT', 'Tech', CURRENT_DATE, 'Permanent', $3, 'Jakarta HQ') RETURNING id`,
        [nik, `Page Employee ${ts}-${i}`, `emp_page_${ts}_${i}@company.com`],
      )
      createdEmpIds.push(res.rows[0].id)
    }
  })

  t.after(async () => {
    if (createdAssetIds.length > 0) {
      await pool.query('DELETE FROM aset_ti WHERE id = ANY($1)', [createdAssetIds]).catch(() => {})
    }
    if (createdGaIds.length > 0) {
      await pool.query('DELETE FROM aset_ga WHERE id = ANY($1)', [createdGaIds]).catch(() => {})
    }
    if (createdOpsIds.length > 0) {
      await pool.query('DELETE FROM aset_ops WHERE id = ANY($1)', [createdOpsIds]).catch(() => {})
    }
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [createdUserIds]).catch(() => {})
    }
    if (createdEmpIds.length > 0) {
      await pool.query('DELETE FROM karyawan WHERE id = ANY($1)', [createdEmpIds]).catch(() => {})
    }
    if (superadminId) {
      await pool.query('DELETE FROM users WHERE id = $1', [superadminId]).catch(() => {})
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  await t.test('TEST 1 — GET /api/assets?page=1&limit=5 returns page 1 with headers', async () => {
    const res = await makeRequest(server, '/api/assets?page=1&limit=5', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers['x-page'], '1')
    assert.equal(res.headers['x-page-size'], '5')
    assert.ok(Number(res.headers['x-total-count']) >= 12)
    const items = JSON.parse(res.body)
    assert.equal(items.length, 5)
  })

  await t.test('TEST 2 — GET /api/assets?page=2&limit=5 returns page 2 with ZERO overlap with page 1', async () => {
    const res1 = await makeRequest(server, '/api/assets?page=1&limit=5', {
      Authorization: `Bearer ${superadminToken}`,
    })
    const res2 = await makeRequest(server, '/api/assets?page=2&limit=5', {
      Authorization: `Bearer ${superadminToken}`,
    })

    const items1 = JSON.parse(res1.body)
    const items2 = JSON.parse(res2.body)

    const ids1 = new Set(items1.map((item) => item.id || item.id_aset))
    const ids2 = items2.map((item) => item.id || item.id_aset)

    assert.equal(items1.length, 5)
    assert.equal(items2.length, 5)

    const overlap = ids2.filter((id) => ids1.has(id))
    assert.equal(overlap.length, 0, 'Page 1 and Page 2 must contain non-overlapping records')
  })

  await t.test('TEST 3 — Invalid page parameter (?page=abc or ?page=0) returns 400 Bad Request', async () => {
    const res = await makeRequest(server, '/api/assets?page=abc', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(res.status, 400)

    const resZero = await makeRequest(server, '/api/assets?page=0', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(resZero.status, 400)
  })

  await t.test('TEST 4 — Invalid limit parameter (?limit=-10 or ?limit=9999) returns 400 Bad Request', async () => {
    const resNeg = await makeRequest(server, '/api/assets?limit=-10', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(resNeg.status, 400)

    const resExceed = await makeRequest(server, '/api/assets?limit=99999', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(resExceed.status, 400)
  })

  await t.test('TEST 5 — GET /api/ga-assets?page=1&limit=5 vs page=2 pagination', async () => {
    const res1 = await makeRequest(server, '/api/ga-assets?page=1&limit=5', {
      Authorization: `Bearer ${superadminToken}`,
    })
    const res2 = await makeRequest(server, '/api/ga-assets?page=2&limit=5', {
      Authorization: `Bearer ${superadminToken}`,
    })

    assert.equal(res1.status, 200)
    assert.equal(res2.status, 200)

    const items1 = JSON.parse(res1.body)
    const items2 = JSON.parse(res2.body)
    assert.equal(items1.length, 5)
    assert.equal(items2.length, 5)

    const ids1 = new Set(items1.map((item) => item.id))
    const ids2 = items2.map((item) => item.id)
    const overlap = ids2.filter((id) => ids1.has(id))
    assert.equal(overlap.length, 0)
  })

  await t.test('TEST 6 — GET /api/ops-assets?page=1&limit=5 vs page=2 pagination', async () => {
    const res1 = await makeRequest(server, '/api/ops-assets?page=1&limit=5', {
      Authorization: `Bearer ${superadminToken}`,
    })
    const res2 = await makeRequest(server, '/api/ops-assets?page=2&limit=5', {
      Authorization: `Bearer ${superadminToken}`,
    })

    assert.equal(res1.status, 200)
    assert.equal(res2.status, 200)

    const items1 = JSON.parse(res1.body)
    const items2 = JSON.parse(res2.body)
    assert.equal(items1.length, 5)
    assert.equal(items2.length, 5)

    const ids1 = new Set(items1.map((item) => item.id))
    const ids2 = items2.map((item) => item.id)
    const overlap = ids2.filter((id) => ids1.has(id))
    assert.equal(overlap.length, 0)
  })

  await t.test('TEST 7 — GET /api/users?page=1&limit=5 vs page=2 pagination', async () => {
    const res1 = await makeRequest(server, '/api/users?page=1&limit=5', {
      Authorization: `Bearer ${superadminToken}`,
    })
    const res2 = await makeRequest(server, '/api/users?page=2&limit=5', {
      Authorization: `Bearer ${superadminToken}`,
    })

    assert.equal(res1.status, 200)
    assert.equal(res2.status, 200)

    const json1 = JSON.parse(res1.body)
    const json2 = JSON.parse(res2.body)
    const items1 = Array.isArray(json1) ? json1 : json1.data
    const items2 = Array.isArray(json2) ? json2 : json2.data
    assert.equal(items1.length, 5)
    assert.equal(items2.length, 5)

    const ids1 = new Set(items1.map((item) => item.id))
    const ids2 = items2.map((item) => item.id)
    const overlap = ids2.filter((id) => ids1.has(id))
    assert.equal(overlap.length, 0)
  })

  await t.test('TEST 8 — GET /api/karyawan?page=1&limit=5 vs page=2 pagination', async () => {
    const res1 = await makeRequest(server, '/api/karyawan?page=1&limit=5', {
      Authorization: `Bearer ${superadminToken}`,
    })
    const res2 = await makeRequest(server, '/api/karyawan?page=2&limit=5', {
      Authorization: `Bearer ${superadminToken}`,
    })

    assert.equal(res1.status, 200)
    assert.equal(res2.status, 200)

    const items1 = JSON.parse(res1.body)
    const items2 = JSON.parse(res2.body)
    assert.equal(items1.length, 5)
    assert.equal(items2.length, 5)

    const ids1 = new Set(items1.map((item) => item.id))
    const ids2 = items2.map((item) => item.id)
    const overlap = ids2.filter((id) => ids1.has(id))
    assert.equal(overlap.length, 0)
  })

  await t.test('TEST 9 — Out-of-range page returns empty array [] with 200 OK', async () => {
    const res = await makeRequest(server, '/api/assets?page=99999&limit=10', {
      Authorization: `Bearer ${superadminToken}`,
    })
    assert.equal(res.status, 200)
    const items = JSON.parse(res.body)
    assert.equal(Array.isArray(items), true)
    assert.equal(items.length, 0)
  })
})
