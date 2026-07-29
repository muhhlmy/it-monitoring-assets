-- Migration: Add CASP rating table & resolved metadata
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS resolved_by_user_id BIGINT NULL;

CREATE TABLE IF NOT EXISTS ticket_casp_ratings (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id              BIGINT NOT NULL UNIQUE,
  reporter_user_id       BIGINT NULL,
  assignee_user_id       BIGINT NULL,
  reporter_name_snapshot VARCHAR(150) NOT NULL,
  assignee_name_snapshot VARCHAR(150) NOT NULL,
  rating                 SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
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
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_casp_assignee_submitted
ON ticket_casp_ratings (assignee_user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_casp_reporter_submitted
ON ticket_casp_ratings (reporter_user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_resolved_at
ON tickets (resolved_at DESC)
WHERE status_tiket = 'Resolved';
