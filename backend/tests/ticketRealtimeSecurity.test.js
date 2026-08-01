import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import {
  addSseClient,
  broadcastTicketEvent,
  buildTicketEventDto,
  shouldDeliverTicketEvent,
} from '../src/services/realtimeService.js'
import { createTicketIdentity } from '../src/services/ticketAccessService.js'
import { streamTicketEvents } from '../src/controllers/ticketController.js'

function user(id, role, tickets = 'read_only') {
  return {
    id,
    nama: `${role}-${id}`,
    role,
    permissions: { tickets },
  }
}

function liveUser(actor, isQueueMember = false) {
  return {
    id: actor.id,
    nama: actor.nama,
    role: actor.role,
    permissions: actor.permissions,
    is_queue_member: isQueueMember,
  }
}

function context(actor, queueIds = []) {
  return {
    identity: createTicketIdentity(actor),
    queueIds: new Set(queueIds.map(String)),
  }
}

function ticket(overrides = {}) {
  return {
    id: 101,
    nomor_tiket: 'TCK-101',
    judul: 'Printer tidak merespons',
    deskripsi: 'Internal detail',
    status_tiket: 'Open',
    prioritas: 'High (1day)',
    dibuat_pada: '2026-07-30T10:00:00.000Z',
    queue_id: 7,
    pelapor_user_id: 10,
    assigned_to_user_id: 30,
    pelapor: 'Legacy Reporter',
    pelapor_nama: 'Canonical Reporter',
    assigned_to: 'Assigned Admin',
    attachment: 'data:application/octet-stream;base64,secret-binary',
    is_queue_member: true,
    password: 'must-not-leak',
    token: 'must-not-leak',
    ...overrides,
  }
}

test('realtime delivery uses reporter, queue, assignee, and superadmin resource facts', () => {
  const resource = ticket()
  const reporter = context(user(10, 'user'))
  const otherReporter = context(user(11, 'user'))
  const sameQueueAdmin = context(user(20, 'admin'), [7])
  const otherQueueAdmin = context(user(21, 'admin'), [8])
  const assignedAdmin = context(user(30, 'admin'), [8])
  const superadmin = context(user(99, 'superadmin', 'none'))

  for (const eventType of ['TICKET_CREATED', 'TICKET_UPDATED', 'COMMENT_CREATED']) {
    assert.equal(shouldDeliverTicketEvent(eventType, resource, reporter), true)
    assert.equal(shouldDeliverTicketEvent(eventType, resource, otherReporter), false)
    assert.equal(shouldDeliverTicketEvent(eventType, resource, sameQueueAdmin), true)
    assert.equal(shouldDeliverTicketEvent(eventType, resource, otherQueueAdmin), false)
    assert.equal(shouldDeliverTicketEvent(eventType, resource, assignedAdmin), true)
    assert.equal(shouldDeliverTicketEvent(eventType, resource, superadmin), true)
  }
})

test('realtime delivery fails closed for unknown, missing, unauthorized, and legacy-only actors', () => {
  const resource = ticket()
  const unknownRole = context(user(50, 'auditor', 'full'), [7])
  const noPermissionAdmin = context(user(20, 'admin', 'none'), [7])
  const invalidIdentity = context({ id: null, role: 'admin', permissions: { tickets: 'full' } }, [7])
  const legacyNameOnly = context({
    id: 11,
    nama: 'Legacy Reporter',
    role: 'user',
    permissions: { tickets: 'read_only' },
  })

  assert.equal(shouldDeliverTicketEvent('TICKET_UPDATED', resource, unknownRole), false)
  assert.equal(shouldDeliverTicketEvent('TICKET_UPDATED', resource, noPermissionAdmin), false)
  assert.equal(shouldDeliverTicketEvent('TICKET_UPDATED', resource, invalidIdentity), false)
  assert.equal(shouldDeliverTicketEvent('TICKET_UPDATED', resource, null), false)
  assert.equal(shouldDeliverTicketEvent('TICKET_UPDATED', null, context(user(99, 'superadmin'))), false)
  assert.equal(shouldDeliverTicketEvent('UNSUPPORTED_EVENT', resource, context(user(99, 'superadmin'))), false)
  assert.equal(
    shouldDeliverTicketEvent(
      'TICKET_UPDATED',
      ticket({ pelapor_user_id: null, pelapor: 'Legacy Reporter' }),
      legacyNameOnly,
    ),
    false,
  )
})

