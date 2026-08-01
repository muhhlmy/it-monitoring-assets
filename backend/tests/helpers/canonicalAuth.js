export function normalizeTestSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim()
}

export function isCanonicalAuthQuery(sql) {
  return normalizeTestSql(sql).includes('/* canonical-auth-user */')
}

export function canonicalAuthUser({
  id,
  role = 'user',
  permissions = {},
  nama = `Canonical ${role}`,
  email = `user-${id}@example.test`,
  nik = `EMP-${id}`,
  jabatan = role,
} = {}) {
  return {
    id,
    nama,
    email,
    role,
    permissions,
    is_active: true,
    nik,
    jabatan,
  }
}

export function canonicalAuthResult(user) {
  return user
    ? { rowCount: 1, rows: [user] }
    : { rowCount: 0, rows: [] }
}
