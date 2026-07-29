import { pool } from '../config/database.js'

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

const isSuperAdmin = (role) => {
  const r = (role || '').trim().toLowerCase()
  return r === 'superadmin' || r === 'super admin'
}

let isMigrated = false

export async function ensureQueueTablesExist() {
  if (isMigrated) return
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_queues (
        id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        kode            VARCHAR(20)  NOT NULL UNIQUE,
        nama            VARCHAR(100) NOT NULL,
        deskripsi       TEXT,
        is_active       BOOLEAN NOT NULL DEFAULT true,
        dibuat_pada     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        diperbarui_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await pool.query(`
      INSERT INTO ticket_queues (kode, nama, deskripsi) VALUES
        ('HR',  'Human Resources',        'Tiket terkait sumber daya manusia'),
        ('IT',  'Information Technology', 'Tiket terkait teknologi informasi'),
        ('GA',  'General Affairs',        'Tiket terkait fasilitas dan kebutuhan umum'),
        ('OPS', 'Operations',             'Tiket terkait aktivitas operasional')
      ON CONFLICT (kode) DO NOTHING;
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_ticket_queues (
        user_id     BIGINT NOT NULL,
        queue_id    BIGINT NOT NULL,
        is_primary  BOOLEAN NOT NULL DEFAULT false,
        dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, queue_id),
        CONSTRAINT fk_utq_user  FOREIGN KEY (user_id)  REFERENCES users(id)         ON DELETE CASCADE,
        CONSTRAINT fk_utq_queue FOREIGN KEY (queue_id) REFERENCES ticket_queues(id) ON DELETE CASCADE
      );
    `)

    await pool.query(`
      ALTER TABLE tickets
        ADD COLUMN IF NOT EXISTS queue_id            BIGINT,
        ADD COLUMN IF NOT EXISTS pelapor_user_id     BIGINT,
        ADD COLUMN IF NOT EXISTS assigned_to_user_id BIGINT;
    `)

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_ticket_queue') THEN
          ALTER TABLE tickets ADD CONSTRAINT fk_ticket_queue FOREIGN KEY (queue_id) REFERENCES ticket_queues(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_ticket_pelapor_user') THEN
          ALTER TABLE tickets ADD CONSTRAINT fk_ticket_pelapor_user FOREIGN KEY (pelapor_user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_ticket_assigned_user') THEN
          ALTER TABLE tickets ADD CONSTRAINT fk_ticket_assigned_user FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END$$;
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tickets_queue_status    ON tickets (queue_id, status_tiket, dibuat_pada);
      CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status ON tickets (assigned_to_user_id, status_tiket);
      CREATE INDEX IF NOT EXISTS idx_tickets_reporter        ON tickets (pelapor_user_id, dibuat_pada);
      CREATE INDEX IF NOT EXISTS idx_utq_user_queue          ON user_ticket_queues (user_id, queue_id);
      CREATE INDEX IF NOT EXISTS idx_utq_queue_user          ON user_ticket_queues (queue_id, user_id);
    `)

    // Backfill queue_id dari kolom kategori lama
    await pool.query(`UPDATE tickets t SET queue_id = q.id FROM ticket_queues q WHERE q.kode = 'IT'  AND t.queue_id IS NULL AND (UPPER(TRIM(t.kategori)) = 'IT'  OR t.kategori IS NULL);`)
    await pool.query(`UPDATE tickets t SET queue_id = q.id FROM ticket_queues q WHERE q.kode = 'HR'  AND t.queue_id IS NULL AND UPPER(TRIM(t.kategori)) = 'HR';`)
    await pool.query(`UPDATE tickets t SET queue_id = q.id FROM ticket_queues q WHERE q.kode = 'GA'  AND t.queue_id IS NULL AND UPPER(TRIM(t.kategori)) = 'GA';`)
    await pool.query(`UPDATE tickets t SET queue_id = q.id FROM ticket_queues q WHERE q.kode = 'OPS' AND t.queue_id IS NULL AND UPPER(TRIM(t.kategori)) = 'OPS';`)
    await pool.query(`UPDATE tickets t SET queue_id = q.id FROM ticket_queues q WHERE q.kode = 'IT'  AND t.queue_id IS NULL;`)

    // Backfill pelapor_user_id dan assigned_to_user_id dari nama teks
    await pool.query(`UPDATE tickets t SET pelapor_user_id = u.id FROM users u WHERE LOWER(TRIM(t.pelapor)) = LOWER(TRIM(u.nama)) AND t.pelapor_user_id IS NULL;`)
    await pool.query(`UPDATE tickets t SET assigned_to_user_id = u.id FROM users u WHERE LOWER(TRIM(t.assigned_to)) = LOWER(TRIM(u.nama)) AND t.assigned_to_user_id IS NULL;`)

    isMigrated = true
    console.log('[Queue] Migration & backfill selesai.')
  } catch (err) {
    console.error('[Queue] Migration error:', err.message)
  }
}

// GET /api/ticket-queues
export async function listQueues(req, res) {
  await ensureQueueTablesExist()
  const result = await pool.query(`SELECT id, kode, nama, deskripsi, is_active FROM ticket_queues WHERE is_active = true ORDER BY kode`)
  res.json(result.rows)
}

// GET /api/ticket-queues/my
export async function listMyQueues(req, res) {
  await ensureQueueTablesExist()
  if (isSuperAdmin(req.user.role)) {
    const result = await pool.query(`SELECT id, kode, nama, deskripsi FROM ticket_queues WHERE is_active = true ORDER BY kode`)
    return res.json(result.rows)
  }
  const result = await pool.query(
    `SELECT q.id, q.kode, q.nama, q.deskripsi, utq.is_primary FROM user_ticket_queues utq JOIN ticket_queues q ON q.id = utq.queue_id WHERE utq.user_id = $1 AND q.is_active = true ORDER BY utq.is_primary DESC, q.kode ASC`,
    [req.user.id]
  )
  res.json(result.rows)
}

// GET /api/ticket-queues/:queueId/admins
export async function listQueueAdmins(req, res) {
  await ensureQueueTablesExist()
  const queueId = parseInt(req.params.queueId, 10)
  if (isNaN(queueId)) throw createHttpError(400, 'Queue ID tidak valid.')
  const result = await pool.query(
    `SELECT DISTINCT u.id, u.nama, u.email, u.role, COALESCE(utq.is_primary, false) AS is_primary
     FROM users u
     LEFT JOIN user_ticket_queues utq ON utq.user_id = u.id AND utq.queue_id = $1
     WHERE u.is_active = true
       AND (utq.queue_id = $1 OR LOWER(u.role) IN ('superadmin', 'super admin'))
     ORDER BY u.nama ASC`,
    [queueId]
  )
  res.json(result.rows)
}

// POST /api/ticket-queues/:queueId/admins
export async function addAdminToQueue(req, res) {
  await ensureQueueTablesExist()
  if (!isSuperAdmin(req.user.role)) throw createHttpError(403, 'Hanya superadmin yang dapat mengatur mapping admin.')
  const queueId = parseInt(req.params.queueId, 10)
  const { user_id, is_primary } = req.body
  if (isNaN(queueId) || !user_id) throw createHttpError(400, 'queue_id dan user_id wajib diisi.')
  const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND is_active = true', [user_id])
  if (userCheck.rowCount === 0) throw createHttpError(404, 'User tidak ditemukan atau tidak aktif.')
  await pool.query(
    `INSERT INTO user_ticket_queues (user_id, queue_id, is_primary) VALUES ($1, $2, $3) ON CONFLICT (user_id, queue_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
    [user_id, queueId, is_primary === true]
  )
  res.status(201).json({ message: 'Admin berhasil ditambahkan ke queue.' })
}

// DELETE /api/ticket-queues/:queueId/admins/:userId
export async function removeAdminFromQueue(req, res) {
  await ensureQueueTablesExist()
  if (!isSuperAdmin(req.user.role)) throw createHttpError(403, 'Hanya superadmin yang dapat mengatur mapping admin.')
  const queueId = parseInt(req.params.queueId, 10)
  const userId  = parseInt(req.params.userId, 10)
  if (isNaN(queueId) || isNaN(userId)) throw createHttpError(400, 'ID tidak valid.')
  const result = await pool.query('DELETE FROM user_ticket_queues WHERE user_id = $1 AND queue_id = $2 RETURNING *', [userId, queueId])
  if (result.rowCount === 0) throw createHttpError(404, 'Mapping tidak ditemukan.')
  res.json({ message: 'Admin berhasil dihapus dari queue.' })
}
