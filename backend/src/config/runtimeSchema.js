// Runtime schema validation untuk Simple Schema with CHECK Constraints
export const EXPECTED_SCHEMA_VERSION = 2

const nn = (type) => Object.freeze({ type, nullable: false })
const optional = (type) => Object.freeze({ type, nullable: true })

const REQUIRED_RUNTIME_SCHEMA = Object.freeze({
  karyawan: {
    id: nn('int4'),
    nik: nn('varchar'),
    nama_karyawan: nn('varchar'),
    status: nn('varchar'),
    title: nn('varchar'),
    job_level: nn('varchar'),
    departemen: nn('varchar'),
    directorate: nn('varchar'),
    tanggal_mulai_bekerja: nn('date'),
    employeement_status: nn('varchar'),
    nik_atasan_langsung: optional('varchar'),
    email_kantor: nn('varchar'),
    lokasi_kerja: optional('varchar'),
    created_at: nn('timestamp'),
    updated_at: nn('timestamp'),
  },
  users: {
    id: nn('int4'),
    nama: nn('varchar'),
    email: nn('varchar'),
    password_hash: nn('text'),
    role: nn('varchar'),
    permissions: nn('jsonb'),
    is_active: nn('bool'),
    deleted_at: optional('timestamp'),
    deleted_by_id: optional('int4'),
    deletion_reason: optional('text'),
    created_at: nn('timestamp'),
    updated_at: nn('timestamp'),
  },
  aset_ti: {
    id: nn('int4'),
    hostname: nn('varchar'),
    serial_number: nn('varchar'),
    spesifikasi: optional('text'),
    nik_pemegang_asset: optional('varchar'),
    nama_karyawan_pemegang_asset: optional('varchar'),
    departemen_pemegang_asset: optional('varchar'),
    lokasi_asset: optional('varchar'),
    tipe_perangkat: optional('varchar'),
    brand_merek: optional('varchar'),
    model: optional('varchar'),
    status: nn('varchar'), // Has DEFAULT 'In Use' -> NOT NULL
    kondisi: nn('varchar'), // Has DEFAULT 'Normal' -> NOT NULL
    note_asset: optional('varchar'),
    deleted_at: optional('timestamp'),
    created_at: nn('timestamp'),
    updated_at: nn('timestamp'),
  },
  ticket_queues: {
    id: nn('int4'),
    kode: nn('varchar'),
    nama: nn('varchar'),
    deskripsi: optional('text'),
    is_active: nn('bool'),
    created_at: nn('timestamp'),
    updated_at: nn('timestamp'),
  },
  tickets: {
    id: nn('int4'),
    nomor_tiket: nn('varchar'),
    judul: nn('varchar'),
    deskripsi: optional('text'),
    kategori: optional('varchar'),
    prioritas: nn('varchar'),
    status_tiket: nn('varchar'),
    queue_id: optional('int4'),
    assigned_to_user_id: optional('int4'),
    pelapor_user_id: nn('int4'),
    attachment_count: optional('int4'),
    resolved_at: optional('timestamp'),
    resolved_by_user_id: optional('int4'),
    deleted_at: optional('timestamp'),
    deleted_by_user_id: optional('int4'),
    deletion_reason: optional('text'),
    created_at: nn('timestamp'),
    updated_at: nn('timestamp'),
  },
  komentar_tiket: {
    id: nn('int4'),
    id_tiket: nn('int4'),
    pesan: nn('text'),
    attachment_data: optional('text'),
    user_id: nn('int4'),
    created_at: nn('timestamp'),
  },
  ticket_casp_ratings: {
    id: nn('int4'),
    id_tiket: nn('int4'),
    reporter_user_id: nn('int4'),
    assignee_user_id: optional('int4'),
    rating_score: nn('int4'),
    feedback: optional('text'),
    submitted_at: nn('timestamp'),
  },
  user_ticket_queues: {
    id: nn('int4'),
    user_id: nn('int4'),
    queue_id: nn('int4'),
    is_primary: nn('bool'),
    created_at: nn('timestamp'),
  },
  log_riwayat_tiket: {
    id: nn('int4'),
    id_tiket: nn('int4'),
    action: nn('varchar'),
    old_value: optional('jsonb'),
    new_value: optional('jsonb'),
    actor_name: nn('varchar'),
    created_at: nn('timestamp'),
  },
  riwayat_pemakaian_aset: {
    id: nn('int4'),
    id_aset: nn('int4'),
    nik_pemegang: optional('varchar'),
    tanggal_mulai: nn('timestamp'),
    tanggal_selesai: optional('timestamp'),
    catatan: optional('text'),
    created_at: nn('timestamp'),
    updated_at: nn('timestamp'),
  },
  log_riwayat_aset: {
    id: nn('int4'),
    id_aset: nn('int4'),
    label_aset: optional('varchar'),
    aksi: nn('varchar'),
    perubahan: optional('text'),
    oleh_pengguna: nn('varchar'),
    dibuat_pada: nn('timestamp'),
  },
  log_audit_login: {
    id: nn('int4'),
    user_id: optional('int4'),
    email: optional('varchar'),
    login_time: nn('timestamp'),
    ip_address: optional('varchar'),
    user_agent: optional('text'),
    created_at: nn('timestamp'),
  },
})

