export const EXPECTED_SCHEMA_VERSION = 1

const nn = (type) => Object.freeze({ type, nullable: false })
const optional = (type) => Object.freeze({ type, nullable: true })

const REQUIRED_RUNTIME_SCHEMA = Object.freeze({
  app_schema_migrations: {
    version: nn('int4'),
    name: nn('varchar'),
    checksum_sha256: nn('bpchar'),
    applied_at: nn('timestamp'),
    applied_by: nn('varchar'),
    recovery_proof_id: nn('varchar'),
    change_id: optional('varchar'),
    execution_ms: nn('int4'),
  },
  aset_ti: {
    id_aset: nn('int8'),
    hostname: optional('varchar'),
    nomor_seri: optional('varchar'),
    label_aset: nn('varchar'),
    spesifikasi: optional('text'),
    id_karyawan: optional('int8'),
    lokasi_aset: optional('varchar'),
    tipe_perangkat: optional('varchar'),
    merek: optional('varchar'),
    model: optional('varchar'),
    status_aset: optional('varchar'),
    kondisi_aset: optional('varchar'),
    catatan_aset: optional('text'),
    deleted_at: optional('timestamp'),
    deleted_by_user_id: optional('int8'),
    deletion_reason: optional('text'),
    dibuat_pada: nn('timestamp'),
    diperbarui_pada: nn('timestamp'),
  },
  komentar_tiket: {
    id: nn('int8'),
    id_tiket: nn('int8'),
    nama_pengguna: nn('varchar'),
    role_pengguna: nn('varchar'),
    pesan: nn('text'),
    attachment: optional('text'),
    dibuat_pada: nn('timestamp'),
  },
  daftar_aset_ti_lengkap: {
    id_aset: optional('int8'),
    hostname: optional('varchar'),
    nomor_seri: optional('varchar'),
    label_aset: optional('varchar'),
    spesifikasi: optional('text'),
    nik: optional('varchar'),
    nama_karyawan: optional('varchar'),
    departemen: optional('varchar'),
    lokasi_kerja: optional('varchar'),
    tipe_perangkat: optional('varchar'),
    merek: optional('varchar'),
    model: optional('varchar'),
    status_aset: optional('varchar'),
    kondisi_aset: optional('varchar'),
    catatan_aset: optional('text'),
    lokasi_aset: optional('varchar'),
  },
  karyawan: {
    id_karyawan: nn('int8'),
    nik: nn('varchar'),
    nama_karyawan: nn('varchar'),
    email_kantor: optional('varchar'),
    lokasi_kerja: optional('varchar'),
    status_karyawan: optional('varchar'),
    jabatan: optional('varchar'),
    folder_karyawan: optional('varchar'),
    tingkat_jabatan: optional('varchar'),
    departemen: optional('varchar'),
    direktorat: optional('varchar'),
    tanggal_mulai_bekerja: optional('date'),
    jenis_perjanjian_kerja: optional('varchar'),
    status_kepegawaian: optional('varchar'),
    id_atasan_langsung: optional('int8'),
    dibuat_pada: nn('timestamp'),
    diperbarui_pada: nn('timestamp'),
  },
  log_audit_login: {
    id: nn('int8'),
    nama_pengguna: nn('varchar'),
    email: nn('varchar'),
    aktifitas: nn('varchar'),
    ip_address: optional('varchar'),
    browser: optional('varchar'),
    dibuat_pada: nn('timestamp'),
  },
  log_riwayat_aset: {
    id: nn('int8'),
    id_aset: optional('int8'),
    label_aset: nn('varchar'),
    aksi: nn('varchar'),
    perubahan: nn('text'),
    oleh_pengguna: nn('varchar'),
    dibuat_pada: nn('timestamp'),
  },
  log_riwayat_tiket: {
    id: nn('int8'),
    id_tiket: optional('int8'),
    nomor_tiket: optional('varchar'),
    aksi: nn('varchar'),
    perubahan: nn('text'),
    oleh_pengguna: nn('varchar'),
    dibuat_pada: nn('timestamp'),
  },
  riwayat_pemakaian_aset: {
    id: nn('int8'),
    id_aset: optional('int8'),
    label_aset: nn('varchar'),
    nomor_seri: optional('varchar'),
    tipe_perangkat: optional('varchar'),
    merek: optional('varchar'),
    model: optional('varchar'),
    id_karyawan: optional('int8'),
    nik: nn('varchar'),
    nama_karyawan: nn('varchar'),
    tanggal_mulai: nn('timestamp'),
    tanggal_selesai: optional('timestamp'),
    catatan: optional('text'),
    dibuat_pada: nn('timestamp'),
  },
  ticket_casp_ratings: {
    id: nn('int8'),
    ticket_id: nn('int8'),
    reporter_user_id: optional('int8'),
    assignee_user_id: optional('int8'),
    reporter_name_snapshot: nn('varchar'),
    assignee_name_snapshot: nn('varchar'),
    rating: nn('int2'),
    feedback: optional('text'),
    submitted_at: nn('timestamp'),
    updated_at: nn('timestamp'),
  },
  ticket_queues: {
    id: nn('int8'),
    kode: nn('varchar'),
    nama: nn('varchar'),
    deskripsi: optional('text'),
    is_active: nn('bool'),
    dibuat_pada: nn('timestamp'),
    diperbarui_pada: nn('timestamp'),
  },
  tickets: {
    id: nn('int8'),
    nomor_tiket: nn('varchar'),
    judul: nn('varchar'),
    deskripsi: optional('text'),
    kategori: nn('varchar'),
    prioritas: nn('varchar'),
    status_tiket: nn('varchar'),
    assigned_to: optional('varchar'),
    pelapor: optional('varchar'),
    attachment: optional('text'),
    queue_id: nn('int8'),
    pelapor_user_id: optional('int8'),
    assigned_to_user_id: optional('int8'),
    resolved_at: optional('timestamp'),
    resolved_by_user_id: optional('int8'),
    deleted_at: optional('timestamp'),
    deleted_by_user_id: optional('int8'),
    deletion_reason: optional('text'),
    dibuat_pada: nn('timestamp'),
    diperbarui_pada: nn('timestamp'),
  },
  user_ticket_queues: {
    user_id: nn('int8'),
    queue_id: nn('int8'),
    is_primary: nn('bool'),
    dibuat_pada: nn('timestamp'),
  },
  users: {
    id: nn('int8'),
    nama: nn('varchar'),
    email: nn('varchar'),
    password: nn('varchar'),
    role: nn('varchar'),
    permissions: nn('jsonb'),
    is_active: nn('bool'),
    deleted_at: optional('timestamp'),
    deleted_by_user_id: optional('int8'),
    deletion_reason: optional('text'),
    dibuat_pada: nn('timestamp'),
    diperbarui_pada: nn('timestamp'),
  },
})

