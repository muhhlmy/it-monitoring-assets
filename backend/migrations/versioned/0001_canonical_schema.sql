-- Canonical PostgreSQL schema for a fresh IT Monitoring Assets database.
-- Apply only through the versioned migration runner. Existing databases without
-- app_schema_migrations require a separately reviewed adoption migration.

CREATE TABLE IF NOT EXISTS app_schema_migrations (
  version           INTEGER PRIMARY KEY,
  name              VARCHAR(160) NOT NULL UNIQUE,
  checksum_sha256   CHAR(64) NOT NULL,
  applied_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_by        VARCHAR(150) NOT NULL,
  recovery_proof_id VARCHAR(160) NOT NULL,
  change_id         VARCHAR(160),
  execution_ms      INTEGER NOT NULL CHECK (execution_ms >= 0)
);

CREATE TABLE karyawan (
  id_karyawan             BIGINT GENERATED ALWAYS AS IDENTITY,
  nik                     VARCHAR(30) NOT NULL,
  nama_karyawan           VARCHAR(150) NOT NULL,
  email_kantor            VARCHAR(150),
  lokasi_kerja            VARCHAR(100),
  status_karyawan         VARCHAR(30),
  jabatan                 VARCHAR(100),
  folder_karyawan         VARCHAR(255),
  tingkat_jabatan         VARCHAR(50),
  departemen              VARCHAR(100),
  direktorat              VARCHAR(100),
  tanggal_mulai_bekerja   DATE,
  jenis_perjanjian_kerja  VARCHAR(50),
  status_kepegawaian      VARCHAR(50),
  id_atasan_langsung      BIGINT,
  dibuat_pada             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diperbarui_pada         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_karyawan PRIMARY KEY (id_karyawan),
  CONSTRAINT uq_karyawan_nik UNIQUE (nik),
  CONSTRAINT chk_karyawan_nik_nonempty CHECK (BTRIM(nik) <> ''),
  CONSTRAINT chk_karyawan_nama_nonempty CHECK (BTRIM(nama_karyawan) <> ''),
  CONSTRAINT fk_karyawan_atasan
    FOREIGN KEY (id_atasan_langsung)
    REFERENCES karyawan (id_karyawan)
    ON DELETE SET NULL
);

CREATE TABLE aset_ti (
  id_aset           BIGINT GENERATED ALWAYS AS IDENTITY,
  nomor_seri        VARCHAR(100),
  label_aset        VARCHAR(100) NOT NULL,
  spesifikasi       TEXT,
  id_karyawan       BIGINT,
  lokasi_aset       VARCHAR(100),
  tipe_perangkat    VARCHAR(50),
  merek             VARCHAR(100),
  model             VARCHAR(100),
  status_aset       VARCHAR(30),
  kondisi_aset      VARCHAR(30),
  catatan_aset      TEXT,
  deleted_at        TIMESTAMP,
  deleted_by_user_id BIGINT,
  deletion_reason   TEXT,
  dibuat_pada       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diperbarui_pada   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_aset_ti PRIMARY KEY (id_aset),
  CONSTRAINT uq_aset_ti_nomor_seri UNIQUE (nomor_seri),
  CONSTRAINT uq_aset_ti_label UNIQUE (label_aset),
  CONSTRAINT chk_aset_ti_label_nonempty CHECK (BTRIM(label_aset) <> ''),
  CONSTRAINT chk_aset_ti_soft_delete_metadata CHECK (
    (deleted_at IS NULL AND deleted_by_user_id IS NULL AND deletion_reason IS NULL)
    OR (deleted_at IS NOT NULL AND BTRIM(COALESCE(deletion_reason, '')) <> '')
  ),
  CONSTRAINT fk_aset_ti_karyawan
    FOREIGN KEY (id_karyawan)
    REFERENCES karyawan (id_karyawan)
    ON DELETE SET NULL
);

