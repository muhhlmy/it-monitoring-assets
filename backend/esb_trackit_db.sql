-- =====================================================================
-- SKEMA DATABASE (PostgreSQL): ESB TRACKIT / IT MONITORING ASSETS (CANONICAL)
-- =====================================================================

-- Hapus View & Tabel (urutan reverse dependency)
DROP VIEW IF EXISTS daftar_aset_ti_lengkap CASCADE;
DROP TABLE IF EXISTS aset_ti CASCADE;
DROP VIEW IF EXISTS aset_ti CASCADE;

DROP TABLE IF EXISTS ticket_casp_ratings CASCADE;
DROP TABLE IF EXISTS log_riwayat_tiket CASCADE;
DROP TABLE IF EXISTS komentar_tiket CASCADE;
DROP TABLE IF EXISTS user_ticket_queues CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS ticket_queues CASCADE;
DROP TABLE IF EXISTS riwayat_pemakaian_aset CASCADE;
DROP TABLE IF EXISTS log_riwayat_aset CASCADE;
DROP TABLE IF EXISTS log_audit_login CASCADE;
DROP TABLE IF EXISTS aset_ti CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS karyawan CASCADE;
DROP TABLE IF EXISTS asset CASCADE;
DROP TABLE IF EXISTS app_schema_migrations CASCADE;

-- 1. app_schema_migrations (Migration Ledger)
CREATE TABLE app_schema_migrations (
    version           INTEGER PRIMARY KEY,
    name              VARCHAR(160) NOT NULL UNIQUE,
    checksum_sha256   CHAR(64) NOT NULL,
    applied_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_by        VARCHAR(150) NOT NULL,
    recovery_proof_id VARCHAR(160) NOT NULL,
    change_id         VARCHAR(160),
    execution_ms      INTEGER NOT NULL CHECK (execution_ms >= 0)
);

INSERT INTO app_schema_migrations (version, name, checksum_sha256, applied_by, recovery_proof_id, change_id, execution_ms)
VALUES (1, '0001_canonical_schema.sql', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'system', 'canonical-init', 'initial-schema', 0);

-- 2. karyawan
CREATE TABLE karyawan (
    id_karyawan                 BIGSERIAL,
    nik                         VARCHAR(20)     NOT NULL,
    nama_karyawan               VARCHAR(150)    NOT NULL,
    email_kantor                VARCHAR(150),
    lokasi_kerja                VARCHAR(100),
    status_karyawan             VARCHAR(30),
    jabatan                     VARCHAR(150),
    folder_karyawan             VARCHAR(255),
    tingkat_jabatan             VARCHAR(50),
    departemen                  VARCHAR(100),
    direktorat                  VARCHAR(100),
    tanggal_mulai_bekerja       DATE,
    jenis_perjanjian_kerja      VARCHAR(50),
    status_kepegawaian          VARCHAR(50),
    id_atasan_langsung          BIGINT,
    dibuat_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_karyawan PRIMARY KEY (id_karyawan),
    CONSTRAINT uq_karyawan_nik UNIQUE (nik),
    CONSTRAINT fk_karyawan_atasan FOREIGN KEY (id_atasan_langsung) REFERENCES karyawan (id_karyawan) ON DELETE SET NULL
);

-- 3. users
CREATE TABLE users (
    id                          BIGSERIAL,
    nama                        VARCHAR(150)    NOT NULL,
    email                       VARCHAR(150)    NOT NULL,
    password                    VARCHAR(255)    NOT NULL,
    role                        VARCHAR(50)     NOT NULL DEFAULT 'user',
    permissions                 JSONB           NOT NULL DEFAULT '{}'::jsonb,
    is_active                   BOOLEAN         NOT NULL DEFAULT TRUE,
    deleted_at                  TIMESTAMP,
    deleted_by_user_id          BIGINT,
    deletion_reason             TEXT,
    dibuat_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_users_role CHECK (LOWER(BTRIM(role)) IN ('user', 'admin', 'superadmin', 'super admin')),
    CONSTRAINT chk_users_permissions_object CHECK (jsonb_typeof(permissions) = 'object'),
    CONSTRAINT chk_users_soft_delete_metadata CHECK ((deleted_at IS NULL AND deleted_by_user_id IS NULL AND deletion_reason IS NULL) OR (deleted_at IS NOT NULL AND is_active = FALSE AND BTRIM(COALESCE(deletion_reason, '')) <> '')),
    CONSTRAINT fk_users_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
);

-- Seed Default Superadmin (Password: admin123)
INSERT INTO users (nama, email, password, role, permissions, is_active)
VALUES (
  'Super Admin',
  'superadmin@admin.com',
  '$2b$10$4qCKXNwFhrWZaPeErQOjNenTxUdV7t99RkI7lI3qkd0zlBL7fJtPm',
  'superadmin',
  '{"dashboard": "full", "assets": "full", "my_assets": "full", "tickets": "full", "submissions": "full", "users": "full", "logs": "full", "karyawan": "full", "export": "full"}'::jsonb,
  true
);

