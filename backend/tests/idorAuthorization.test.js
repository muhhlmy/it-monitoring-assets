import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import jwt from 'jsonwebtoken'
import { app } from '../src/app.js'
import { pool } from '../src/config/database.js'
import { env } from '../src/config/env.js'
import { createSession, ensureUserSessionsTable } from '../src/services/sessionService.js'

function makeRequest(server, path, headers = {}, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const address = server.address()
    if (!address || typeof address !== 'object') {
      return reject(new Error('Server address is not available.'))
    }

    const payloadStr = bodyObj ? JSON.stringify(bodyObj) : headers.body || ''
    const reqHeaders = {
      Host: `127.0.0.1:${address.port}`,
      ...headers,
    }

    if (bodyObj && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json'
    }

    if (payloadStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payloadStr)
    }

    const options = {
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method: headers.method || (bodyObj ? 'POST' : 'GET'),
      headers: reqHeaders,
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })

    req.on('error', reject)
    if (payloadStr) {
      req.write(payloadStr)
    }
    req.end()
  })
}

test('IDOR & Resource-Level Authorization Security Suite (DEFECT-05 / SEC-09)', async (t) => {
  let server

  // User A (Regular User)
  let userAId, userANik, tokenA
  // User B (Regular User)
  let userBId, userBNik, tokenB
  // Admin User (No GA/OPS permissions)
  let adminId, tokenAdmin
  // Superadmin
  let superadminId, tokenSuperadmin

  // Assets
  let assetAId, assetBId, gaAssetId, opsAssetId

  t.before(async () => {
    await ensureUserSessionsTable(pool)

    const ts = Date.now()

    // 1. Create User A
    userANik = `NIK-A-${ts}`
    const resA = await pool.query(
      `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
       VALUES ('User Alpha', $1, '$2b$10$KUuuaQWHvErN2WNcqrJOXeRC1Ym6GRyxcIzwpmRboOSkDpOPxE/Cu', 'user', '{}'::jsonb, true)
       RETURNING id`,
      [`usera.${ts}@company.com`],
    )
    userAId = resA.rows[0].id

    // Insert employee record for User A
    await pool.query(
      `INSERT INTO karyawan (nik, nama_karyawan, status, title, job_level, departemen, directorate, tanggal_mulai_bekerja, employeement_status, email_kantor, lokasi_kerja)
       VALUES ($1, 'User Alpha', 'Active', 'Staff', 'Junior', 'IT', 'Tech', CURRENT_DATE, 'Permanent', $2, 'Jakarta HQ')`,
      [userANik, `usera.${ts}@company.com`],
    )

    const sessionA = await createSession(userAId)
    tokenA = jwt.sign(
      { sub: String(userAId), id: userAId, sid: sessionA.sessionId, nik: userANik, role: 'user', permissions: {} },
      env.jwt.secret,
      { expiresIn: '8h' },
    )

    // 2. Create User B
    userBNik = `NIK-B-${ts}`
    const resB = await pool.query(
      `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
       VALUES ('User Beta', $1, '$2b$10$KUuuaQWHvErN2WNcqrJOXeRC1Ym6GRyxcIzwpmRboOSkDpOPxE/Cu', 'user', '{}'::jsonb, true)
       RETURNING id`,
      [`userb.${ts}@company.com`],
    )
    userBId = resB.rows[0].id

    await pool.query(
      `INSERT INTO karyawan (nik, nama_karyawan, status, title, job_level, departemen, directorate, tanggal_mulai_bekerja, employeement_status, email_kantor, lokasi_kerja)
       VALUES ($1, 'User Beta', 'Active', 'Staff', 'Junior', 'HR', 'People', CURRENT_DATE, 'Permanent', $2, 'Jakarta HQ')`,
      [userBNik, `userb.${ts}@company.com`],
    )

    const sessionB = await createSession(userBId)
    tokenB = jwt.sign(
      { sub: String(userBId), id: userBId, sid: sessionB.sessionId, nik: userBNik, role: 'user', permissions: {} },
      env.jwt.secret,
      { expiresIn: '8h' },
    )

    // 3. Create Admin User (without GA/OPS permissions)
    const resAdmin = await pool.query(
      `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
       VALUES ('Admin Limited', $1, '$2b$10$KUuuaQWHvErN2WNcqrJOXeRC1Ym6GRyxcIzwpmRboOSkDpOPxE/Cu', 'admin', '{"assets":"read_only"}'::jsonb, true)
       RETURNING id`,
      [`admin.${ts}@company.com`],
    )
    adminId = resAdmin.rows[0].id
    const sessionAdmin = await createSession(adminId)
    tokenAdmin = jwt.sign(
      { sub: String(adminId), id: adminId, sid: sessionAdmin.sessionId, role: 'admin', permissions: { assets: 'read_only' } },
      env.jwt.secret,
      { expiresIn: '8h' },
    )

    // 4. Create Superadmin
    const resSuper = await pool.query(
      `INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
       VALUES ('Super Admin', $1, '$2b$10$KUuuaQWHvErN2WNcqrJOXeRC1Ym6GRyxcIzwpmRboOSkDpOPxE/Cu', 'superadmin', '{"assets":"full","assets_ga":"full","assets_ops":"full"}'::jsonb, true)
       RETURNING id`,
      [`super.${ts}@company.com`],
    )
    superadminId = resSuper.rows[0].id
    const sessionSuper = await createSession(superadminId)
    tokenSuperadmin = jwt.sign(
      { sub: String(superadminId), id: superadminId, sid: sessionSuper.sessionId, role: 'superadmin' },
      env.jwt.secret,
      { expiresIn: '8h' },
    )

    // 5. Insert Asset A (owned by User A)
    const assetARes = await pool.query(
      `INSERT INTO aset_ti (hostname, serial_number, nik_pemegang_asset, nama_karyawan_pemegang_asset, status, kondisi)
       VALUES ($1, $2, $3, 'User Alpha', 'In Use', 'Normal') RETURNING id`,
      [`HOST-A-${ts}`, `SN-A-${ts}`, userANik],
    )
    assetAId = assetARes.rows[0].id

    // 6. Insert Asset B (owned by User B)
    const assetBRes = await pool.query(
      `INSERT INTO aset_ti (hostname, serial_number, nik_pemegang_asset, nama_karyawan_pemegang_asset, status, kondisi)
       VALUES ($1, $2, $3, 'User Beta', 'In Use', 'Normal') RETURNING id`,
      [`HOST-B-${ts}`, `SN-B-${ts}`, userBNik],
    )
    assetBId = assetBRes.rows[0].id

    // 7. Insert GA Asset
    const gaRes = await pool.query(
      `INSERT INTO aset_ga (hostname, quantity, tipe_fasilitas, nama_asset, lokasi, kondisi)
       VALUES ($1, 5, 'Meja', 'Meja Kerja GA', 'Jakarta HQ', 'Baik') RETURNING id`,
      [`GA-HOST-${ts}`],
    )
    gaAssetId = gaRes.rows[0].id

    // 8. Insert OPS Asset
    const opsRes = await pool.query(
      `INSERT INTO aset_ops (hostname, nama_asset, kategori, lokasi, kondisi, status)
       VALUES ($1, 'Mesin Kopi OPS', 'Peralatan', 'Jakarta HQ', 'Baik', 'Aktif') RETURNING id`,
      [`OPS-HOST-${ts}`],
    )
    opsAssetId = opsRes.rows[0].id

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })
  })

  t.after(async () => {
    const ids = [userAId, userBId, adminId, superadminId].filter(Boolean)
    if (ids.length > 0) {
      await pool.query('DELETE FROM user_sessions WHERE user_id = ANY($1::int[])', [ids]).catch(() => {})
      await pool.query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ANY($1::int[])', [ids]).catch(() => {})
    }
    if (assetAId) await pool.query('DELETE FROM aset_ti WHERE id = $1', [assetAId]).catch(() => {})
    if (assetBId) await pool.query('DELETE FROM aset_ti WHERE id = $1', [assetBId]).catch(() => {})
    if (gaAssetId) await pool.query('DELETE FROM aset_ga WHERE id = $1', [gaAssetId]).catch(() => {})
    if (opsAssetId) await pool.query('DELETE FROM aset_ops WHERE id = $1', [opsAssetId]).catch(() => {})
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  await t.test('TEST 1 — User A can read own Asset A', async () => {
    const res = await makeRequest(server, `/api/assets/${assetAId}`, {
      Authorization: `Bearer ${tokenA}`,
    })
    assert.equal(res.status, 200)
    const json = JSON.parse(res.body)
    assert.equal(json.id, assetAId)
  })

  await t.test('TEST 2 — IDOR Defense: User A CANNOT read User B Asset B (returns 403)', async () => {
    const res = await makeRequest(server, `/api/assets/${assetBId}`, {
      Authorization: `Bearer ${tokenA}`,
    })
    assert.equal(res.status, 403)
    const json = JSON.parse(res.body)
    assert.ok(json.error || json.message)
  })

  await t.test('TEST 3 — IDOR Defense: User A CANNOT update User B Asset B (returns 403)', async () => {
    const res = await makeRequest(
      server,
      `/api/assets/${assetBId}`,
      {
        method: 'PUT',
        Authorization: `Bearer ${tokenA}`,
      },
      {
        hostname: 'HACKED-HOST',
        serial_number: `SN-B-${Date.now()}`,
      },
    )
    assert.equal(res.status, 403)
  })

  await t.test('TEST 4 — IDOR Defense: User A CANNOT delete User B Asset B (returns 403)', async () => {
    const res = await makeRequest(server, `/api/assets/${assetBId}`, {
      method: 'DELETE',
      Authorization: `Bearer ${tokenA}`,
    })
    assert.equal(res.status, 403)
  })

  await t.test('TEST 5 — Device cycle IDOR: User A cannot view User B NIK cycle (returns 403)', async () => {
    const res = await makeRequest(server, `/api/assets/cycle/${userBNik}`, {
      Authorization: `Bearer ${tokenA}`,
    })
    assert.equal(res.status, 403)
  })

  await t.test('TEST 6 — Superadmin can read any asset', async () => {
    const res = await makeRequest(server, `/api/assets/${assetBId}`, {
      Authorization: `Bearer ${tokenSuperadmin}`,
    })
    assert.equal(res.status, 200)
  })

  await t.test('TEST 7 — Admin with assets:read can read any asset', async () => {
    const res = await makeRequest(server, `/api/assets/${assetBId}`, {
      Authorization: `Bearer ${tokenAdmin}`,
    })
    assert.equal(res.status, 200)
  })

  await t.test('TEST 8 — GA Asset IDOR Defense: Admin without assets_ga permission is rejected with 403', async () => {
    const res = await makeRequest(server, `/api/ga-assets/${gaAssetId}`, {
      Authorization: `Bearer ${tokenAdmin}`,
    })
    assert.equal(res.status, 403)
  })

  await t.test('TEST 9 — GA Asset Authorization: Superadmin can read GA asset', async () => {
    const res = await makeRequest(server, `/api/ga-assets/${gaAssetId}`, {
      Authorization: `Bearer ${tokenSuperadmin}`,
    })
    assert.equal(res.status, 200)
  })

  await t.test('TEST 10 — OPS Asset IDOR Defense: Admin without assets_ops permission is rejected with 403', async () => {
    const res = await makeRequest(server, `/api/ops-assets/${opsAssetId}`, {
      Authorization: `Bearer ${tokenAdmin}`,
    })
    assert.equal(res.status, 403)
  })

  await t.test('TEST 11 — OPS Asset Authorization: Superadmin can read OPS asset', async () => {
    const res = await makeRequest(server, `/api/ops-assets/${opsAssetId}`, {
      Authorization: `Bearer ${tokenSuperadmin}`,
    })
    assert.equal(res.status, 200)
  })

  await t.test('TEST 12 — Soft deleted asset returns 404 for authorized requests', async () => {
    const softDeletedRes = await pool.query(
      `INSERT INTO aset_ti (hostname, serial_number, status, kondisi, deleted_at)
       VALUES ($1, $2, 'Stock', 'Normal', CURRENT_TIMESTAMP) RETURNING id`,
      [`DEL-HOST-${Date.now()}`, `DEL-SN-${Date.now()}`],
    )
    const softDeletedId = softDeletedRes.rows[0].id

    const res = await makeRequest(server, `/api/assets/${softDeletedId}`, {
      Authorization: `Bearer ${tokenSuperadmin}`,
    })
    assert.equal(res.status, 404)

    await pool.query('DELETE FROM aset_ti WHERE id = $1', [softDeletedId]).catch(() => {})
  })

  await t.test('TEST 13 — Mass assignment prevention: payload cannot modify system fields', async () => {
    const res = await makeRequest(
      server,
      `/api/assets/${assetAId}`,
      {
        method: 'PUT',
        Authorization: `Bearer ${tokenSuperadmin}`,
      },
      {
        hostname: `HOST-A-${Date.now()}`,
        serial_number: `SN-A-${Date.now()}`,
        status: 'Stock',
        kondisi: 'Normal',
        deleted_at: '2020-01-01T00:00:00Z', // Attempt mass assignment override
      },
    )
    assert.equal(res.status, 200)

    // Verify deleted_at remains NULL in database
    const dbRes = await pool.query('SELECT deleted_at FROM aset_ti WHERE id = $1', [assetAId])
    assert.equal(dbRes.rows[0].deleted_at, null)
  })
})
