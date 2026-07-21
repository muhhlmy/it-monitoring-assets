import { query } from '../config/database.js'

export async function checkHealth(req, res) {
  await query('SELECT 1')
  res.json({ status: 'ok', database: 'connected' })
}