test('ticket event DTO exposes exact notification keys and excludes attachments and routing facts', () => {
  const resource = ticket()
  const expectedTicketKeys = [
    'id',
    'nomor_tiket',
    'judul',
    'status_tiket',
    'prioritas',
    'dibuat_pada',
    'pelapor',
  ]

  for (const eventType of ['TICKET_CREATED', 'TICKET_UPDATED']) {
    const dto = buildTicketEventDto(eventType, resource)
    assert.deepEqual(Object.keys(dto), expectedTicketKeys)
    assert.deepEqual(dto, {
      id: 101,
      nomor_tiket: 'TCK-101',
      judul: 'Printer tidak merespons',
      status_tiket: 'Open',
      prioritas: 'High (1day)',
      dibuat_pada: '2026-07-30T10:00:00.000Z',
      pelapor: 'Canonical Reporter',
    })
  }

  const commentDto = buildTicketEventDto('COMMENT_CREATED', resource)
  assert.deepEqual(Object.keys(commentDto), ['ticketId'])
  assert.deepEqual(commentDto, { ticketId: 101 })

  for (const dto of [
    buildTicketEventDto('TICKET_CREATED', resource),
    buildTicketEventDto('TICKET_UPDATED', resource),
    commentDto,
  ]) {
    for (const excludedKey of [
      'attachment',
      'deskripsi',
      'queue_id',
      'pelapor_user_id',
      'assigned_to_user_id',
      'assigned_to',
      'is_queue_member',
      'password',
      'token',
    ]) {
      assert.equal(Object.hasOwn(dto, excludedKey), false, excludedKey)
    }
  }

  assert.equal(buildTicketEventDto('UNSUPPORTED_EVENT', resource), null)
  assert.equal(buildTicketEventDto('TICKET_UPDATED', null), null)
})

class FakeSseResponse extends EventEmitter {
  constructor() {
    super()
    this.writes = []
    this.ended = false
  }

  write(chunk) {
    this.writes.push(chunk)
    return true
  }

  end() {
    this.ended = true
    this.emit('close')
  }
}

