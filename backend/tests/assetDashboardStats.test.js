import assert from 'node:assert/strict'
import test from 'node:test'
import { pool } from '../src/config/database.js'

test('Monthly trend returns 12 consecutive months with default 0 for empty months', async () => {
  const trendResult = await pool.query(`
    WITH months AS (
      SELECT generate_series(
        DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
        DATE_TRUNC('month', CURRENT_DATE),
        INTERVAL '1 month'
      )::date AS month_date
    )
    SELECT 
      TO_CHAR(m.month_date, 'Mon YYYY') AS month,
      TO_CHAR(m.month_date, 'Mon') AS label,
      COUNT(a.id)::int AS count
    FROM months m
    LEFT JOIN aset_ti a 
      ON DATE_TRUNC('month', a.created_at) = m.month_date 
      AND a.deleted_at IS NULL
    GROUP BY m.month_date
    ORDER BY m.month_date ASC
  `)

  const monthlyTrend = trendResult.rows.map((r) => ({
    month: r.month,
    label: r.label,
    period: r.month,
    count: r.count,
    added: r.count,
  }))

  assert.equal(monthlyTrend.length, 12, 'Must return exactly 12 months')
  for (const item of monthlyTrend) {
    assert.ok(item.month, 'Month label must exist')
    assert.ok(typeof item.count === 'number', 'Count must be a number')
    assert.ok(item.count >= 0, 'Count must be non-negative')
  }
})
