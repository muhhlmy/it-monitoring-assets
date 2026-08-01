import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TICKET_ACTIONS,
  TICKET_ROLES,
  buildTicketScopeQuery,
  canClaimTicket,
  canCommentTicket,
  canDeleteTicket,
  canManageTicket,
  canRateTicket,
  canReadTicket,
  canReadTicketCasp,
  canReassignTicket,
  checkCaspEligibility,
  createTicketIdentity,
  decideTicketAction,
  hasTicketReadPermission,
  hasTicketWritePermission,
  isTicketAssignee,
  isTicketReporter,
  normalizeTicketRole,
  sameTicketActorId,
} from '../src/services/ticketAccessService.js'

const users = {
  reporterRead: {
    id: 10,
    nama: 'Reporter',
    role: 'user',
    permissions: { tickets: 'read_only' },
  },
  reporterFull: {
    id: 10,
    nama: 'Reporter',
    role: 'reporter',
    permissions: { tickets: 'full' },
  },
  adminRead: {
    id: 20,
    nama: 'Queue Admin',
    role: 'admin',
    permissions: { tickets: 'read_only' },
  },
  adminFull: {
    id: 20,
    nama: 'Queue Admin',
    role: 'admin',
    permissions: { tickets: 'full' },
  },
  superadmin: {
    id: 99,
    nama: 'Super Admin',
    role: 'super admin',
    permissions: { tickets: 'none' },
  },
  unknown: {
    id: 50,
    nama: 'Unknown',
    role: 'auditor',
    permissions: { tickets: 'full' },
  },
}

function ticket(overrides = {}) {
  return {
    id: 1,
    nomor_tiket: 'TCK-001',
    status_tiket: 'Open',
    queue_id: 7,
    pelapor_user_id: 10,
    assigned_to_user_id: 30,
    pelapor: 'Reporter',
    assigned_to: 'Assignee',
    is_queue_member: false,
    ...overrides,
  }
}

test('ticket identity canonicalizes roles, IDs, names, and fails closed for unknown actors', () => {
  assert.equal(normalizeTicketRole(' user '), TICKET_ROLES.REPORTER)
  assert.equal(normalizeTicketRole('REPORTER'), TICKET_ROLES.REPORTER)
  assert.equal(normalizeTicketRole('ADMIN'), TICKET_ROLES.ADMIN)
  assert.equal(normalizeTicketRole('superadmin'), TICKET_ROLES.SUPERADMIN)
  assert.equal(normalizeTicketRole(' Super Admin '), TICKET_ROLES.SUPERADMIN)
  assert.equal(normalizeTicketRole('technician'), TICKET_ROLES.UNKNOWN)
  assert.equal(normalizeTicketRole(null), TICKET_ROLES.UNKNOWN)

  const identity = createTicketIdentity({
    id: '10',
    nama: '  Reporter  ',
    role: 'user',
    permissions: { tickets: 'read_only' },
  })

  assert.deepEqual(identity, {
    id: 10,
    name: 'Reporter',
    role: TICKET_ROLES.REPORTER,
    permissions: { tickets: 'read_only' },
    valid: true,
  })
  assert.equal(Object.isFrozen(identity), true)

  for (const actor of [
    null,
    { id: 0, role: 'user' },
    { id: 'not-an-id', role: 'user' },
    { id: 10, role: 'unknown-role' },
  ]) {
    assert.equal(createTicketIdentity(actor).valid, false)
  }
})

test('ticket permission levels distinguish read from write and preserve legacy booleans', () => {
  const identity = (tickets) =>
    createTicketIdentity({ id: 1, role: 'user', permissions: { tickets } })

  assert.equal(hasTicketReadPermission(identity('read_only')), true)
  assert.equal(hasTicketWritePermission(identity('read_only')), false)
  assert.equal(hasTicketReadPermission(identity('full')), true)
  assert.equal(hasTicketWritePermission(identity('full')), true)
  assert.equal(hasTicketReadPermission(identity(true)), true)
  assert.equal(hasTicketWritePermission(identity(true)), true)

  for (const value of ['none', false, undefined, 'unexpected']) {
    assert.equal(hasTicketReadPermission(identity(value)), false)
    assert.equal(hasTicketWritePermission(identity(value)), false)
  }

  assert.equal(hasTicketReadPermission(users.superadmin), true)
  assert.equal(hasTicketWritePermission(users.superadmin), true)
  assert.equal(hasTicketReadPermission(users.unknown), false)
  assert.equal(hasTicketWritePermission(users.unknown), false)
})

