-- =====================================================================
-- TABEL: backup_metadata (Backup & Restore Database)
-- Menyimpan metadata setiap operasi backup dan restore
-- =====================================================================
CREATE TABLE IF NOT EXISTS backup_metadata (
    id              SERIAL          PRIMARY KEY,
    filename        VARCHAR(255)    NOT NULL,
    filepath        TEXT            NOT NULL,
    file_size       BIGINT          NOT NULL DEFAULT 0,
    database_name   VARCHAR(100)    NOT NULL,
    backup_type     VARCHAR(50)     NOT NULL DEFAULT 'manual',
    status          VARCHAR(50)     NOT NULL DEFAULT 'success',
    checksum        VARCHAR(128),
    created_by      INTEGER         NOT NULL,
    created_by_name VARCHAR(150),
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_backup_type
        CHECK (backup_type IN ('manual', 'pre_restore', 'scheduled')),

    CONSTRAINT chk_backup_status
        CHECK (status IN ('success', 'failed', 'in_progress')),

    CONSTRAINT fk_backup_created_by
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_created_at ON backup_metadata(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_status ON backup_metadata(status);
CREATE INDEX IF NOT EXISTS idx_backup_type ON backup_metadata(backup_type);

-- =====================================================================
-- TABEL: backup_audit_log (Audit Trail untuk Backup & Restore)
-- Mencatat setiap event penting dalam proses backup/restore
-- =====================================================================
CREATE TABLE IF NOT EXISTS backup_audit_log (
    id              SERIAL          PRIMARY KEY,
    user_id         INTEGER         NOT NULL,
    user_name       VARCHAR(150),
    operation       VARCHAR(50)     NOT NULL,
    target_database VARCHAR(100)    NOT NULL,
    backup_id       INTEGER,
    status          VARCHAR(50)     NOT NULL DEFAULT 'success',
    error_summary   TEXT,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_audit_operation
        CHECK (operation IN (
            'BACKUP_STARTED',
            'BACKUP_SUCCESS',
            'BACKUP_FAILED',
            'RESTORE_STARTED',
            'RESTORE_VALIDATED',
            'PRE_RESTORE_BACKUP_STARTED',
            'PRE_RESTORE_BACKUP_SUCCESS',
            'PRE_RESTORE_BACKUP_FAILED',
            'RESTORE_SUCCESS',
            'RESTORE_FAILED',
            'BACKUP_DELETED',
            'BACKUP_DOWNLOADED'
        )),

    CONSTRAINT chk_audit_status
        CHECK (status IN ('success', 'failed', 'in_progress')),

    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT fk_audit_backup
        FOREIGN KEY (backup_id) REFERENCES backup_metadata(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_audit_created ON backup_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_audit_operation ON backup_audit_log(operation);
CREATE INDEX IF NOT EXISTS idx_backup_audit_user ON backup_audit_log(user_id);