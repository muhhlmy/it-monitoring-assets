-- =====================================================================
-- SKEMA DATABASE (PostgreSQL): ESB TRACKIT / IT MONITORING ASSETS
-- Simple Schema with CHECK Constraints & Data Validation
-- =====================================================================

-- Drop existing tables/views (reverse dependency order)
DROP VIEW IF EXISTS daftar_aset_ti_lengkap CASCADE;
DROP TABLE IF EXISTS log_audit_login CASCADE;
DROP TABLE IF EXISTS riwayat_pemakaian_aset CASCADE;
DROP TABLE IF EXISTS log_riwayat_tiket CASCADE;
DROP TABLE IF EXISTS user_ticket_queues CASCADE;
DROP TABLE IF EXISTS ticket_casp_ratings CASCADE;
DROP TABLE IF EXISTS komentar_tiket CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS ticket_queues CASCADE;
DROP TABLE IF EXISTS aset_ti CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS karyawan CASCADE;

-- =====================================================================
-- TABEL 1: Karyawan (Employee Master)
-- =====================================================================
CREATE TABLE karyawan (
    id                          SERIAL          PRIMARY KEY,
    nik                         VARCHAR(20)     NOT NULL UNIQUE,
    nama_karyawan               VARCHAR(150)    NOT NULL,
    status                      VARCHAR(20)     NOT NULL DEFAULT 'Active',
    title                       VARCHAR(150)    NOT NULL,
    job_level                   VARCHAR(10)     NOT NULL,
    departemen                  VARCHAR(100)    NOT NULL,
    directorate                 VARCHAR(100)    NOT NULL,
    tanggal_mulai_bekerja       DATE            NOT NULL,
    employeement_status         VARCHAR(20)     NOT NULL DEFAULT 'Permanent',
    nik_atasan_langsung         VARCHAR(20),
    email_kantor                VARCHAR(150)    NOT NULL UNIQUE,
    lokasi_kerja                VARCHAR(100),
    
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraint: Status karyawan
    CONSTRAINT chk_karyawan_status
        CHECK (status IN ('Active', 'Outsource', 'Resigned')),

    -- Constraint: Employeement Status
    CONSTRAINT chk_karyawan_employeement_status
        CHECK (employeement_status IN ('Permanent', 'Contract', 'Freelance', 'Intern')),

    -- Self reference: NIK Atasan Langsung merujuk ke NIK karyawan lain
    CONSTRAINT fk_karyawan_atasan
        FOREIGN KEY (nik_atasan_langsung) REFERENCES karyawan (nik) ON DELETE SET NULL
);

-- Index untuk performa
CREATE INDEX idx_karyawan_departemen ON karyawan(departemen);
CREATE INDEX idx_karyawan_email ON karyawan(email_kantor);
CREATE INDEX idx_karyawan_nik_atasan ON karyawan(nik_atasan_langsung);