const REQUIRED_RELATION_KINDS = Object.freeze({
  app_schema_migrations: 'r',
  aset_ti: 'r',
  komentar_tiket: 'r',
  daftar_aset_ti_lengkap: 'v',
  karyawan: 'r',
  log_audit_login: 'r',
  log_riwayat_aset: 'r',
  log_riwayat_tiket: 'r',
  riwayat_pemakaian_aset: 'r',
  ticket_casp_ratings: 'r',
  ticket_queues: 'r',
  tickets: 'r',
  user_ticket_queues: 'r',
  users: 'r',
})

const REQUIRED_CONSTRAINTS = Object.freeze([
  'aset_ti.fk_aset_ti_karyawan',
  'aset_ti.fk_aset_ti_deleted_by',
  'aset_ti.pk_aset_ti',
  'aset_ti.chk_aset_ti_soft_delete_metadata',
  'aset_ti.uq_aset_ti_label',
  'aset_ti.uq_aset_ti_nomor_seri',
  'komentar_tiket.chk_komentar_tiket_role',
  'komentar_tiket.fk_komentar_tiket_ticket',
  'komentar_tiket.pk_komentar_tiket',
  'karyawan.fk_karyawan_atasan',
  'karyawan.pk_karyawan',
  'karyawan.uq_karyawan_nik',
  'riwayat_pemakaian_aset.chk_riwayat_pemakaian_range',
  'riwayat_pemakaian_aset.fk_riwayat_pemakaian_aset_aset',
  'riwayat_pemakaian_aset.fk_riwayat_pemakaian_aset_karyawan',
  'ticket_casp_ratings.chk_ticket_casp_different_actor',
  'ticket_casp_ratings.chk_ticket_casp_rating',
  'ticket_casp_ratings.fk_ticket_casp_assignee',
  'ticket_casp_ratings.fk_ticket_casp_reporter',
  'ticket_casp_ratings.fk_ticket_casp_ticket',
  'ticket_casp_ratings.uq_ticket_casp_ratings_ticket',
  'ticket_queues.pk_ticket_queues',
  'ticket_queues.uq_ticket_queues_kode',
  'tickets.chk_tickets_prioritas',
  'tickets.chk_tickets_soft_delete_metadata',
  'tickets.chk_tickets_status',
  'tickets.fk_tickets_assignee',
  'tickets.fk_tickets_deleted_by',
  'tickets.fk_tickets_queue',
  'tickets.fk_tickets_reporter',
  'tickets.fk_tickets_resolver',
  'tickets.pk_tickets',
  'tickets.uq_tickets_nomor',
  'user_ticket_queues.fk_user_ticket_queues_queue',
  'user_ticket_queues.fk_user_ticket_queues_user',
  'user_ticket_queues.pk_user_ticket_queues',
  'users.chk_users_permissions_object',
  'users.chk_users_role',
  'users.chk_users_soft_delete_metadata',
  'users.fk_users_deleted_by',
  'users.pk_users',
])

