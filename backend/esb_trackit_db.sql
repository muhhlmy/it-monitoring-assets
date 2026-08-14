-- =====================================================================
-- SKEMA DATABASE (PostgreSQL): ESB TRACKIT / IT MONITORING ASSETS
-- Berdasarkan struktur dasar:
--   - Tabel Karyawan (karyawan)
--   - Tabel Asset (asset)
--   - Tabel & View Pendukung Sistem (Users, Helpdesk Tickets, Logs, Ratings)
-- =====================================================================

-- =====================================================================
-- BUAT DATABASE (jika belum ada)
-- =====================================================================
SELECT 'CREATE DATABASE esb_trackit_db'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'esb_trackit_db'
)\gexec

\c esb_trackit_db

-- =====================================================================
-- HAPUS VIEW & TABEL SEBELUMNYA (URUTAN DEPENDENSI REVERSE)
-- =====================================================================
DROP VIEW IF EXISTS daftar_aset_ti_lengkap;
DROP VIEW IF EXISTS aset_ti;

DROP TABLE IF EXISTS ticket_casp_ratings CASCADE;
DROP TABLE IF EXISTS log_riwayat_tiket CASCADE;
DROP TABLE IF EXISTS komentar_tiket CASCADE;
DROP TABLE IF EXISTS user_ticket_queues CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS ticket_queues CASCADE;
DROP TABLE IF EXISTS riwayat_pemakaian_aset CASCADE;
DROP TABLE IF EXISTS log_riwayat_aset CASCADE;
DROP TABLE IF EXISTS log_audit_login CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS asset CASCADE;
DROP TABLE IF EXISTS karyawan CASCADE;
DROP TABLE IF EXISTS app_schema_migrations CASCADE;

-- =====================================================================
-- TABEL 1: karyawan (Master Data Karyawan)
-- =====================================================================
CREATE TABLE karyawan (
    id                          SERIAL          PRIMARY KEY,
    nik                         VARCHAR(20)     NOT NULL,
    nama_karyawan               VARCHAR(150)    NOT NULL,
    status                      VARCHAR(20)     NOT NULL,
    title                       VARCHAR(150)    NOT NULL,
    job_level                   VARCHAR(10)     NOT NULL,
    departemen                  VARCHAR(100)    NOT NULL,
    directorate                 VARCHAR(100)    NOT NULL,
    tanggal_mulai_bekerja       DATE            NOT NULL,
    employeement_status         VARCHAR(20)     NOT NULL,
    nik_atasan_langsung         VARCHAR(20),
    email_kantor                VARCHAR(150)    NOT NULL,
    lokasi_kerja                VARCHAR(100),

    CONSTRAINT uq_karyawan_nik UNIQUE (nik),
    CONSTRAINT uq_karyawan_email UNIQUE (email_kantor),

    -- Constraint: Status karyawan
    CONSTRAINT chk_karyawan_status
        CHECK (status IN ('Active', 'Outsource', 'Resigned')),

    -- Constraint: Employeement Status
    CONSTRAINT chk_karyawan_employeement_status
        CHECK (employeement_status IN ('Permanent', 'Contract')),

    -- Self reference: NIK Atasan Langsung merujuk ke NIK karyawan lain
    CONSTRAINT fk_karyawan_atasan
        FOREIGN KEY (nik_atasan_langsung) REFERENCES karyawan (nik) ON DELETE SET NULL
);