test('broadcast sends a redacted DTO only to authorized realtime clients', async (t) => {
  const clients = {
    reporter: new FakeSseResponse(),
    sameQueueAdmin: new FakeSseResponse(),
    otherQueueAdmin: new FakeSseResponse(),
    assignee: new FakeSseResponse(),
    superadmin: new FakeSseResponse(),
    unknown: new FakeSseResponse(),
    invalid: new FakeSseResponse(),
  }

  const removeClients = [
    addSseClient(clients.reporter, user(10, 'user')),
    addSseClient(clients.sameQueueAdmin, user(20, 'admin', 'full'), [7]),
    addSseClient(clients.otherQueueAdmin, user(21, 'admin', 'full'), [8]),
    addSseClient(clients.assignee, user(30, 'admin', 'full'), [8]),
    addSseClient(clients.superadmin, user(99, 'super admin', 'none')),
    addSseClient(clients.unknown, user(50, 'auditor', 'full'), [7]),
    addSseClient(clients.invalid, { id: null, role: 'admin', permissions: { tickets: 'full' } }, [7]),
  ]
  t.after(() => {
    for (const removeClient of removeClients) removeClient()
  })

  const delivered = await broadcastTicketEvent('TICKET_UPDATED', ticket(), {
    queryable: {
      query: async (sql, parameters) => {
        assert.match(sql, /\/\* canonical-sse-users \*\//)
        assert.match(sql, /u\.is_active = true/)
        assert.deepEqual(new Set(parameters[1]), new Set([10, 20, 21, 30, 99]))
        return {
          rows: [
            liveUser(user(10, 'user')),
            liveUser(user(20, 'admin', 'full'), true),
            liveUser(user(21, 'admin', 'full')),
            liveUser(user(30, 'admin', 'full')),
            liveUser(user(99, 'super admin', 'none')),
            liveUser(user(50, 'auditor', 'full'), true),
          ],
        }
      },
    },
  })
  assert.equal(delivered, 4)

  assert.equal(clients.reporter.writes.length, 1)
  assert.equal(clients.sameQueueAdmin.writes.length, 1)
  assert.equal(clients.otherQueueAdmin.writes.length, 0)
  assert.equal(clients.assignee.writes.length, 1)
  assert.equal(clients.superadmin.writes.length, 1)
  assert.equal(clients.unknown.writes.length, 0)
  assert.equal(clients.invalid.writes.length, 0)

  const eventLine = clients.reporter.writes[0]
  assert.match(eventLine, /^data: /)
  assert.match(eventLine, /\n\n$/)
  const event = JSON.parse(eventLine.slice('data: '.length).trim())
  assert.deepEqual(Object.keys(event).sort(), ['data', 'timestamp', 'type'])
  assert.equal(event.type, 'TICKET_UPDATED')
  assert.deepEqual(Object.keys(event.data), [
    'id',
    'nomor_tiket',
    'judul',
    'status_tiket',
    'prioritas',
    'dibuat_pada',
    'pelapor',
  ])
  assert.equal(JSON.stringify(event).includes('secret-binary'), false)
  assert.equal(JSON.stringify(event).includes('must-not-leak'), false)
  assert.equal(Object.hasOwn(event.data, 'queue_id'), false)
  assert.equal(Object.hasOwn(event.data, 'pelapor_user_id'), false)
  assert.equal(Object.hasOwn(event.data, 'assigned_to_user_id'), false)
})

test('broadcast rechecks queue membership and stops delivery after revocation', async (t) => {
  const client = new FakeSseResponse()
  const removeClient = addSseClient(client, user(20, 'admin', 'full'), [7])
  t.after(removeClient)

  let isMember = true
  const queryable = {
    query: async () => ({
      rows: [liveUser(user(20, 'admin', 'full'), isMember)],
    }),
  }
  const resource = ticket({ assigned_to_user_id: null })

  assert.equal(
    await broadcastTicketEvent('TICKET_UPDATED', resource, { queryable }),
    1,
  )
  isMember = false
  assert.equal(
    await broadcastTicketEvent('TICKET_UPDATED', resource, { queryable }),
    0,
  )
  assert.equal(client.writes.length, 1)
})

test('broadcast revalidates active role and permission and disconnects missing users', async (t) => {
  const reporterClient = new FakeSseResponse()
  const superadminClient = new FakeSseResponse()
  const removeReporter = addSseClient(reporterClient, user(10, 'user'))
  const removeSuperadmin = addSseClient(
    superadminClient,
    user(99, 'superadmin', 'none'),
  )
  t.after(() => {
    removeReporter()
    removeSuperadmin()
  })

  let rows = [
    liveUser(user(10, 'user', 'read_only')),
    liveUser(user(99, 'superadmin', 'none')),
  ]
  const queryable = { query: async () => ({ rows }) }
  const resource = ticket({ assigned_to_user_id: null })

  assert.equal(
    await broadcastTicketEvent('TICKET_UPDATED', resource, { queryable }),
    2,
  )

  rows = [
    liveUser(user(10, 'user', 'none')),
    liveUser(user(99, 'admin', 'none')),
  ]
  assert.equal(
    await broadcastTicketEvent('TICKET_UPDATED', resource, { queryable }),
    0,
  )
  assert.equal(reporterClient.writes.length, 1)
  assert.equal(superadminClient.writes.length, 1)
  assert.equal(reporterClient.ended, false)
  assert.equal(superadminClient.ended, false)

  rows = []
  assert.equal(
    await broadcastTicketEvent('TICKET_UPDATED', resource, { queryable }),
    0,
  )
  assert.equal(reporterClient.ended, true)
  assert.equal(superadminClient.ended, true)
})

test('realtime lookup failure drops the event without permanently disconnecting clients', async (t) => {
  const client = new FakeSseResponse()
  const removeClient = addSseClient(client, user(10, 'user'))
  t.after(removeClient)

  let lookupFails = true
  const queryable = {
    query: async () => {
      if (lookupFails) throw new Error('temporary database failure')
      return { rows: [liveUser(user(10, 'user', 'read_only'))] }
    },
  }

  assert.equal(
    await broadcastTicketEvent('TICKET_UPDATED', ticket(), { queryable }),
    0,
  )
  assert.equal(client.ended, false)
  assert.equal(client.writes.length, 0)

  lookupFails = false
  assert.equal(
    await broadcastTicketEvent('TICKET_UPDATED', ticket(), { queryable }),
    1,
  )
  assert.equal(client.ended, false)
  assert.equal(client.writes.length, 1)
})

test('realtime write failure ends and fully removes the broken client', async (t) => {
  const client = new FakeSseResponse()
  client.write = () => {
    throw new Error('socket closed')
  }
  const removeClient = addSseClient(client, user(10, 'user'))
  t.after(removeClient)

  let queryCount = 0
  const queryable = {
    query: async () => {
      queryCount += 1
      return { rows: [liveUser(user(10, 'user', 'read_only'))] }
    },
  }

  assert.equal(
    await broadcastTicketEvent('TICKET_UPDATED', ticket(), { queryable }),
    0,
  )
  assert.equal(client.ended, true)
  assert.equal(queryCount, 1)

  assert.equal(
    await broadcastTicketEvent('TICKET_UPDATED', ticket(), { queryable }),
    0,
  )
  assert.equal(queryCount, 1)
})

test('SSE client is removed when its authenticated token expires', async (t) => {
  const client = new FakeSseResponse()
  const removeClient = addSseClient(client, user(10, 'user'), [], {
    expiresAt: Date.now() + 20,
  })
  t.after(removeClient)

  await new Promise((resolve) => setTimeout(resolve, 50))

  assert.equal(client.ended, true)
  assert.equal(
    await broadcastTicketEvent('TICKET_UPDATED', ticket(), {
      queryable: { query: async () => ({ rows: [] }) },
    }),
    0,
  )
})

test('SSE handshake rejects missing or expired JWT expiry before opening the stream', async () => {
  const identity = createTicketIdentity(user(10, 'user'))

  for (const exp of [undefined, Math.floor(Date.now() / 1000) - 1]) {
    let headerWrites = 0
    const response = {
      setHeader() {
        headerWrites += 1
      },
    }

    await assert.rejects(
      streamTicketEvents(
        {
          ticketIdentity: identity,
          user: { exp },
        },
        response,
      ),
      (error) =>
        error?.statusCode === 401 &&
        error.message === 'Sesi realtime tidak valid atau telah berakhir.',
    )
    assert.equal(headerWrites, 0)
  }
})