-- 4. aset_ti
CREATE TABLE aset_ti (
    id_aset                     BIGSERIAL,
    hostname                    VARCHAR(50),
    nomor_seri                  VARCHAR(50),
    label_aset                  VARCHAR(150)    NOT NULL,
    spesifikasi                 TEXT,
    id_karyawan                 BIGINT,
    lokasi_aset                 VARCHAR(100),
    tipe_perangkat              VARCHAR(50),
    merek                       VARCHAR(50),
    model                       VARCHAR(100),
    status_aset                 VARCHAR(30),
    kondisi_aset                VARCHAR(30),
    catatan_aset                TEXT,
    deleted_at                  TIMESTAMP,
    deleted_by_user_id          BIGINT,
    deletion_reason             TEXT,
    dibuat_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_aset_ti PRIMARY KEY (id_aset),
    CONSTRAINT uq_aset_ti_label UNIQUE (label_aset),
    CONSTRAINT uq_aset_ti_nomor_seri UNIQUE (nomor_seri),
    CONSTRAINT fk_aset_ti_karyawan FOREIGN KEY (id_karyawan) REFERENCES karyawan (id_karyawan) ON DELETE SET NULL,
    CONSTRAINT fk_aset_ti_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT chk_aset_ti_soft_delete_metadata CHECK ((deleted_at IS NULL AND deleted_by_user_id IS NULL AND deletion_reason IS NULL) OR (deleted_at IS NOT NULL AND BTRIM(COALESCE(deletion_reason, '')) <> ''))
);

-- 5. daftar_aset_ti_lengkap (VIEW)
CREATE OR REPLACE VIEW daftar_aset_ti_lengkap AS
SELECT
    a.id_aset,
    a.hostname,
    a.nomor_seri,
    a.label_aset,
    a.spesifikasi,
    k.nik,
    k.nama_karyawan,
    k.departemen,
    k.lokasi_kerja,
    a.tipe_perangkat,
    a.merek,
    a.model,
    a.status_aset,
    a.kondisi_aset,
    a.catatan_aset,
    a.lokasi_aset
FROM aset_ti a
LEFT JOIN karyawan k ON a.id_karyawan = k.id_karyawan;

-- 6. log_audit_login
CREATE TABLE log_audit_login (
    id                          BIGSERIAL,
    nama_pengguna               VARCHAR(150)    NOT NULL,
    email                       VARCHAR(150)    NOT NULL,
    aktifitas                   VARCHAR(100)    NOT NULL,
    ip_address                  VARCHAR(50),
    browser                     VARCHAR(255),
    dibuat_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_log_audit_login PRIMARY KEY (id)
);

-- 7. log_riwayat_aset
CREATE TABLE log_riwayat_aset (
    id                          BIGSERIAL,
    id_aset                     BIGINT,
    label_aset                  VARCHAR(150)    NOT NULL,
    aksi                        VARCHAR(50)     NOT NULL,
    perubahan                   TEXT            NOT NULL,
    oleh_pengguna               VARCHAR(150)    NOT NULL,
    dibuat_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_log_riwayat_aset PRIMARY KEY (id)
);

-- 8. riwayat_pemakaian_aset
CREATE TABLE riwayat_pemakaian_aset (
    id                          BIGSERIAL,
    id_aset                     BIGINT,
    label_aset                  VARCHAR(150)    NOT NULL,
    nomor_seri                  VARCHAR(50),
    tipe_perangkat              VARCHAR(50),
    merek                       VARCHAR(50),
    model                       VARCHAR(100),
    id_karyawan                 BIGINT,
    nik                         VARCHAR(20)     NOT NULL,
    nama_karyawan               VARCHAR(150)    NOT NULL,
    tanggal_mulai               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tanggal_selesai             TIMESTAMP,
    catatan                     TEXT,
    dibuat_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_riwayat_pemakaian_aset PRIMARY KEY (id),
    CONSTRAINT fk_riwayat_pemakaian_aset_aset FOREIGN KEY (id_aset) REFERENCES aset_ti (id_aset) ON DELETE SET NULL,
    CONSTRAINT fk_riwayat_pemakaian_aset_karyawan FOREIGN KEY (id_karyawan) REFERENCES karyawan (id_karyawan) ON DELETE SET NULL,
    CONSTRAINT chk_riwayat_pemakaian_range CHECK (tanggal_selesai IS NULL OR tanggal_selesai >= tanggal_mulai)
);