const REQUIRED_INDEXES = Object.freeze([
  'idx_aset_ti_active_listing',
  'idx_aset_ti_deleted_at',
  'idx_aset_ti_karyawan',
  'idx_komentar_tiket_ticket_id',
  'idx_log_audit_login_created',
  'idx_log_riwayat_aset_asset_created',
  'idx_log_riwayat_tiket_ticket_id',
  'idx_riwayat_pemakaian_asset_started',
  'idx_riwayat_pemakaian_nik_started',
  'idx_ticket_casp_assignee_submitted',
  'idx_ticket_casp_reporter_submitted',
  'idx_tickets_assigned_status',
  'idx_tickets_deleted_at',
  'idx_tickets_queue_status_created',
  'idx_tickets_reporter_created',
  'idx_tickets_resolved_at',
  'idx_user_ticket_queues_queue_user',
  'idx_users_active_role',
  'idx_users_deleted_at',
  'uq_karyawan_email_normalized',
  'uq_riwayat_pemakaian_active_asset',
  'uq_user_ticket_queues_primary_user',
  'uq_users_email_normalized',
])

const REQUIRED_TRIGGERS = Object.freeze([
  'aset_ti.trg_aset_ti_prevent_hard_delete',
  'tickets.trg_tickets_prevent_hard_delete',
  'users.trg_users_prevent_hard_delete',
])

export function getRequiredRuntimeColumns() {
  return Object.entries(REQUIRED_RUNTIME_SCHEMA).flatMap(([relation, columns]) =>
    Object.keys(columns).map((column) => `${relation}.${column}`),
  )
}

export function getRuntimeSchemaContract() {
  return REQUIRED_RUNTIME_SCHEMA
}

function formatProblems(label, problems) {
  return problems.length > 0 ? `${label}: ${problems.join(', ')}` : null
}