CREATE TABLE users (
  id                BIGINT GENERATED ALWAYS AS IDENTITY,
  nama              VARCHAR(150) NOT NULL,
  email             VARCHAR(150) NOT NULL,
  password          VARCHAR(255) NOT NULL,
  role              VARCHAR(50) NOT NULL DEFAULT 'user',
  permissions       JSONB NOT NULL DEFAULT '{"dashboard":"none","assets":"none","my_assets":"read_only","tickets":"read_only","submissions":"none","users":"none","logs":"none","karyawan":"none","export":"none"}'::jsonb,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at        TIMESTAMP,
  deleted_by_user_id BIGINT,
  deletion_reason   TEXT,
  dibuat_pada       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diperbarui_pada   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_users PRIMARY KEY (id),
  CONSTRAINT chk_users_nama_nonempty CHECK (BTRIM(nama) <> ''),
  CONSTRAINT chk_users_email_nonempty CHECK (BTRIM(email) <> ''),
  CONSTRAINT chk_users_role CHECK (LOWER(BTRIM(role)) IN ('user', 'admin', 'superadmin', 'super admin')),
  CONSTRAINT chk_users_permissions_object CHECK (jsonb_typeof(permissions) = 'object'),
  CONSTRAINT chk_users_soft_delete_metadata CHECK (
    (deleted_at IS NULL AND deleted_by_user_id IS NULL AND deletion_reason IS NULL)
    OR (
      deleted_at IS NOT NULL
      AND is_active = FALSE
      AND BTRIM(COALESCE(deletion_reason, '')) <> ''
    )
  ),
  CONSTRAINT fk_users_deleted_by
    FOREIGN KEY (deleted_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT
);

ALTER TABLE aset_ti
  ADD CONSTRAINT fk_aset_ti_deleted_by
  FOREIGN KEY (deleted_by_user_id)
  REFERENCES users (id)
  ON DELETE RESTRICT;

CREATE TABLE log_riwayat_aset (
  id              BIGINT GENERATED ALWAYS AS IDENTITY,
  id_aset         BIGINT,
  label_aset      VARCHAR(100) NOT NULL,
  aksi            VARCHAR(50) NOT NULL,
  perubahan       TEXT NOT NULL,
  oleh_pengguna   VARCHAR(150) NOT NULL,
  dibuat_pada     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_log_riwayat_aset PRIMARY KEY (id),
  CONSTRAINT fk_log_riwayat_aset_aset
    FOREIGN KEY (id_aset)
    REFERENCES aset_ti (id_aset)
    ON DELETE SET NULL
);

CREATE TABLE log_audit_login (
  id              BIGINT GENERATED ALWAYS AS IDENTITY,
  nama_pengguna   VARCHAR(150) NOT NULL,
  email           VARCHAR(150) NOT NULL,
  aktifitas       VARCHAR(100) NOT NULL,
  ip_address      VARCHAR(50),
  browser         VARCHAR(255),
  dibuat_pada     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_log_audit_login PRIMARY KEY (id),
  CONSTRAINT chk_log_audit_login_activity
    CHECK (aktifitas IN ('LOGIN', 'LOGOUT', 'GAGAL_LOGIN'))
);

CREATE TABLE riwayat_pemakaian_aset (
  id                BIGINT GENERATED ALWAYS AS IDENTITY,
  id_aset           BIGINT,
  label_aset        VARCHAR(100) NOT NULL,
  nomor_seri        VARCHAR(100),
  tipe_perangkat    VARCHAR(50),
  merek             VARCHAR(100),
  model             VARCHAR(100),
  id_karyawan       BIGINT,
  nik               VARCHAR(30) NOT NULL,
  nama_karyawan     VARCHAR(150) NOT NULL,
  tanggal_mulai     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tanggal_selesai   TIMESTAMP,
  catatan           TEXT,
  dibuat_pada       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_riwayat_pemakaian_aset PRIMARY KEY (id),
  CONSTRAINT chk_riwayat_pemakaian_range
    CHECK (tanggal_selesai IS NULL OR tanggal_selesai >= tanggal_mulai),
  CONSTRAINT fk_riwayat_pemakaian_aset_aset
    FOREIGN KEY (id_aset)
    REFERENCES aset_ti (id_aset)
    ON DELETE SET NULL,
  CONSTRAINT fk_riwayat_pemakaian_aset_karyawan
    FOREIGN KEY (id_karyawan)
    REFERENCES karyawan (id_karyawan)
    ON DELETE SET NULL
);

CREATE TABLE ticket_queues (
  id                BIGINT GENERATED ALWAYS AS IDENTITY,
  kode              VARCHAR(20) NOT NULL,
  nama              VARCHAR(100) NOT NULL,
  deskripsi         TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  dibuat_pada       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diperbarui_pada   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_ticket_queues PRIMARY KEY (id),
  CONSTRAINT uq_ticket_queues_kode UNIQUE (kode),
  CONSTRAINT chk_ticket_queues_kode_nonempty CHECK (BTRIM(kode) <> ''),
  CONSTRAINT chk_ticket_queues_nama_nonempty CHECK (BTRIM(nama) <> '')
);

CREATE TABLE tickets (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY,
  nomor_tiket               VARCHAR(50) NOT NULL,
  judul                     VARCHAR(255) NOT NULL,
  deskripsi                 TEXT,
  kategori                  VARCHAR(100) NOT NULL DEFAULT 'IT',
  prioritas                 VARCHAR(30) NOT NULL DEFAULT 'Medium (3d)',
  status_tiket              VARCHAR(30) NOT NULL DEFAULT 'Open',
  assigned_to               VARCHAR(150),
  pelapor                   VARCHAR(150),
  attachment                TEXT,
  queue_id                  BIGINT NOT NULL,
  pelapor_user_id           BIGINT,
  assigned_to_user_id       BIGINT,
  resolved_at               TIMESTAMP,
  resolved_by_user_id       BIGINT,
  deleted_at                TIMESTAMP,
  deleted_by_user_id        BIGINT,
  deletion_reason           TEXT,
  dibuat_pada               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  diperbarui_pada           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_tickets PRIMARY KEY (id),
  CONSTRAINT uq_tickets_nomor UNIQUE (nomor_tiket),
  CONSTRAINT chk_tickets_nomor_nonempty CHECK (BTRIM(nomor_tiket) <> ''),
  CONSTRAINT chk_tickets_judul_nonempty CHECK (BTRIM(judul) <> ''),
  CONSTRAINT chk_tickets_prioritas
    CHECK (prioritas IN ('Urgent (4h)', 'High (1day)', 'Medium (3d)', 'Low (7d)')),
  CONSTRAINT chk_tickets_status
    CHECK (status_tiket IN ('Open', 'In Progress', 'Pending', 'Resolved', 'Closed', 'Cancelled')),
  CONSTRAINT chk_tickets_soft_delete_metadata CHECK (
    (deleted_at IS NULL AND deleted_by_user_id IS NULL AND deletion_reason IS NULL)
    OR (deleted_at IS NOT NULL AND BTRIM(COALESCE(deletion_reason, '')) <> '')
  ),
  CONSTRAINT fk_tickets_queue
    FOREIGN KEY (queue_id)
    REFERENCES ticket_queues (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_tickets_reporter
    FOREIGN KEY (pelapor_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_tickets_assignee
    FOREIGN KEY (assigned_to_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_tickets_resolver
    FOREIGN KEY (resolved_by_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_tickets_deleted_by
    FOREIGN KEY (deleted_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT
);

CREATE TABLE user_ticket_queues (
  user_id           BIGINT NOT NULL,
  queue_id          BIGINT NOT NULL,
  is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
  dibuat_pada       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_user_ticket_queues PRIMARY KEY (user_id, queue_id),
  CONSTRAINT fk_user_ticket_queues_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_user_ticket_queues_queue
    FOREIGN KEY (queue_id)
    REFERENCES ticket_queues (id)
    ON DELETE CASCADE
);

CREATE TABLE log_riwayat_tiket (
  id                BIGINT GENERATED ALWAYS AS IDENTITY,
  id_tiket          BIGINT,
  nomor_tiket       VARCHAR(50),
  aksi              VARCHAR(50) NOT NULL,
  perubahan         TEXT NOT NULL,
  oleh_pengguna     VARCHAR(150) NOT NULL,
  dibuat_pada       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_log_riwayat_tiket PRIMARY KEY (id),
  CONSTRAINT fk_log_riwayat_tiket_ticket
    FOREIGN KEY (id_tiket)
    REFERENCES tickets (id)
    ON DELETE SET NULL
);

CREATE TABLE komentar_tiket (
  id                BIGINT GENERATED ALWAYS AS IDENTITY,
  id_tiket          BIGINT NOT NULL,
  nama_pengguna     VARCHAR(150) NOT NULL,
  role_pengguna     VARCHAR(50) NOT NULL,
  pesan             TEXT NOT NULL,
  attachment        TEXT,
  dibuat_pada       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_komentar_tiket PRIMARY KEY (id),
  CONSTRAINT chk_komentar_tiket_role
    CHECK (LOWER(BTRIM(role_pengguna)) IN ('user', 'admin', 'superadmin')),
  CONSTRAINT fk_komentar_tiket_ticket
    FOREIGN KEY (id_tiket)
    REFERENCES tickets (id)
    ON DELETE CASCADE
);

CREATE TABLE ticket_casp_ratings (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY,
  ticket_id                 BIGINT NOT NULL,
  reporter_user_id          BIGINT,
  assignee_user_id          BIGINT,
  reporter_name_snapshot    VARCHAR(150) NOT NULL,
  assignee_name_snapshot    VARCHAR(150) NOT NULL,
  rating                    SMALLINT NOT NULL,
  feedback                  TEXT,
  submitted_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_ticket_casp_ratings PRIMARY KEY (id),
  CONSTRAINT uq_ticket_casp_ratings_ticket UNIQUE (ticket_id),
  CONSTRAINT chk_ticket_casp_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_ticket_casp_different_actor
    CHECK (
      reporter_user_id IS NULL
      OR assignee_user_id IS NULL
      OR reporter_user_id <> assignee_user_id
    ),
  CONSTRAINT fk_ticket_casp_ticket
    FOREIGN KEY (ticket_id)
    REFERENCES tickets (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ticket_casp_reporter
    FOREIGN KEY (reporter_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_ticket_casp_assignee
    FOREIGN KEY (assignee_user_id)
    REFERENCES users (id)
    ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_karyawan_email_normalized
  ON karyawan (LOWER(BTRIM(email_kantor)))
  WHERE email_kantor IS NOT NULL AND BTRIM(email_kantor) <> '';

CREATE INDEX idx_aset_ti_karyawan
  ON aset_ti (id_karyawan);

CREATE INDEX idx_log_riwayat_aset_asset_created
  ON log_riwayat_aset (id_aset, dibuat_pada DESC);

CREATE INDEX idx_log_audit_login_created
  ON log_audit_login (dibuat_pada DESC);

CREATE INDEX idx_riwayat_pemakaian_nik_started
  ON riwayat_pemakaian_aset (nik, tanggal_mulai DESC);

CREATE INDEX idx_riwayat_pemakaian_asset_started
  ON riwayat_pemakaian_aset (id_aset, tanggal_mulai DESC);

CREATE UNIQUE INDEX uq_riwayat_pemakaian_active_asset
  ON riwayat_pemakaian_aset (id_aset)
  WHERE id_aset IS NOT NULL AND tanggal_selesai IS NULL;

CREATE UNIQUE INDEX uq_users_email_normalized
  ON users (LOWER(BTRIM(email)));

CREATE INDEX idx_users_active_role
  ON users (role, id)
  WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE INDEX idx_users_deleted_at
  ON users (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX idx_aset_ti_active_listing
  ON aset_ti (status_aset, id_aset)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_aset_ti_deleted_at
  ON aset_ti (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX idx_tickets_queue_status_created
  ON tickets (queue_id, status_tiket, dibuat_pada DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_tickets_assigned_status
  ON tickets (assigned_to_user_id, status_tiket)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_tickets_reporter_created
  ON tickets (pelapor_user_id, dibuat_pada DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_tickets_resolved_at
  ON tickets (resolved_at DESC)
  WHERE deleted_at IS NULL AND status_tiket IN ('Resolved', 'Closed');

CREATE INDEX idx_tickets_deleted_at
  ON tickets (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX idx_user_ticket_queues_queue_user
  ON user_ticket_queues (queue_id, user_id);

CREATE UNIQUE INDEX uq_user_ticket_queues_primary_user
  ON user_ticket_queues (user_id)
  WHERE is_primary = TRUE;

CREATE INDEX idx_log_riwayat_tiket_ticket_id
  ON log_riwayat_tiket (id_tiket, id DESC);

CREATE INDEX idx_komentar_tiket_ticket_id
  ON komentar_tiket (id_tiket, id ASC);

CREATE INDEX idx_ticket_casp_assignee_submitted
  ON ticket_casp_ratings (assignee_user_id, submitted_at DESC);

CREATE INDEX idx_ticket_casp_reporter_submitted
  ON ticket_casp_ratings (reporter_user_id, submitted_at DESC);

CREATE OR REPLACE FUNCTION app_reject_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete is prohibited for %. Use the audited soft-delete path.', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER trg_users_prevent_hard_delete
BEFORE DELETE ON users
FOR EACH ROW EXECUTE FUNCTION app_reject_hard_delete();

CREATE TRIGGER trg_aset_ti_prevent_hard_delete
BEFORE DELETE ON aset_ti
FOR EACH ROW EXECUTE FUNCTION app_reject_hard_delete();

CREATE TRIGGER trg_tickets_prevent_hard_delete
BEFORE DELETE ON tickets
FOR EACH ROW EXECUTE FUNCTION app_reject_hard_delete();

CREATE OR REPLACE VIEW daftar_aset_ti_lengkap AS
SELECT
  a.id_aset,
  a.nomor_seri,
  a.label_aset,
  a.spesifikasi,
  k.nik,
  k.nama_karyawan,
  k.departemen,
  a.lokasi_aset AS lokasi_kerja,
  a.tipe_perangkat,
  a.merek,
  a.model,
  a.status_aset,
  a.kondisi_aset,
  a.catatan_aset,
  a.lokasi_aset
FROM aset_ti AS a
LEFT JOIN karyawan AS k
  ON k.id_karyawan = a.id_karyawan
WHERE a.deleted_at IS NULL;

INSERT INTO ticket_queues (kode, nama, deskripsi)
VALUES
  ('GA', 'General Affairs', 'Tiket terkait fasilitas dan kebutuhan umum'),
  ('HR', 'Human Resources', 'Tiket terkait sumber daya manusia'),
  ('IT', 'Information Technology', 'Tiket terkait teknologi informasi'),
  ('OPS', 'Operations', 'Tiket terkait aktivitas operasional');