test('reporter ownership uses canonical IDs and never trusts legacy display names', () => {
  assert.equal(sameTicketActorId(10, '10'), true)
  assert.equal(sameTicketActorId('10', 10), true)
  assert.equal(sameTicketActorId(10, 11), false)
  assert.equal(sameTicketActorId(null, null), false)

  assert.equal(isTicketReporter(users.reporterRead, ticket({ pelapor_user_id: '10' })), true)
  assert.equal(isTicketReporter(users.reporterRead, ticket({ pelapor_user_id: 11 })), false)
  assert.equal(isTicketAssignee(users.adminFull, ticket({ assigned_to_user_id: '20' })), true)

  const legacyNameOnly = ticket({
    pelapor_user_id: null,
    pelapor: 'Reporter',
    is_queue_member: true,
  })
  assert.equal(isTicketReporter(users.reporterRead, legacyNameOnly), false)
  assert.equal(canReadTicket(users.reporterRead, legacyNameOnly), false)
})

test('read policy covers reporter, queue admin, assignee, superadmin, and denial facts', () => {
  assert.equal(canReadTicket(users.reporterRead, ticket()), true)
  assert.equal(
    canReadTicket(users.reporterRead, ticket({ pelapor_user_id: 11, is_queue_member: true })),
    false,
  )

  assert.equal(canReadTicket(users.adminRead, ticket({ is_queue_member: true })), true)
  assert.equal(
    canReadTicket(users.adminRead, ticket({ assigned_to_user_id: '20', is_queue_member: false })),
    true,
  )
  assert.equal(
    canReadTicket(users.adminRead, ticket({ assigned_to_user_id: 30, is_queue_member: false })),
    false,
  )

  assert.equal(canReadTicket(users.superadmin, ticket()), true)
  assert.equal(canReadTicket(users.unknown, ticket({ is_queue_member: true })), false)
  assert.equal(canReadTicket({ ...users.reporterRead, permissions: { tickets: 'none' } }, ticket()), false)
  assert.equal(canReadTicket(users.reporterRead, null), false)
})

test('comment policy requires readable scope and a non-terminal ticket', () => {
  for (const status of ['Open', 'In Progress', 'Pending']) {
    assert.equal(canCommentTicket(users.reporterRead, ticket({ status_tiket: status })), true)
  }

  for (const status of ['Resolved', ' closed ', 'CANCELLED', '', null]) {
    assert.equal(canCommentTicket(users.reporterRead, ticket({ status_tiket: status })), false)
  }

  assert.equal(
    canCommentTicket(users.adminRead, ticket({ is_queue_member: true, status_tiket: 'Open' })),
    true,
  )
  assert.equal(
    canCommentTicket(users.adminRead, ticket({ is_queue_member: false, status_tiket: 'Open' })),
    false,
  )
  assert.equal(canCommentTicket(users.superadmin, ticket({ status_tiket: 'Open' })), true)
})

test('manage and delete policies enforce write permission and destructive superadmin boundary', () => {
  const queueTicket = ticket({ is_queue_member: true })
  const assignedTicket = ticket({ is_queue_member: false, assigned_to_user_id: '20' })

  assert.equal(canManageTicket(users.adminFull, queueTicket), true)
  assert.equal(canManageTicket(users.adminFull, assignedTicket), true)
  assert.equal(canManageTicket(users.adminRead, queueTicket), false)
  assert.equal(canManageTicket(users.reporterFull, ticket()), false)
  assert.equal(canManageTicket(users.superadmin, ticket()), true)
  assert.equal(canManageTicket(users.unknown, queueTicket), false)

  assert.equal(canDeleteTicket(users.superadmin, ticket()), true)
  assert.equal(canDeleteTicket(users.adminFull, queueTicket), false)
  assert.equal(canDeleteTicket(users.reporterFull, ticket()), false)
  assert.equal(canDeleteTicket(users.unknown, ticket()), false)
  assert.equal(canDeleteTicket(users.superadmin, null), false)
})