-- =====================================================================
-- TABEL 2: asset (Master Data Aset IT)
-- =====================================================================
CREATE TABLE asset (
    id                              SERIAL          PRIMARY KEY,
    hostname                        VARCHAR(50)     NOT NULL,
    serial_number                   VARCHAR(50)     NOT NULL,
    spesifikasi                     VARCHAR(255),
    nik_pemegang_asset               VARCHAR(20),
    nama_karyawan_pemegang_asset     VARCHAR(150),
    departemen_pemegang_asset        VARCHAR(100),
    lokasi_asset                    VARCHAR(100),
    tipe_perangkat                  VARCHAR(50),
    brand_merek                     VARCHAR(50),
    model                           VARCHAR(100),
    status                          VARCHAR(20)     NOT NULL,
    kondisi                         VARCHAR(20)     NOT NULL,
    note_asset                      VARCHAR(255),

    CONSTRAINT uq_asset_hostname UNIQUE (hostname),
    CONSTRAINT uq_asset_serial_number UNIQUE (serial_number),

    -- Constraint: Status & Kondisi Asset
    CONSTRAINT chk_asset_status
        CHECK (status IN ('In Use', 'Stock', 'Damaged', 'In Service', 'Disposal')),

    CONSTRAINT chk_asset_kondisi
        CHECK (kondisi IN ('Baru', 'Normal', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Berat')),

    -- Relasi ke tabel karyawan (pemegang asset)
    CONSTRAINT fk_asset_pemegang
        FOREIGN KEY (nik_pemegang_asset) REFERENCES karyawan (nik) ON DELETE SET NULL
);

-- =====================================================================
-- TABEL 3: users (Akun Pengguna Sistem & Hak Akses)
-- =====================================================================
CREATE TABLE users (
    id                              BIGSERIAL       PRIMARY KEY,
    nama                            VARCHAR(150)    NOT NULL,
    email                           VARCHAR(150)    NOT NULL,
    password                        VARCHAR(255)    NOT NULL,
    role                            VARCHAR(50)     NOT NULL DEFAULT 'user',
    permissions                     JSONB           NOT NULL DEFAULT '{}'::jsonb,
    is_active                       BOOLEAN         NOT NULL DEFAULT TRUE,
    nik_karyawan                    VARCHAR(20),
    deleted_at                      TIMESTAMP,
    deleted_by_user_id              BIGINT,
    deletion_reason                 TEXT,
    dibuat_pada                     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT fk_users_karyawan FOREIGN KEY (nik_karyawan) REFERENCES karyawan (nik) ON DELETE SET NULL,
    CONSTRAINT fk_users_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
);

-- =====================================================================
-- TABEL 4: log_audit_login (Security Log Login Pengguna)
-- =====================================================================
CREATE TABLE log_audit_login (
    id                              BIGSERIAL       PRIMARY KEY,
    nama_pengguna                   VARCHAR(150)    NOT NULL,
    email                           VARCHAR(150)    NOT NULL,
    aktifitas                       VARCHAR(100)    NOT NULL,
    ip_address                      VARCHAR(50),
    browser                         VARCHAR(255),
    dibuat_pada                     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- TABEL 5: riwayat_pemakaian_aset (Histori Pemakaian Aset oleh Karyawan)
-- =====================================================================
CREATE TABLE riwayat_pemakaian_aset (
    id                              BIGSERIAL       PRIMARY KEY,
    asset_id                        INT,
    hostname                        VARCHAR(50),
    serial_number                   VARCHAR(50),
    tipe_perangkat                  VARCHAR(50),
    brand_merek                     VARCHAR(50),
    model                           VARCHAR(100),
    nik                             VARCHAR(20)     NOT NULL,
    nama_karyawan                   VARCHAR(150)    NOT NULL,
    tanggal_mulai                   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tanggal_selesai                 TIMESTAMP,
    catatan                         TEXT,
    dibuat_pada                     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_riwayat_asset FOREIGN KEY (asset_id) REFERENCES asset (id) ON DELETE SET NULL,
    CONSTRAINT fk_riwayat_karyawan FOREIGN KEY (nik) REFERENCES karyawan (nik) ON DELETE RESTRICT,
    CONSTRAINT chk_riwayat_pemakaian_range CHECK (tanggal_selesai IS NULL OR tanggal_selesai >= tanggal_mulai)
);

-- =====================================================================
-- TABEL 6: log_riwayat_aset (Audit Trail Perubahan Data Aset)
-- =====================================================================
CREATE TABLE log_riwayat_aset (
    id                              BIGSERIAL       PRIMARY KEY,
    asset_id                        INT,
    hostname                        VARCHAR(50)     NOT NULL,
    aksi                            VARCHAR(50)     NOT NULL,
    perubahan                       TEXT            NOT NULL,
    oleh_pengguna                   VARCHAR(150)    NOT NULL,
    dibuat_pada                     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_log_riwayat_asset FOREIGN KEY (asset_id) REFERENCES asset (id) ON DELETE SET NULL
);

-- =====================================================================
-- TABEL 7: ticket_queues (Master Antrean Tiket Helpdesk IT)
-- =====================================================================
CREATE TABLE ticket_queues (
    id                              BIGSERIAL       PRIMARY KEY,
    kode                            VARCHAR(20)     NOT NULL,
    nama                            VARCHAR(100)    NOT NULL,
    deskripsi                       TEXT,
    is_active                       BOOLEAN         NOT NULL DEFAULT TRUE,
    dibuat_pada                     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_ticket_queues_kode UNIQUE (kode)
);

-- =====================================================================
-- TABEL 8: user_ticket_queues (Penugasan Antrean ke Teknisi/User IT)
-- =====================================================================
CREATE TABLE user_ticket_queues (
    user_id                         BIGINT          NOT NULL,
    queue_id                        BIGINT          NOT NULL,
    is_primary                      BOOLEAN         NOT NULL DEFAULT FALSE,
    dibuat_pada                     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, queue_id),
    CONSTRAINT fk_user_ticket_queues_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_ticket_queues_queue FOREIGN KEY (queue_id) REFERENCES ticket_queues (id) ON DELETE CASCADE
);

-- =====================================================================
-- TABEL 9: tickets (Data Tiket Pengaduan Helpdesk IT)
-- =====================================================================
CREATE TABLE tickets (
    id                              BIGSERIAL       PRIMARY KEY,
    nomor_tiket                     VARCHAR(50)     NOT NULL,
    judul                           VARCHAR(200)    NOT NULL,
    deskripsi                       TEXT,
    kategori                        VARCHAR(50)     NOT NULL,
    prioritas                       VARCHAR(30)     NOT NULL DEFAULT 'Medium (3d)',
    status_tiket                    VARCHAR(30)     NOT NULL DEFAULT 'Open',
    assigned_to                     VARCHAR(150),
    pelapor                         VARCHAR(150),
    attachment                      TEXT,
    queue_id                        BIGINT          NOT NULL,
    pelapor_user_id                 BIGINT,
    assigned_to_user_id             BIGINT,
    resolved_at                     TIMESTAMP,
    resolved_by_user_id             BIGINT,
    deleted_at                      TIMESTAMP,
    deleted_by_user_id              BIGINT,
    deletion_reason                 TEXT,
    dibuat_pada                     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    diperbarui_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_tickets_nomor UNIQUE (nomor_tiket),
    CONSTRAINT fk_tickets_queue FOREIGN KEY (queue_id) REFERENCES ticket_queues (id) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_reporter FOREIGN KEY (pelapor_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_assignee FOREIGN KEY (assigned_to_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_resolver FOREIGN KEY (resolved_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_deleted_by FOREIGN KEY (deleted_by_user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT chk_tickets_prioritas CHECK (prioritas IN ('Urgent (4h)', 'High (1day)', 'Medium (3d)', 'Low (7d)')),
    CONSTRAINT chk_tickets_status CHECK (status_tiket IN ('Open', 'In Progress', 'Pending', 'Resolved', 'Closed', 'Cancelled'))
);

-- =====================================================================
-- TABEL 10: komentar_tiket (Diskusi Percakapan & Attachment Tiket)
-- =====================================================================
CREATE TABLE komentar_tiket (
    id                              BIGSERIAL       PRIMARY KEY,
    id_tiket                        BIGINT          NOT NULL,
    nama_pengguna                   VARCHAR(150)    NOT NULL,
    role_pengguna                   VARCHAR(50)     NOT NULL,
    pesan                           TEXT            NOT NULL,
    attachment                      TEXT,
    dibuat_pada                     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_komentar_tiket_ticket FOREIGN KEY (id_tiket) REFERENCES tickets (id) ON DELETE CASCADE
);

-- =====================================================================
-- TABEL 11: log_riwayat_tiket (Audit Trail Perubahan Tiket)
-- =====================================================================
CREATE TABLE log_riwayat_tiket (
    id                              BIGSERIAL       PRIMARY KEY,
    id_tiket                        BIGINT,
    nomor_tiket                     VARCHAR(50),
    aksi                            VARCHAR(50)     NOT NULL,
    perubahan                       TEXT            NOT NULL,
    oleh_pengguna                   VARCHAR(150)    NOT NULL,
    dibuat_pada                     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_log_riwayat_tiket_ticket FOREIGN KEY (id_tiket) REFERENCES tickets (id) ON DELETE SET NULL
);

-- =====================================================================
-- TABEL 12: ticket_casp_ratings (Rating & Feedback Evaluasi Layanan Tiket)
-- =====================================================================
CREATE TABLE ticket_casp_ratings (
    id                              BIGSERIAL       PRIMARY KEY,
    ticket_id                       BIGINT          NOT NULL UNIQUE,
    reporter_user_id                BIGINT,
    assignee_user_id                BIGINT,
    reporter_name_snapshot          VARCHAR(150)    NOT NULL,
    assignee_name_snapshot          VARCHAR(150)    NOT NULL,
    rating                          SMALLINT        NOT NULL CHECK (rating BETWEEN 1 AND 5),
    feedback                        TEXT,
    submitted_at                    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ticket_casp_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_casp_reporter FOREIGN KEY (reporter_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_ticket_casp_assignee FOREIGN KEY (assignee_user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- =====================================================================
-- TABEL 13: app_schema_migrations (Ledger versi Skema Migrasi Database)
-- =====================================================================
CREATE TABLE app_schema_migrations (
    version                         INTEGER         PRIMARY KEY,
    name                            VARCHAR(160)    NOT NULL UNIQUE,
    checksum_sha256                 CHAR(64)        NOT NULL,
    applied_at                      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_by                      VARCHAR(150)    NOT NULL,
    recovery_proof_id               VARCHAR(160)    NOT NULL,
    change_id                       VARCHAR(160),
    execution_ms                    INTEGER         NOT NULL CHECK (execution_ms >= 0)
);

-- =====================================================================
-- VIEW PEMETAAN KOMPATIBILITAS (aset_ti & daftar_aset_ti_lengkap)
-- =====================================================================
CREATE OR REPLACE VIEW aset_ti AS
SELECT
    a.id AS id_aset,
    a.hostname,
    a.serial_number AS nomor_seri,
    a.hostname AS label_aset,
    a.spesifikasi,
    k.id AS id_karyawan,
    a.lokasi_asset AS lokasi_aset,
    a.tipe_perangkat,
    a.brand_merek AS merek,
    a.model,
    a.status AS status_aset,
    a.kondisi AS kondisi_aset,
    a.note_asset AS catatan_aset,
    NULL::TIMESTAMP AS deleted_at,
    NULL::BIGINT AS deleted_by_user_id,
    NULL::TEXT AS deletion_reason,
    CURRENT_TIMESTAMP AS dibuat_pada,
    CURRENT_TIMESTAMP AS diperbarui_pada
FROM asset a
LEFT JOIN karyawan k ON a.nik_pemegang_asset = k.nik;

CREATE OR REPLACE VIEW daftar_aset_ti_lengkap AS
SELECT
    a.id AS id_aset,
    a.hostname,
    a.serial_number AS nomor_seri,
    a.hostname AS label_aset,
    a.spesifikasi,
    k.nik,
    k.nama_karyawan,
    k.departemen,
    k.lokasi_kerja,
    a.tipe_perangkat,
    a.brand_merek AS merek,
    a.model,
    a.status AS status_aset,
    a.kondisi AS kondisi_aset,
    a.note_asset AS catatan_aset,
    a.lokasi_asset AS lokasi_aset
FROM asset a
LEFT JOIN karyawan k ON a.nik_pemegang_asset = k.nik;

-- =====================================================================
-- INDEX TAMBAHAN UNTUK PERFORMA QUERY
-- =====================================================================
CREATE INDEX idx_asset_status ON asset (status);
CREATE INDEX idx_asset_kondisi ON asset (kondisi);
CREATE INDEX idx_asset_nik_pemegang ON asset (nik_pemegang_asset);
CREATE INDEX idx_karyawan_nik_atasan ON karyawan (nik_atasan_langsung);
CREATE INDEX idx_tickets_assigned_status ON tickets (assigned_to_user_id, status_tiket);
CREATE INDEX idx_tickets_queue_status_created ON tickets (queue_id, status_tiket, dibuat_pada);
CREATE INDEX idx_log_audit_login_created ON log_audit_login (dibuat_pada);