export async function verifyDatabaseRuntimeRole(queryable, { requireNonSuperuser = false } = {}) {
  const result = await queryable.query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      COALESCE(role.rolsuper, FALSE) AS is_superuser,
      pg_is_in_recovery() AS is_replica,
      current_setting('transaction_read_only')::boolean AS transaction_read_only
    FROM pg_roles role
    WHERE role.rolname = current_user
  `)
  if (result.rowCount !== 1) {
    throw new Error('Identity database runtime tidak dapat diverifikasi.')
  }

  const identity = result.rows[0]
  if (requireNonSuperuser && identity.is_superuser === true) {
    throw new Error('Role database runtime tidak boleh superuser.')
  }
  return identity
}

export async function verifyRuntimeSchema(
  queryable,
  {
    expectedVersion = EXPECTED_SCHEMA_VERSION,
    requireNonSuperuser = false,
  } = {},
) {
  const columnsResult = await queryable.query(`
    SELECT
      table_name,
      column_name,
      udt_name,
      is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `)
  const actualColumns = new Map(
    columnsResult.rows.map((row) => [
      `${row.table_name}.${row.column_name}`,
      {
        type: row.udt_name,
        nullable: row.is_nullable === 'YES',
      },
    ]),
  )

  const missing = []
  const typeMismatch = []
  const nullabilityMismatch = []
  for (const [relation, columns] of Object.entries(REQUIRED_RUNTIME_SCHEMA)) {
    for (const [column, expected] of Object.entries(columns)) {
      const key = `${relation}.${column}`
      const actual = actualColumns.get(key)
      if (!actual) {
        missing.push(key)
        continue
      }
      if (actual.type !== expected.type) {
        typeMismatch.push(`${key} expected=${expected.type} actual=${actual.type}`)
      }
      if (actual.nullable !== expected.nullable) {
        nullabilityMismatch.push(
          `${key} expected=${expected.nullable ? 'nullable' : 'not-null'}`,
        )
      }
    }
  }

  const initialProblems = [
    formatProblems('Missing', missing),
    formatProblems('Type mismatch', typeMismatch),
    formatProblems('Nullability mismatch', nullabilityMismatch),
  ].filter(Boolean)
  if (initialProblems.length > 0) {
    throw new Error(`Runtime schema belum siap. ${initialProblems.join('; ')}`)
  }

  const relationsResult = await queryable.query(`
    SELECT c.relname AS relation_name, c.relkind AS relation_kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY($1::text[])
  `, [Object.keys(REQUIRED_RELATION_KINDS)])
  const actualRelationKinds = new Map(
    relationsResult.rows.map((row) => [row.relation_name, row.relation_kind]),
  )
  const relationMismatch = Object.entries(REQUIRED_RELATION_KINDS)
    .filter(([relation, kind]) => actualRelationKinds.get(relation) !== kind)
    .map(([relation, kind]) => `${relation} expected-kind=${kind}`)

  const constraintsResult = await queryable.query(`
    SELECT
      table_class.relname AS table_name,
      constraint_row.conname AS constraint_name,
      constraint_row.convalidated AS is_valid
    FROM pg_constraint constraint_row
    JOIN pg_class table_class ON table_class.oid = constraint_row.conrelid
    JOIN pg_namespace namespace_row ON namespace_row.oid = table_class.relnamespace
    WHERE namespace_row.nspname = 'public'
  `)
  const actualConstraints = new Map(
    constraintsResult.rows.map((row) => [
      `${row.table_name}.${row.constraint_name}`,
      row.is_valid === true,
    ]),
  )
  const missingConstraints = REQUIRED_CONSTRAINTS.filter(
    (constraint) => !actualConstraints.has(constraint),
  )
  const invalidConstraints = REQUIRED_CONSTRAINTS.filter(
    (constraint) => actualConstraints.get(constraint) === false,
  )

  const indexesResult = await queryable.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
  `)
  const actualIndexes = new Set(indexesResult.rows.map((row) => row.indexname))
  const missingIndexes = REQUIRED_INDEXES.filter((index) => !actualIndexes.has(index))

  const triggersResult = await queryable.query(`
    SELECT
      table_class.relname AS table_name,
      trigger_row.tgname AS trigger_name,
      trigger_row.tgenabled AS enabled,
      pg_get_triggerdef(trigger_row.oid) AS definition
    FROM pg_trigger trigger_row
    JOIN pg_class table_class ON table_class.oid = trigger_row.tgrelid
    JOIN pg_namespace namespace_row ON namespace_row.oid = table_class.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND trigger_row.tgisinternal = FALSE
  `)
  const actualTriggers = new Map(
    triggersResult.rows.map((row) => [
      `${row.table_name}.${row.trigger_name}`,
      {
        enabled: row.enabled !== 'D',
        definition: row.definition,
      },
    ]),
  )
  const missingTriggers = REQUIRED_TRIGGERS.filter(
    (trigger) => !actualTriggers.has(trigger),
  )
  const invalidTriggers = REQUIRED_TRIGGERS.filter((trigger) => {
    const actual = actualTriggers.get(trigger)
    return (
      actual &&
      (!actual.enabled ||
        !/BEFORE DELETE/i.test(actual.definition ?? '') ||
        !/app_reject_hard_delete/i.test(actual.definition ?? ''))
    )
  })

  const versionResult = await queryable.query(
    'SELECT COALESCE(MAX(version), 0)::int AS version FROM app_schema_migrations',
  )
  const actualVersion = Number(versionResult.rows[0]?.version ?? 0)
  const versionProblems =
    actualVersion === expectedVersion
      ? []
      : [`expected=${expectedVersion} actual=${actualVersion}`]

  const problems = [
    formatProblems('Relation mismatch', relationMismatch),
    formatProblems('Missing constraints', missingConstraints),
    formatProblems('Invalid constraints', invalidConstraints),
    formatProblems('Missing indexes', missingIndexes),
    formatProblems('Missing triggers', missingTriggers),
    formatProblems('Invalid triggers', invalidTriggers),
    formatProblems('Schema version mismatch', versionProblems),
  ].filter(Boolean)

  if (problems.length > 0) {
    throw new Error(`Runtime schema belum siap. ${problems.join('; ')}`)
  }

  return verifyDatabaseRuntimeRole(queryable, { requireNonSuperuser })
}
