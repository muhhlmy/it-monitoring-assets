import assert from 'node:assert/strict'
import test from 'node:test'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'a'.repeat(32)
process.env.DB_HOST = '127.0.0.1'
process.env.DB_PORT = '5432'
process.env.DB_USER = 'test_user'
process.env.DB_PASSWORD = 'test_password_not_used'
process.env.DB_NAME = 'test_database'
process.env.CORS_ORIGINS = 'http://localhost:5173'

const { pool } = await import('../src/config/database.js')
const { destroyAsset, replaceAsset, storeAsset } =
  await import('../src/controllers/assetController.js')

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim()
}

function responseStub() {
  return {
    statusCode: 200,
    body: null,
    ended: false,
    status(value) {
      this.statusCode = value
      return this
    },
    end() {
      this.ended = true
      return this
    },
    json(value) {
      this.body = value
      return this
    },
  }
}

test('asset mutations reject a missing canonical audit actor before database access', async (t) => {
  const originalQuery = pool.query
  const originalConnect = pool.connect
  let databaseCalls = 0

  pool.query = async () => {
    databaseCalls += 1
    throw new Error('database must not be reached')
  }
  pool.connect = async () => {
    databaseCalls += 1
    throw new Error('database must not be reached')
  }
  t.after(() => {
    pool.query = originalQuery
    pool.connect = originalConnect
  })

  for (const invoke of [
    () => storeAsset({ body: { label_aset: 'ESB-LAP-NEW' } }, responseStub()),
    () =>
      replaceAsset(
        { params: { id: '17' }, body: { label_aset: 'ESB-LAP-017' } },
        responseStub(),
      ),
    () => destroyAsset({ params: { id: '17' } }, responseStub()),
  ]) {
    await assert.rejects(invoke(), (error) => error.statusCode === 403)
  }

  assert.equal(databaseCalls, 0)
})

test('asset create rolls back when canonical audit insertion fails', async (t) => {
  const originalQuery = pool.query
  const originalConnect = pool.connect
  const queries = []
  const auditError = new Error('asset create audit unavailable')
  let releases = 0

  t.after(() => {
    pool.query = originalQuery
    pool.connect = originalConnect
  })

  pool.query = async (sql) => {
    throw new Error(`asset create escaped its transaction: ${normalizeSql(sql)}`)
  }
  pool.connect = async () => ({
    async query(rawSql, parameters = []) {
      const sql = normalizeSql(rawSql)
      queries.push(sql)
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
        return { rowCount: 0, rows: [] }
      }
      if (sql.startsWith('INSERT INTO aset_ti')) {
        return { rowCount: 1, rows: [{ id_aset: 18 }] }
      }
      if (sql.includes('FROM daftar_aset_ti_lengkap')) {
        return {
          rowCount: 1,
          rows: [
            {
              id_aset: 18,
              label_aset: 'ESB-LAP-018',
              nomor_seri: 'SN-018',
              nik: null,
            },
          ],
        }
      }
      if (sql.startsWith('INSERT INTO log_riwayat_aset')) {
        assert.equal(parameters[4], 'user:3 Canonical Asset Admin')
        throw auditError
      }
      throw new Error(`unexpected asset create query: ${sql}`)
    },
    release() {
      releases += 1
    },
  })

  await assert.rejects(
    storeAsset(
      {
        user: { id: 3, nama: 'Canonical Asset Admin' },
        body: { label_aset: 'ESB-LAP-018', nomor_seri: 'SN-018' },
      },
      responseStub(),
    ),
    (error) => error === auditError,
  )

  assert.deepEqual(
    queries.filter((sql) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)),
    ['BEGIN', 'ROLLBACK'],
  )
  assert.equal(releases, 1)
})

test('asset delete closes active device cycles before FK nulling and rolls back with audit', async (t) => {
  const originalQuery = pool.query
  const originalConnect = pool.connect

  t.after(() => {
    pool.query = originalQuery
    pool.connect = originalConnect
  })

  for (const auditFails of [false, true]) {
    const queries = []
    let releases = 0
    const auditError = new Error('asset audit unavailable')

    pool.query = async (sql) => {
      throw new Error(`asset delete escaped its transaction: ${normalizeSql(sql)}`)
    }
    pool.connect = async () => ({
      async query(rawSql, parameters = []) {
        const sql = normalizeSql(rawSql)
        queries.push(sql)

        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
          return { rowCount: 0, rows: [] }
        }
        if (sql.startsWith('SELECT id_aset FROM aset_ti')) {
          assert.match(sql, /FOR UPDATE$/)
          return { rowCount: 1, rows: [{ id_aset: 17 }] }
        }
        if (sql.includes('FROM daftar_aset_ti_lengkap')) {
          return {
            rowCount: 1,
            rows: [
              {
                id_aset: 17,
                label_aset: 'ESB-LAP-017',
                nomor_seri: 'SN-017',
              },
            ],
          }
        }
        if (sql.startsWith('UPDATE riwayat_pemakaian_aset')) {
          return { rowCount: 1, rows: [] }
        }
        if (sql.startsWith('DELETE FROM aset_ti') || sql.startsWith('UPDATE aset_ti SET deleted_at')) {
          return { rowCount: 1, rows: [] }
        }
        if (sql.startsWith('INSERT INTO log_riwayat_aset')) {
          assert.equal(parameters[4], 'user:3 Canonical Asset Admin')
          if (auditFails) throw auditError
          return { rowCount: 1, rows: [] }
        }
        throw new Error(`unexpected asset transaction query: ${sql}`)
      },
      release() {
        releases += 1
      },
    })

    const response = responseStub()
    const invocation = destroyAsset(
      {
        params: { id: '17' },
        user: { id: 3, nama: 'Canonical Asset Admin' },
      },
      response,
    )
    if (auditFails) {
      await assert.rejects(invocation, (error) => error === auditError)
    } else {
      await invocation
    }

    const cycleIndex = queries.findIndex((sql) =>
      sql.startsWith('UPDATE riwayat_pemakaian_aset'),
    )
    const deleteIndex = queries.findIndex(
      (sql) => sql.startsWith('DELETE FROM aset_ti') || sql.startsWith('UPDATE aset_ti SET deleted_at'),
    )
    const auditIndex = queries.findIndex((sql) =>
      sql.startsWith('INSERT INTO log_riwayat_aset'),
    )

    assert.ok(cycleIndex > 0 && cycleIndex < deleteIndex)
    assert.ok(auditIndex > deleteIndex)
    assert.equal(releases, 1)
    assert.deepEqual(
      queries.filter((sql) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)),
      auditFails ? ['BEGIN', 'ROLLBACK'] : ['BEGIN', 'COMMIT'],
    )
    assert.equal(response.ended, !auditFails)
    if (!auditFails) assert.equal(response.statusCode, 204)
  }
})