const REQUIRED_RELATION_KINDS = Object.freeze({
  karyawan: 'r',
  users: 'r',
  aset_ti: 'r',
  ticket_queues: 'r',
  tickets: 'r',
  komentar_tiket: 'r',
  ticket_casp_ratings: 'r',
  user_ticket_queues: 'r',
  log_riwayat_tiket: 'r',
  log_riwayat_aset: 'r',
  riwayat_pemakaian_aset: 'r',
  log_audit_login: 'r',
})

const REQUIRED_INDEXES = Object.freeze([
  'idx_karyawan_departemen',
  'idx_karyawan_email',
  'idx_karyawan_nik_atasan',
  'idx_users_email',
  'idx_users_is_active',
  'idx_aset_hostname',
  'idx_aset_serial_number',
  'idx_aset_status',
  'idx_aset_kondisi',
  'idx_aset_nik_pemegang',
  'idx_tickets_queue_status',
  'idx_tickets_assigned_status',
  'idx_tickets_reporter_created',
  'idx_komentar_tiket_id',
  'idx_log_riwayat_tiket_id',
  'idx_rpa_active',
  'idx_log_audit_login_time',
])

const REQUIRED_TRIGGERS = Object.freeze([]) // Triggers are optional

export function getRequiredRuntimeColumns() {
  return Object.entries(REQUIRED_RUNTIME_SCHEMA).flatMap(([relation, columns]) =>
    Object.keys(columns).map((column) => `${relation}.${column}`),
  )
}

export async function verifyRuntimeSchema(
  queryable,
  { expectedVersion = EXPECTED_SCHEMA_VERSION } = {},
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

  if ([missing, typeMismatch, nullabilityMismatch].some((p) => p.length > 0)) {
    const problems = [
      missing.length > 0 ? `Missing: ${missing.join(', ')}` : null,
      typeMismatch.length > 0 ? `Type mismatch: ${typeMismatch.join(', ')}` : null,
      nullabilityMismatch.length > 0 ? `Nullability mismatch: ${nullabilityMismatch.join(', ')}` : null,
    ].filter(Boolean)
    throw new Error(`Runtime schema belum siap. ${problems.join('; ')}`)
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

  const indexesResult = await queryable.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
  `)
  const actualIndexes = new Set(indexesResult.rows.map((row) => row.indexname))
  const missingIndexes = REQUIRED_INDEXES.filter((index) => !actualIndexes.has(index))

  const triggersResult = await queryable.query(`
    SELECT trigger_name
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
  `)
  const actualTriggers = new Set(triggersResult.rows.map((row) => row.trigger_name))
  const missingTriggers = REQUIRED_TRIGGERS.filter((trigger) => !actualTriggers.has(trigger))

  const problems = [
    relationMismatch.length > 0 ? `Relation mismatch: ${relationMismatch.join(', ')}` : null,
    missingIndexes.length > 0 ? `Missing indexes: ${missingIndexes.join(', ')}` : null,
    missingTriggers.length > 0 ? `Missing triggers: ${missingTriggers.join(', ')}` : null,
  ].filter(Boolean)

  if (problems.length > 0) {
    throw new Error(`Runtime schema belum siap. ${problems.join('; ')}`)
  }

  return {
    database_name: 'esb_trackit',
    database_user: 'postgres',
    is_superuser: true,
  }
}
