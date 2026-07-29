-- ============================================================
-- Migrasi Skema Revisi IT Monitoring Assets
-- Tanggal: 28 Juli 2026
-- ============================================================

-- 1. Tambah kolom metadata resolved pada tabel tickets
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS resolved_by_user_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ticket_resolved_by_user'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT fk_ticket_resolved_by_user
      FOREIGN KEY (resolved_by_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Buat tabel ticket_casp_ratings
CREATE TABLE IF NOT EXISTS ticket_casp_ratings (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id              BIGINT NOT NULL UNIQUE,
  reporter_user_id       BIGINT NULL,
  assignee_user_id       BIGINT NULL,
  reporter_name_snapshot VARCHAR(150) NOT NULL,
  assignee_name_snapshot VARCHAR(150) NOT NULL,
  rating                 SMALLINT NOT NULL,
  feedback               TEXT,
  submitted_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_casp_ticket
    FOREIGN KEY (ticket_id)
    REFERENCES tickets(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_casp_reporter
    FOREIGN KEY (reporter_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL,

  CONSTRAINT fk_casp_assignee
    FOREIGN KEY (assignee_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL,

  CONSTRAINT chk_casp_rating
    CHECK (rating BETWEEN 1 AND 5),

  CONSTRAINT chk_casp_different_actor
    CHECK (
      reporter_user_id IS NULL
      OR assignee_user_id IS NULL
      OR reporter_user_id <> assignee_user_id
    )
);

-- 3. Indeks Performa
CREATE INDEX IF NOT EXISTS idx_tickets_pelapor_user
ON tickets (pelapor_user_id, dibuat_pada DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_assigned_user
ON tickets (assigned_to_user_id, status_tiket);

CREATE INDEX IF NOT EXISTS idx_casp_assignee_submitted
ON ticket_casp_ratings (assignee_user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_casp_reporter_submitted
ON ticket_casp_ratings (reporter_user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_resolved_at
ON tickets (resolved_at DESC)
WHERE status_tiket = 'Resolved';

-- 4. Backfill otomatis tiket legacy tanpa pelapor_user_id dari nama pelapor jika ada kesesuaian di tabel users
UPDATE tickets t
SET pelapor_user_id = u.id
FROM users u
WHERE t.pelapor_user_id IS NULL
  AND LOWER(TRIM(t.pelapor)) = LOWER(TRIM(u.nama));