test('asset reassignment locks and reloads canonical state and audits the authenticated actor', async (t) => {
  const originalQuery = pool.query
  const originalConnect = pool.connect
  const queries = []
  let viewReads = 0

  t.after(() => {
    pool.query = originalQuery
    pool.connect = originalConnect
  })

  pool.query = async (sql) => {
    throw new Error(`asset update escaped its transaction: ${normalizeSql(sql)}`)
  }
  pool.connect = async () => ({
    async query(rawSql, parameters = []) {
      const sql = normalizeSql(rawSql)
      queries.push(sql)

      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
        return { rowCount: 0, rows: [] }
      }
      if (sql.startsWith('SELECT id_aset FROM aset_ti')) {
        assert.match(sql, /FOR UPDATE$/)
        return { rowCount: 1, rows: [{ id_aset: 17 }] }
      }
      if (sql.includes('FROM daftar_aset_ti_lengkap')) {
        viewReads += 1
        return {
          rowCount: 1,
          rows: [
            {
              id_aset: 17,
              label_aset: 'ESB-LAP-017',
              nomor_seri: 'SN-017',
              nik: viewReads === 1 ? 'EMP-OLD' : 'EMP-NEW',
              nama_karyawan: viewReads === 1 ? 'Old Holder' : 'New Holder',
              tipe_perangkat: 'Laptop',
              merek: 'Example',
              model: 'Secure',
            },
          ],
        }
      }
      if (sql === 'SELECT id_karyawan FROM karyawan WHERE nik = $1') {
        return { rowCount: 1, rows: [{ id_karyawan: 202 }] }
      }
      if (sql.startsWith('UPDATE aset_ti SET')) {
        return { rowCount: 1, rows: [] }
      }
      if (sql.startsWith('INSERT INTO log_riwayat_aset')) {
        assert.equal(parameters[4], 'user:3 Canonical Asset Admin')
        return { rowCount: 1, rows: [] }
      }
      if (sql.startsWith('UPDATE riwayat_pemakaian_aset')) {
        assert.deepEqual(parameters, ['17'])
        return { rowCount: 1, rows: [] }
      }
      if (sql.startsWith('SELECT id_karyawan, nik, nama_karyawan FROM karyawan')) {
        return {
          rowCount: 1,
          rows: [{ id_karyawan: 202, nik: 'EMP-NEW', nama_karyawan: 'New Holder' }],
        }
      }
      if (sql.startsWith('INSERT INTO riwayat_pemakaian_aset')) {
        return { rowCount: 1, rows: [] }
      }
      throw new Error(`unexpected asset update query: ${sql}`)
    },
    release() {},
  })

  const response = responseStub()
  await replaceAsset(
    {
      params: { id: '17' },
      user: { id: 3, nama: 'Canonical Asset Admin' },
      body: {
        label_aset: 'ESB-LAP-017',
        nomor_seri: 'SN-017',
        nik: 'EMP-NEW',
        tipe_perangkat: 'Laptop',
        merek: 'Example',
        model: 'Secure',
      },
    },
    response,
  )

  const lockIndex = queries.findIndex((sql) => sql.startsWith('SELECT id_aset FROM aset_ti'))
  const snapshotIndex = queries.findIndex((sql) =>
    sql.includes('FROM daftar_aset_ti_lengkap'),
  )
  const updateIndex = queries.findIndex((sql) => sql.startsWith('UPDATE aset_ti SET'))
  assert.ok(lockIndex > 0 && lockIndex < snapshotIndex && snapshotIndex < updateIndex)
  assert.equal(viewReads, 2)
  assert.deepEqual(
    queries.filter((sql) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)),
    ['BEGIN', 'COMMIT'],
  )
  assert.equal(response.body.nik, 'EMP-NEW')
})