test('rating policy is reporter-only, excludes the assignee, and eligibility enforces state', () => {
  const reporterTicket = ticket({ assigned_to_user_id: 30 })
  assert.equal(canReadTicketCasp(users.reporterRead, reporterTicket), true)
  assert.equal(
    canReadTicketCasp(
      users.adminRead,
      ticket({ assigned_to_user_id: 20, is_queue_member: false }),
    ),
    false,
  )
  assert.equal(
    canReadTicketCasp(users.adminRead, ticket({ is_queue_member: true })),
    true,
  )
  assert.equal(canReadTicketCasp(users.superadmin, reporterTicket), true)
  assert.equal(canRateTicket(users.reporterRead, reporterTicket), true)
  assert.equal(
    canRateTicket(users.reporterRead, ticket({ assigned_to_user_id: 10 })),
    false,
  )
  assert.equal(
    canRateTicket(users.reporterRead, ticket({ pelapor_user_id: 11 })),
    false,
  )
  assert.equal(canRateTicket(users.adminFull, ticket({ is_queue_member: true })), false)
  assert.equal(canRateTicket(users.superadmin, reporterTicket), false)
  assert.equal(
    canRateTicket(
      { ...users.superadmin, id: 10 },
      ticket({ pelapor_user_id: 10, assigned_to_user_id: 30 }),
    ),
    true,
  )

  assert.equal(
    checkCaspEligibility(users.reporterRead, ticket({ status_tiket: 'Resolved' })).eligible,
    true,
  )
  assert.equal(
    checkCaspEligibility(users.reporterRead, ticket({ status_tiket: 'Closed' })).eligible,
    true,
  )
  assert.equal(
    checkCaspEligibility(users.reporterRead, ticket({ status_tiket: 'Open' })).eligible,
    false,
  )
  assert.equal(
    checkCaspEligibility(
      users.reporterRead,
      ticket({ status_tiket: 'Resolved' }),
      { rating: 5 },
    ).eligible,
    false,
  )
})

test('claim policy requires an open unassigned ticket and queue membership for admin', () => {
  const claimable = ticket({
    assigned_to_user_id: null,
    status_tiket: 'Open',
    is_queue_member: true,
  })

  assert.equal(canClaimTicket(users.adminFull, claimable), true)
  assert.equal(canClaimTicket(users.adminRead, claimable), false)
  assert.equal(
    canClaimTicket(users.adminFull, { ...claimable, is_queue_member: false }),
    false,
  )
  assert.equal(
    canClaimTicket(users.adminFull, { ...claimable, assigned_to_user_id: 30 }),
    false,
  )

  for (const status of ['Resolved', 'Closed', 'Cancelled']) {
    assert.equal(canClaimTicket(users.adminFull, { ...claimable, status_tiket: status }), false)
  }

  assert.equal(
    canClaimTicket(users.superadmin, { ...claimable, is_queue_member: false }),
    true,
  )
  assert.equal(canClaimTicket(users.reporterFull, claimable), false)
  assert.equal(canClaimTicket(users.unknown, claimable), false)
})

test('reassign policy requires current assignee for admin and a non-terminal ticket', () => {
  const assignedToAdmin = ticket({
    assigned_to_user_id: '20',
    status_tiket: 'In Progress',
    is_queue_member: false,
  })

  assert.equal(canReassignTicket(users.adminFull, assignedToAdmin), true)
  assert.equal(canReassignTicket(users.adminRead, assignedToAdmin), false)
  assert.equal(
    canReassignTicket(
      users.adminFull,
      ticket({ assigned_to_user_id: 30, is_queue_member: true }),
    ),
    false,
  )
  assert.equal(
    canReassignTicket(users.adminFull, { ...assignedToAdmin, status_tiket: 'Resolved' }),
    false,
  )
  assert.equal(canReassignTicket(users.superadmin, ticket({ status_tiket: 'Open' })), true)
  assert.equal(
    canReassignTicket(users.superadmin, ticket({ status_tiket: 'Cancelled' })),
    false,
  )
  assert.equal(canReassignTicket(users.reporterFull, assignedToAdmin), false)
})

