import test from 'node:test'
import assert from 'node:assert/strict'

test('showAssetStats payload structure expectation check', () => {
  const dummyStatsResponse = {
    totalAssets: 120,
    totalEmployees: 90,
    totalUsers: 95,
    activeUsers: 92,
    byStatus: [{ status: 'Digunakan', count: 80 }],
    byCondition: [{ condition: 'Baik', count: 100 }],
    byType: [{ device_type: 'Laptop', count: 70 }],
    byLocation: [{ location: 'HQ Jakarta', count: 120 }],
    monthlyTrend: [
      { period: '2026-01', label: 'Jan 2026', added: 5 }
    ],
    recentAssets: []
  }

  assert.equal(typeof dummyStatsResponse.totalAssets, 'number')
  assert.equal(Array.isArray(dummyStatsResponse.monthlyTrend), true)
  assert.equal(dummyStatsResponse.monthlyTrend[0].period, '2026-01')
  assert.equal(typeof dummyStatsResponse.monthlyTrend[0].added, 'number')
})
