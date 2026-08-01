const REQUIRED_RUNTIME_COLUMNS = Object.freeze({
  aset_ti: [
    'id_aset',
    'nomor_seri',
    'label_aset',
    'spesifikasi',
    'id_karyawan',
    'lokasi_aset',
    'tipe_perangkat',
    'merek',
    'model',
    'status_aset',
    'kondisi_aset',
    'catatan_aset',
    'dibuat_pada',
    'diperbarui_pada',
  ],
  komentar_tiket: [
    'id',
    'id_tiket',
    'nama_pengguna',
    'role_pengguna',
    'pesan',
    'attachment',
    'dibuat_pada',
  ],
  daftar_aset_ti_lengkap: [
    'id_aset',
    'nomor_seri',
    'label_aset',
    'spesifikasi',
    'nik',
    'nama_karyawan',
    'departemen',
    'lokasi_kerja',
    'tipe_perangkat',
    'merek',
    'model',
    'status_aset',
    'kondisi_aset',
    'catatan_aset',
    'lokasi_aset',
  ],
  karyawan: [
    'id_karyawan',
    'nik',
    'nama_karyawan',
    'email_kantor',
    'lokasi_kerja',
    'status_karyawan',
    'jabatan',
    'folder_karyawan',
    'tingkat_jabatan',
    'departemen',
    'direktorat',
    'tanggal_mulai_bekerja',
    'jenis_perjanjian_kerja',
    'status_kepegawaian',
    'id_atasan_langsung',
    'dibuat_pada',
    'diperbarui_pada',
  ],
  log_audit_login: [
    'id',
    'nama_pengguna',
    'email',
    'aktifitas',
    'ip_address',
    'browser',
    'dibuat_pada',
  ],
  log_riwayat_aset: [
    'id',
    'id_aset',
    'label_aset',
    'aksi',
    'perubahan',
    'oleh_pengguna',
    'dibuat_pada',
  ],
  log_riwayat_tiket: [
    'id',
    'id_tiket',
    'nomor_tiket',
    'aksi',
    'perubahan',
    'oleh_pengguna',
    'dibuat_pada',
  ],
  riwayat_pemakaian_aset: [
    'id',
    'id_aset',
    'label_aset',
    'nomor_seri',
    'tipe_perangkat',
    'merek',
    'model',
    'id_karyawan',
    'nik',
    'nama_karyawan',
    'tanggal_mulai',
    'tanggal_selesai',
    'catatan',
    'dibuat_pada',
  ],
  ticket_casp_ratings: [
    'id',
    'ticket_id',
    'reporter_user_id',
    'assignee_user_id',
    'reporter_name_snapshot',
    'assignee_name_snapshot',
    'rating',
    'feedback',
    'submitted_at',
    'updated_at',
  ],
  ticket_queues: [
    'id',
    'kode',
    'nama',
    'deskripsi',
    'is_active',
    'dibuat_pada',
    'diperbarui_pada',
  ],
  tickets: [
    'id',
    'nomor_tiket',
    'judul',
    'deskripsi',
    'kategori',
    'prioritas',
    'status_tiket',
    'assigned_to',
    'pelapor',
    'attachment',
    'queue_id',
    'pelapor_user_id',
    'assigned_to_user_id',
    'resolved_at',
    'resolved_by_user_id',
    'dibuat_pada',
    'diperbarui_pada',
  ],
  user_ticket_queues: [
    'user_id',
    'queue_id',
    'is_primary',
    'dibuat_pada',
  ],
  users: [
    'id',
    'nama',
    'email',
    'password',
    'role',
    'permissions',
    'is_active',
    'dibuat_pada',
    'diperbarui_pada',
  ],
})

export function getRequiredRuntimeColumns() {
  return Object.entries(REQUIRED_RUNTIME_COLUMNS).flatMap(([relation, columns]) =>
    columns.map((column) => `${relation}.${column}`),
  )
}

export async function verifyRuntimeSchema(queryable) {
  const result = await queryable.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `)
  const actual = new Set(
    result.rows.map(({ table_name: relation, column_name: column }) =>
      `${relation}.${column}`,
    ),
  )
  const missing = getRequiredRuntimeColumns().filter((column) => !actual.has(column))

  if (missing.length > 0) {
    throw new Error(
      `Runtime schema belum siap. Jalankan migration yang telah diverifikasi sebelum traffic. Missing: ${missing.join(', ')}`,
    )
  }
}