test('action dispatcher maps every action and denies unknown action names', () => {
  const openReporterTicket = ticket()
  const queueAdminTicket = ticket({ is_queue_member: true })
  const claimableTicket = ticket({ is_queue_member: true, assigned_to_user_id: null })
  const assignedAdminTicket = ticket({ assigned_to_user_id: 20 })

  assert.equal(decideTicketAction(TICKET_ACTIONS.READ, users.reporterRead, openReporterTicket), true)
  assert.equal(
    decideTicketAction(TICKET_ACTIONS.READ_CASP, users.reporterRead, openReporterTicket),
    true,
  )
  assert.equal(decideTicketAction(TICKET_ACTIONS.EVENT, users.reporterRead, openReporterTicket), true)
  assert.equal(decideTicketAction(TICKET_ACTIONS.COMMENT, users.reporterRead, openReporterTicket), true)
  assert.equal(decideTicketAction(TICKET_ACTIONS.MANAGE, users.adminFull, queueAdminTicket), true)
  assert.equal(decideTicketAction(TICKET_ACTIONS.DELETE, users.superadmin, openReporterTicket), true)
  assert.equal(decideTicketAction(TICKET_ACTIONS.RATE, users.reporterRead, openReporterTicket), true)
  assert.equal(decideTicketAction(TICKET_ACTIONS.CLAIM, users.adminFull, claimableTicket), true)
  assert.equal(decideTicketAction(TICKET_ACTIONS.REASSIGN, users.adminFull, assignedAdminTicket), true)
  assert.equal(decideTicketAction('not-an-action', users.superadmin, openReporterTicket), false)
})

test('scope SQL parameterizes reporter and separates admin read from aggregate scope', () => {
  const reporterScope = buildTicketScopeQuery(users.reporterRead)
  assert.deepEqual(reporterScope, {
    scope: TICKET_ROLES.REPORTER,
    params: [10],
    conditions: ['t.pelapor_user_id = $1'],
  })
  assert.equal(reporterScope.conditions.join(' ').includes('pelapor ='), false)

  const adminReadScope = buildTicketScopeQuery(users.adminRead, { mode: 'read', alias: 't' })
  assert.equal(adminReadScope.scope, TICKET_ROLES.ADMIN)
  assert.deepEqual(adminReadScope.params, [20])
  assert.equal(adminReadScope.conditions.length, 1)
  assert.match(adminReadScope.conditions[0], /^\(t\.assigned_to_user_id = \$1 OR EXISTS/)
  assert.match(adminReadScope.conditions[0], /utq\.user_id = \$1/)
  assert.match(adminReadScope.conditions[0], /utq\.queue_id = t\.queue_id/)

  const adminAggregateScope = buildTicketScopeQuery(users.adminRead, {
    mode: 'aggregate',
    alias: 't',
  })
  assert.deepEqual(adminAggregateScope.params, [20])
  assert.equal(adminAggregateScope.conditions.length, 1)
  assert.match(adminAggregateScope.conditions[0], /^EXISTS/)
  assert.equal(adminAggregateScope.conditions[0].includes('assigned_to_user_id'), false)
})

test('scope tabs only narrow base access and unsafe aliases cannot enter SQL', () => {
  const assigned = buildTicketScopeQuery(users.adminRead, {
    mode: 'read',
    tab: 'assigned',
    alias: 'ticket_row',
  })
  assert.deepEqual(assigned.params, [20, 20])
  assert.equal(assigned.conditions.length, 2)
  assert.match(assigned.conditions[0], /ticket_row\.assigned_to_user_id = \$1/)
  assert.equal(assigned.conditions[1], 'ticket_row.assigned_to_user_id = $2')

  const unassignedSuper = buildTicketScopeQuery(users.superadmin, { tab: 'unassigned' })
  assert.deepEqual(unassignedSuper, {
    scope: TICKET_ROLES.SUPERADMIN,
    params: [],
    conditions: ['t.assigned_to_user_id IS NULL'],
  })

  const unsafeAlias = buildTicketScopeQuery(users.reporterRead, {
    alias: 't; DROP TABLE tickets',
  })
  assert.deepEqual(unsafeAlias.conditions, ['t.pelapor_user_id = $1'])
  assert.equal(unsafeAlias.conditions.join(' ').includes('DROP'), false)

  const noPermission = buildTicketScopeQuery({
    ...users.reporterRead,
    permissions: { tickets: 'none' },
  })
  assert.deepEqual(noPermission, { scope: 'denied', params: [], conditions: ['FALSE'] })

  const unknownRole = buildTicketScopeQuery(users.unknown)
  assert.deepEqual(unknownRole, { scope: 'denied', params: [], conditions: ['FALSE'] })
})
