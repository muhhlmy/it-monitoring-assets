import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isSuperAdmin,
  isAdmin,
  buildTicketScopeQuery,
  checkCaspEligibility
} from '../src/services/ticketAccessService.js'

test('isSuperAdmin and isAdmin validation', () => {
  assert.equal(isSuperAdmin('superadmin'), true)
  assert.equal(isSuperAdmin('Super Admin'), true)
  assert.equal(isSuperAdmin('admin'), false)
  assert.equal(isSuperAdmin('user'), false)

  assert.equal(isAdmin('admin'), true)
  assert.equal(isAdmin('super admin'), true)
  assert.equal(isAdmin('user'), false)
})

test('buildTicketScopeQuery forces user role to reported scope', () => {
  const user = { id: 10, role: 'user', permissions: { tickets: 'read_only' } }
  const result = buildTicketScopeQuery(user, { scope: 'all' })

  assert.equal(result.scope, 'reporter')
  assert.equal(result.params[0], 10)
  assert.ok(result.conditions.includes('t.pelapor_user_id = $1'))
})

test('buildTicketScopeQuery maps mine tab correctly according to role', () => {
  const regularUser = { id: 10, role: 'user', permissions: { tickets: 'read_only' } }
  const resUser = buildTicketScopeQuery(regularUser, { tab: 'mine' })
  assert.equal(resUser.scope, 'reporter')

  const adminUser = { id: 20, role: 'admin', permissions: { tickets: 'read_only' } }
  const resAdmin = buildTicketScopeQuery(adminUser, { tab: 'mine' })
  assert.equal(resAdmin.scope, 'admin')
  assert.match(resAdmin.conditions.join(' '), /assigned_to_user_id/)
})

test('checkCaspEligibility rules validation', () => {
  const user = { id: 5, role: 'user', permissions: { tickets: 'read_only' } }
  const assigneeUser = { id: 99, role: 'admin', permissions: { tickets: 'full' } }

  // Case 1: Status not resolved
  const openTicket = { id: 1, status_tiket: 'Open', pelapor_user_id: 5, assigned_to_user_id: 99 }
  const res1 = checkCaspEligibility(user, openTicket)
  assert.equal(res1.eligible, false)

  // Case 2: Reporter match + Resolved + Not assignee -> Eligible
  const resolvedTicket = { id: 1, status_tiket: 'Resolved', pelapor_user_id: 5, assigned_to_user_id: 99 }
  const res2 = checkCaspEligibility(user, resolvedTicket)
  assert.equal(res2.eligible, true)

  // Case 3: User is assignee (cannot rate own work)
  const res3 = checkCaspEligibility(assigneeUser, resolvedTicket)
  assert.equal(res3.eligible, false)

  // Case 4: Already rated
  const res4 = checkCaspEligibility(user, resolvedTicket, { rating: 5 })
  assert.equal(res4.eligible, false)
})
