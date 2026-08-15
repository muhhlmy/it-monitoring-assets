import { pool } from '../src/config/database.js';

async function updateQueues() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Ensure HR, IT, and GA exist
    await client.query(`
      INSERT INTO ticket_queues (kode, nama, deskripsi, is_active)
      VALUES 
        ('HR', 'Human Resources', 'Antrean Layanan HR / SDM', true),
        ('IT', 'IT Support', 'Antrean Layanan IT / Support', true),
        ('GA', 'General Affairs', 'Antrean Layanan General Affairs', true)
      ON CONFLICT (kode) DO UPDATE SET 
        nama = EXCLUDED.nama, 
        deskripsi = EXCLUDED.deskripsi, 
        is_active = true
    `);

    // Get ID of new IT queue
    const itQueueRes = await client.query("SELECT id FROM ticket_queues WHERE kode = 'IT'");
    const itQueueId = itQueueRes.rows[0]?.id;

    // Point any tickets associated with old IT-SUP to the new IT queue
    if (itQueueId) {
      await client.query("UPDATE tickets SET queue_id = $1 WHERE queue_id IN (SELECT id FROM ticket_queues WHERE kode = 'IT-SUP')", [itQueueId]);
    }

    // Now delete old IT-SUP queue mapping and queue
    await client.query("DELETE FROM user_ticket_queues WHERE queue_id IN (SELECT id FROM ticket_queues WHERE kode = 'IT-SUP')");
    await client.query("DELETE FROM ticket_queues WHERE kode = 'IT-SUP'");

    // Map existing users (like superadmin) to all queues
    await client.query(`
      INSERT INTO user_ticket_queues (user_id, queue_id, is_primary)
      SELECT u.id, q.id, (q.kode = 'IT')
      FROM users u
      CROSS JOIN ticket_queues q
      ON CONFLICT (user_id, queue_id) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('✅ Queues successfully updated to HR, IT, and GA!');
    
    const qRes = await client.query('SELECT id, kode, nama, deskripsi FROM ticket_queues ORDER BY id');
    console.log('Current Ticket Queues:', qRes.rows);

    const utqRes = await client.query(`
      SELECT u.nama AS user_nama, q.kode AS queue_kode, utq.is_primary 
      FROM user_ticket_queues utq 
      JOIN users u ON u.id = utq.user_id 
      JOIN ticket_queues q ON q.id = utq.queue_id
    `);
    console.log('User Queue Mappings:', utqRes.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to update queues:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

updateQueues();