-- 9. ticket_queues
CREATE TABLE ticket_queues (
    id                          BIGSERIAL,
    kode                        VARCHAR(20)     NOT NULL,
    nama                        VARCHAR(100)    NOT NULL,
    deskripsi                   TEXT,
    is_active                   BOOLEAN         NOT NULL DEFAULT TRUE,
    dibuat_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_ticket_queues PRIMARY KEY (id),
    CONSTRAINT uq_ticket_queues_kode UNIQUE (kode)
);

-- Default Queues (HR, IT, GA)
INSERT INTO ticket_queues (kode, nama, deskripsi)
VALUES 
  ('HR', 'Human Resources', 'Antrean Layanan HR / SDM'),
  ('IT', 'IT Support', 'Antrean Layanan IT / Support'),
  ('GA', 'General Affairs', 'Antrean Layanan General Affairs')
ON CONFLICT (kode) DO NOTHING;

-- 10. user_ticket_queues
CREATE TABLE user_ticket_queues (
    user_id                     BIGINT          NOT NULL,
    queue_id                    BIGINT          NOT NULL,
    is_primary                  BOOLEAN         NOT NULL DEFAULT FALSE,
    dibuat_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_user_ticket_queues PRIMARY KEY (user_id, queue_id),
    CONSTRAINT fk_user_ticket_queues_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_ticket_queues_queue FOREIGN KEY (queue_id) REFERENCES ticket_queues (id) ON DELETE CASCADE
);

-- Map Super Admin to all default queues
INSERT INTO user_ticket_queues (user_id, queue_id, is_primary)
SELECT u.id, q.id, (q.kode = 'IT')
FROM users u
CROSS JOIN ticket_queues q
WHERE u.email = 'superadmin@admin.com'
ON CONFLICT DO NOTHING;