-- =====================================================================
-- TABEL 2: Users (Application Authentication)
-- =====================================================================
CREATE TABLE users (
    id                          SERIAL          PRIMARY KEY,
    nama                        VARCHAR(150)    NOT NULL,
    email                       VARCHAR(150)    NOT NULL UNIQUE,
    password_hash               TEXT            NOT NULL,
    role                        VARCHAR(50)     NOT NULL DEFAULT 'user',
    permissions                 JSONB           NOT NULL DEFAULT '{}',
    is_active                   BOOLEAN         NOT NULL DEFAULT TRUE,
    deleted_at                  TIMESTAMP,
    deleted_by_id               INTEGER,
    deletion_reason             TEXT,
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_users_role 
        CHECK (role IN ('user', 'admin', 'superadmin', 'super admin')),

    CONSTRAINT fk_users_deleted_by 
        FOREIGN KEY (deleted_by_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Index
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active) WHERE is_active = TRUE;

-- Seed Default Superadmin (Password: admin123 - bcrypt hash)
INSERT INTO users (nama, email, password_hash, role, permissions, is_active)
VALUES (
    'Super Admin',
    'superadmin@admin.com',
    '$2b$10$KUuuaQWHvErN2WNcqrJOXeRC1Ym6GRyxcIzwpmRboOSkDpOPxE/Cu',
    'superadmin',
    '{"dashboard":"full","assets":"full","tickets":"full"}'::jsonb,
    true
);

-- =====================================================================
-- TABEL 3: Asset (Master Data Aset IT)
-- =====================================================================
CREATE TABLE aset_ti (
    id                          SERIAL          PRIMARY KEY,
    hostname                    VARCHAR(50)     NOT NULL UNIQUE,
    serial_number               VARCHAR(50)     NOT NULL UNIQUE,
    spesifikasi                 TEXT,
    nik_pemegang_asset           VARCHAR(20),
    nama_karyawan_pemegang_asset VARCHAR(150),
    departemen_pemegang_asset    VARCHAR(100),
    lokasi_asset                VARCHAR(100),
    tipe_perangkat              VARCHAR(50),
    brand_merek                 VARCHAR(50),
    model                       VARCHAR(100),
    status                      VARCHAR(20)     NOT NULL DEFAULT 'In Use',
    kondisi                     VARCHAR(20)     NOT NULL DEFAULT 'Normal',
    note_asset                  VARCHAR(255),
    deleted_at                  TIMESTAMP,
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraint: Status & Kondisi Asset
    CONSTRAINT chk_asset_status
        CHECK (status IN ('In Use', 'Stock', 'Damaged', 'In Service', 'Disposal')),

    CONSTRAINT chk_asset_kondisi
        CHECK (kondisi IN ('Baru', 'Normal', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Berat')),

    -- Relasi ke tabel karyawan (pemegang asset)
    CONSTRAINT fk_asset_pemegang
        FOREIGN KEY (nik_pemegang_asset) REFERENCES karyawan (nik) ON DELETE SET NULL
);

-- Index untuk performa
CREATE INDEX idx_aset_hostname ON aset_ti(hostname);
CREATE INDEX idx_aset_serial_number ON aset_ti(serial_number);
CREATE INDEX idx_aset_status ON aset_ti(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_aset_kondisi ON aset_ti(kondisi);
CREATE INDEX idx_aset_nik_pemegang ON aset_ti(nik_pemegang_asset);

-- =====================================================================
-- TABEL 4: Ticket Queue (Helpdesk Categories/Teams)
-- =====================================================================
CREATE TABLE ticket_queues (
    id                          SERIAL          PRIMARY KEY,
    kode                        VARCHAR(50)     NOT NULL UNIQUE,
    nama                        VARCHAR(150)    NOT NULL,
    deskripsi                   TEXT,
    is_active                   BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default queues
INSERT INTO ticket_queues (kode, nama, deskripsi) VALUES
    ('IT-Help', 'IT Helpdesk', 'General IT support requests'),
    ('IT-Network', 'Network Team', 'Network infrastructure issues'),
    ('IT-Software', 'Software Support', 'Software licensing and installation'),
    ('IT-Hardware', 'Hardware Support', 'Hardware repair and replacement');

-- =====================================================================
-- TABEL 5: Tickets (Helpdesk System)
-- =====================================================================
CREATE TABLE tickets (
    id                          SERIAL          PRIMARY KEY,
    nomor_tiket                 VARCHAR(20)     NOT NULL UNIQUE,
    judul                       VARCHAR(255)    NOT NULL,
    deskripsi                   TEXT,
    kategori                    VARCHAR(100),
    prioritas                   VARCHAR(50)     NOT NULL DEFAULT 'Medium (3d)',
    status_tiket                VARCHAR(50)     NOT NULL DEFAULT 'Open',
    queue_id                    INTEGER,
    assigned_to_user_id         INTEGER,
    pelapor_user_id             INTEGER         NOT NULL,
    attachment_count            INT             DEFAULT 0,
    resolved_at                 TIMESTAMP,
    resolved_by_user_id         INTEGER,
    deleted_at                  TIMESTAMP,
    deleted_by_user_id          INTEGER,
    deletion_reason             TEXT,
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints for status & priority
    CONSTRAINT chk_tickets_prioritas
        CHECK (prioritas IN ('Urgent (4h)', 'High (1day)', 'Medium (3d)', 'Low (7d)')),
    
    CONSTRAINT chk_tickets_status
        CHECK (status_tiket IN ('Open', 'In Progress', 'Pending', 'Resolved', 'Closed', 'Cancelled')),

    -- Foreign keys
    CONSTRAINT fk_tickets_queue
        FOREIGN KEY (queue_id) REFERENCES ticket_queues(id) ON DELETE SET NULL,
    
    CONSTRAINT fk_tickets_assignee
        FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
    
    CONSTRAINT fk_tickets_reporter
        FOREIGN KEY (pelapor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    
    CONSTRAINT fk_tickets_resolved_by
        FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    
    CONSTRAINT fk_tickets_deleted_by
        FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_tickets_queue_status ON tickets(queue_id, status_tiket) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_assigned_status ON tickets(assigned_to_user_id, status_tiket) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_reporter_created ON tickets(pelapor_user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_tickets_status ON tickets(status_tiket) WHERE deleted_at IS NULL;

-- =====================================================================
-- TABEL 6: Ticket Comments
-- =====================================================================
CREATE TABLE komentar_tiket (
    id                          SERIAL          PRIMARY KEY,
    id_tiket                    INTEGER         NOT NULL,
    pesan                       TEXT            NOT NULL,
    attachment_data             TEXT,
    user_id                     INTEGER         NOT NULL,
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_komentar_tiket
        FOREIGN KEY (id_tiket) REFERENCES tickets(id) ON DELETE CASCADE,
    
    CONSTRAINT fk_komentar_user
        FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Index
CREATE INDEX idx_komentar_tiket_id ON komentar_tiket(id_tiket, created_at ASC);

-- =====================================================================
-- TABEL 7: CASP Rating (CSAT - Customer Satisfaction)
-- =====================================================================
CREATE TABLE ticket_casp_ratings (
    id                          SERIAL          PRIMARY KEY,
    id_tiket                    INTEGER         NOT NULL UNIQUE,
    reporter_user_id            INTEGER         NOT NULL,
    assignee_user_id            INTEGER,
    rating_score                INT             NOT NULL,
    feedback                    TEXT,
    submitted_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_casp_tiket
        FOREIGN KEY (id_tiket) REFERENCES tickets(id) ON DELETE CASCADE,
    
    CONSTRAINT fk_casp_reporter
        FOREIGN KEY (reporter_user_id) REFERENCES users(id),
    
    CONSTRAINT fk_casp_assignee
        FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE SET NULL,
    
    CONSTRAINT chk_casp_rating
        CHECK (rating_score BETWEEN 1 AND 5)
);

-- =====================================================================
-- TABEL 8: User-Ticket Queue Assignment
-- =====================================================================
CREATE TABLE user_ticket_queues (
    id                          SERIAL          PRIMARY KEY,
    user_id                     INTEGER         NOT NULL,
    queue_id                    INTEGER         NOT NULL,
    is_primary                  BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_utq_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    CONSTRAINT fk_utq_queue
        FOREIGN KEY (queue_id) REFERENCES ticket_queues(id) ON DELETE CASCADE,
    
    UNIQUE(user_id, queue_id)
);

-- =====================================================================
-- TABEL 9: Ticket History Log (Audit Trail)
-- =====================================================================
CREATE TABLE log_riwayat_tiket (
    id                          SERIAL          PRIMARY KEY,
    id_tiket                    INTEGER         NOT NULL,
    action                      VARCHAR(50)     NOT NULL,
    old_value                   JSONB,
    new_value                   JSONB,
    actor_name                  VARCHAR(200)    NOT NULL,
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_log_tiket
        FOREIGN KEY (id_tiket) REFERENCES tickets(id) ON DELETE CASCADE
);

-- Index
CREATE INDEX idx_log_riwayat_tiket_id ON log_riwayat_tiket(id_tiket, created_at DESC);

-- =====================================================================
-- TABEL 9B: Asset History Log (Audit Trail Aset IT)
-- =====================================================================
CREATE TABLE log_riwayat_aset (
    id                          SERIAL          PRIMARY KEY,
    id_aset                     INTEGER         NOT NULL,
    label_aset                  VARCHAR(100),
    aksi                        VARCHAR(50)     NOT NULL,
    perubahan                   TEXT,
    oleh_pengguna               VARCHAR(150)    NOT NULL DEFAULT 'Sistem',
    dibuat_pada                 TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_log_aset
        FOREIGN KEY (id_aset) REFERENCES aset_ti(id) ON DELETE CASCADE
);

-- Index
CREATE INDEX idx_log_riwayat_aset_id ON log_riwayat_aset(id_aset, dibuat_pada DESC);

-- =====================================================================
-- TABEL 10: Asset Usage History
-- =====================================================================
CREATE TABLE riwayat_pemakaian_aset (
    id                          SERIAL          PRIMARY KEY,
    id_aset                     INTEGER         NOT NULL,
    nik_pemegang                 VARCHAR(20)     NOT NULL,
    tanggal_mulai               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tanggal_selesai             TIMESTAMP,
    catatan                     TEXT,
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_rpa_aset
        FOREIGN KEY (id_aset) REFERENCES aset_ti(id) ON DELETE CASCADE,
    
    CONSTRAINT fk_rpa_nik
        FOREIGN KEY (nik_pemegang) REFERENCES karyawan(nik) ON DELETE SET NULL
);

-- Index
CREATE INDEX idx_rpa_active ON riwayat_pemakaian_aset(id_aset) WHERE tanggal_selesai IS NULL;

-- =====================================================================
-- TABEL 11: Login Audit Log
-- =====================================================================
CREATE TABLE log_audit_login (
    id                          SERIAL          PRIMARY KEY,
    user_id                     INTEGER,
    email                       VARCHAR(150),
    login_time                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address                  VARCHAR(45),
    user_agent                  TEXT,
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_login_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Index
CREATE INDEX idx_log_audit_login_time ON log_audit_login(login_time DESC);
CREATE INDEX idx_log_audit_login_email ON log_audit_login(email);

-- =====================================================================
-- HELPFUL VIEWS
-- =====================================================================

-- View untuk List Aset Lengkap (untuk query kompleks di backend)
CREATE VIEW daftar_aset_ti_lengkap AS
SELECT 
    a.id,
    a.hostname,
    a.serial_number,
    a.spesifikasi,
    k.nik AS nik_pemegang,
    k.nama_karyawan AS nama_karyawan_pemegang,
    k.departemen AS departemen_pemegang,
    k.lokasi_kerja AS lokasi_karyawan,
    a.lokasi_asset,
    a.tipe_perangkat,
    a.brand_merek,
    a.model,
    a.status,
    a.kondisi,
    a.note_asset
FROM aset_ti a
LEFT JOIN karyawan k ON a.nik_pemegang_asset = k.nik
WHERE a.deleted_at IS NULL;

-- View stats tiket per queue
CREATE VIEW v_ticket_stats_per_queue AS
SELECT 
    q.id AS queue_id,
    q.kode AS queue_kode,
    q.nama AS queue_nama,
    COUNT(CASE WHEN t.status_tiket = 'Open' THEN 1 END) AS open_count,
    COUNT(CASE WHEN t.status_tiket IN ('Resolved', 'Closed') THEN 1 END) AS closed_count,
    COUNT(*) FILTER (WHERE t.status_tiket = 'Open') AS total_open,
    COUNT(*) FILTER (WHERE t.status_tiket != 'Open') AS total_closed
FROM ticket_queues q
LEFT JOIN tickets t ON q.id = t.queue_id AND t.deleted_at IS NULL
GROUP BY q.id, q.kode, q.nama;

-- View employee asset summary
CREATE VIEW v_employee_asset_summary AS
SELECT 
    k.id AS karyawan_id,
    k.nik,
    k.nama_karyawan,
    k.departemen,
    COUNT(a.id) AS total_assets,
    COUNT(a.id) FILTER (WHERE a.status = 'In Use') AS active_assets,
    COUNT(a.id) FILTER (WHERE a.status = 'Stock') AS stock_assets
FROM karyawan k
LEFT JOIN aset_ti a ON k.nik = a.nik_pemegang_asset AND a.deleted_at IS NULL
GROUP BY k.id, k.nik, k.nama_karyawan, k.departemen;

-- =====================================================================
-- AUTO UPDATE TRIGGERS (Optional but recommended)
-- =====================================================================

CREATE OR REPLACE FUNCTION auto_update_timestamp() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_auto_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION auto_update_timestamp();
CREATE TRIGGER trg_karyawan_auto_updated_at BEFORE UPDATE ON karyawan FOR EACH ROW EXECUTE FUNCTION auto_update_timestamp();
CREATE TRIGGER trg_aset_ti_auto_updated_at BEFORE UPDATE ON aset_ti FOR EACH ROW EXECUTE FUNCTION auto_update_timestamp();
CREATE TRIGGER trg_tickets_auto_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION auto_update_timestamp();
CREATE TRIGGER trg_ticket_queues_auto_updated_at BEFORE UPDATE ON ticket_queues FOR EACH ROW EXECUTE FUNCTION auto_update_timestamp();
CREATE TRIGGER trg_riwayat_pemakaian_auto_updated_at BEFORE UPDATE ON riwayat_pemakaian_aset FOR EACH ROW EXECUTE FUNCTION auto_update_timestamp();

-- =====================================================================
-- HARD DELETE PREVENTION TRIGGERS
-- =====================================================================

CREATE OR REPLACE FUNCTION prevent_hard_delete() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Hard delete prohibited for %. Use soft delete by setting deleted_at.', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_prevent_hard_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER trg_aset_ti_prevent_hard_delete BEFORE DELETE ON aset_ti FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
CREATE TRIGGER trg_tickets_prevent_hard_delete BEFORE DELETE ON tickets FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();

-- =====================================================================
-- SEED DATA (Optional Sample Employees)
-- =====================================================================

-- INSERT INTO karyawan (nik, nama_karyawan, status, title, job_level, departemen, directorate, tanggal_mulai_bekerja, employeement_status, nik_atasan_langsung, email_kantor, lokasi_kerja)
-- VALUES 
-- ('EMP001', 'John Doe', 'Active', 'Senior Developer', 'S1', 'Engineering', 'Technology Directorate', '2020-01-15', 'Permanent', NULL, 'john.doe@company.com', 'Jakarta'),
-- ('EMP002', 'Jane Smith', 'Active', 'Lead Engineer', 'S1', 'Engineering', 'Technology Directorate', '2019-06-01', 'Permanent', 'EMP001', 'jane.smith@company.com', 'Jakarta'),
-- ('EMP003', 'Bob Wilson', 'Active', 'DevOps Engineer', 'S1', 'Infrastructure', 'Technology Directorate', '2021-03-10', 'Contract', NULL, 'bob.wilson@company.com', 'Surabaya');

-- =====================================================================
-- COMPLETED: Simple Schema with Checks Ready for Use
-- =====================================================================