-- 11. tickets
CREATE TABLE tickets (
    id                          BIGSERIAL,
    nomor_tiket                 VARCHAR(50)     NOT NULL,
    judul                       VARCHAR(200)    NOT NULL,
    deskripsi                   TEXT,
    kategori                    VARCHAR(50)     NOT NULL,
    prioritas                   VARCHAR(30)     NOT NULL DEFAULT 'Medium (3d)',
    status_tiket                VARCHAR(30)     NOT NULL DEFAULT 'Open',
    assigned_to                 VARCHAR(150),
    pelapor                     VARCHAR(150),
    attachment                  TEXT,
    queue_id                    BIGINT          NOT NULL,
    pelapor_user_id             BIGINT,
    assigned_to_user_id         BIGINT,
    resolved_at                 TIMESTAMP,
    resolved_by_user_id         BIGINT,
    deleted_at                  TIMESTAMP,
    deleted_by_user_id          BIGINT,
    deletion_reason             TEXT,
    dibuat_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_tickets PRIMARY KEY (id),
    CONSTRAINT uq_tickets_nomor UNIQUE (nomor_tiket),
    CONSTRAINT fk_tickets_queue FOREIGN KEY (queue_id) REFERENCES ticket_queues (id) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_reporter FOREIGN KEY (pelapor_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_assignee FOREIGN KEY (assigned_to_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_resolver FOREIGN KEY (resolved_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT chk_tickets_prioritas CHECK (prioritas IN ('Urgent (4h)', 'High (1day)', 'Medium (3d)', 'Low (7d)')),
    CONSTRAINT chk_tickets_status CHECK (status_tiket IN ('Open', 'In Progress', 'Pending', 'Resolved', 'Closed', 'Cancelled')),
    CONSTRAINT chk_tickets_soft_delete_metadata CHECK ((deleted_at IS NULL AND deleted_by_user_id IS NULL AND deletion_reason IS NULL) OR (deleted_at IS NOT NULL AND BTRIM(COALESCE(deletion_reason, '')) <> ''))
);

-- 12. komentar_tiket
CREATE TABLE komentar_tiket (
    id                          BIGSERIAL,
    id_tiket                    BIGINT          NOT NULL,
    nama_pengguna               VARCHAR(150)    NOT NULL,
    role_pengguna               VARCHAR(50)     NOT NULL,
    pesan                       TEXT            NOT NULL,
    attachment                  TEXT,
    dibuat_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_komentar_tiket PRIMARY KEY (id),
    CONSTRAINT fk_komentar_tiket_ticket FOREIGN KEY (id_tiket) REFERENCES tickets (id) ON DELETE CASCADE,
    CONSTRAINT chk_komentar_tiket_role CHECK (LOWER(BTRIM(role_pengguna)) IN ('user', 'admin', 'superadmin'))
);

-- 13. log_riwayat_tiket
CREATE TABLE log_riwayat_tiket (
    id                          BIGSERIAL,
    id_tiket                    BIGINT,
    nomor_tiket                 VARCHAR(50),
    aksi                        VARCHAR(50)     NOT NULL,
    perubahan                   TEXT            NOT NULL,
    oleh_pengguna               VARCHAR(150)    NOT NULL,
    dibuat_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_log_riwayat_tiket PRIMARY KEY (id),
    CONSTRAINT fk_log_riwayat_tiket_ticket FOREIGN KEY (id_tiket) REFERENCES tickets (id) ON DELETE SET NULL
);

-- 14. ticket_casp_ratings
CREATE TABLE ticket_casp_ratings (
    id                          BIGSERIAL,
    ticket_id                   BIGINT          NOT NULL,
    reporter_user_id            BIGINT,
    assignee_user_id            BIGINT,
    reporter_name_snapshot      VARCHAR(150)    NOT NULL,
    assignee_name_snapshot      VARCHAR(150)    NOT NULL,
    rating                      SMALLINT        NOT NULL,
    feedback                    TEXT,
    submitted_at                    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_ticket_casp_ratings PRIMARY KEY (id),
    CONSTRAINT uq_ticket_casp_ratings_ticket UNIQUE (ticket_id),
    CONSTRAINT fk_ticket_casp_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_casp_reporter FOREIGN KEY (reporter_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_ticket_casp_assignee FOREIGN KEY (assignee_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT chk_ticket_casp_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT chk_ticket_casp_different_actor CHECK (reporter_user_id IS NULL OR assignee_user_id IS NULL OR reporter_user_id <> assignee_user_id)
);

-- INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS uq_karyawan_email_normalized ON karyawan (LOWER(BTRIM(email_kantor))) WHERE email_kantor IS NOT NULL AND BTRIM(email_kantor) <> '';
CREATE INDEX IF NOT EXISTS idx_aset_ti_karyawan ON aset_ti (id_karyawan);
CREATE INDEX IF NOT EXISTS idx_log_riwayat_aset_asset_created ON log_riwayat_aset (id_aset, dibuat_pada DESC);
CREATE INDEX IF NOT EXISTS idx_log_audit_login_created ON log_audit_login (dibuat_pada DESC);
CREATE INDEX IF NOT EXISTS idx_riwayat_pemakaian_nik_started ON riwayat_pemakaian_aset (nik, tanggal_mulai DESC);
CREATE INDEX IF NOT EXISTS idx_riwayat_pemakaian_asset_started ON riwayat_pemakaian_aset (id_aset, tanggal_mulai DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_riwayat_pemakaian_active_asset ON riwayat_pemakaian_aset (id_aset) WHERE id_aset IS NOT NULL AND tanggal_selesai IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_normalized ON users (LOWER(BTRIM(email)));
CREATE INDEX IF NOT EXISTS idx_users_active_role ON users (role, id) WHERE is_active = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at DESC) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aset_ti_active_listing ON aset_ti (status_aset, id_aset) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_aset_ti_deleted_at ON aset_ti (deleted_at DESC) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_queue_status_created ON tickets (queue_id, status_tiket, dibuat_pada DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status ON tickets (assigned_to_user_id, status_tiket) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_reporter_created ON tickets (pelapor_user_id, dibuat_pada DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_resolved_at ON tickets (resolved_at DESC) WHERE deleted_at IS NULL AND status_tiket IN ('Resolved', 'Closed');
CREATE INDEX IF NOT EXISTS idx_tickets_deleted_at ON tickets (deleted_at DESC) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_ticket_queues_queue_user ON user_ticket_queues (queue_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_ticket_queues_primary_user ON user_ticket_queues (user_id) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_log_riwayat_tiket_ticket_id ON log_riwayat_tiket (id_tiket, id DESC);
CREATE INDEX IF NOT EXISTS idx_komentar_tiket_ticket_id ON komentar_tiket (id_tiket, id ASC);
CREATE INDEX IF NOT EXISTS idx_ticket_casp_assignee_submitted ON ticket_casp_ratings (assignee_user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_casp_reporter_submitted ON ticket_casp_ratings (reporter_user_id, submitted_at DESC);

-- HARD DELETE PROTECTION TRIGGERS
CREATE OR REPLACE FUNCTION app_reject_hard_delete() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete is prohibited for %. Use the audited soft-delete path.', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_aset_ti_prevent_hard_delete ON aset_ti;
CREATE TRIGGER trg_aset_ti_prevent_hard_delete BEFORE DELETE ON aset_ti FOR EACH ROW EXECUTE FUNCTION app_reject_hard_delete();

DROP TRIGGER IF EXISTS trg_tickets_prevent_hard_delete ON tickets;
CREATE TRIGGER trg_tickets_prevent_hard_delete BEFORE DELETE ON tickets FOR EACH ROW EXECUTE FUNCTION app_reject_hard_delete();

DROP TRIGGER IF EXISTS trg_users_prevent_hard_delete ON users;
CREATE TRIGGER trg_users_prevent_hard_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION app_reject_hard_delete();