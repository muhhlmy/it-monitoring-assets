/**
 * Service Helper untuk Otorisasi & Scope Access Tiket
 */

export function isSuperAdmin(role) {
  const r = (role || '').trim().toLowerCase()
  return r === 'superadmin' || r === 'super admin'
}

export function isAdmin(role) {
  const r = (role || '').trim().toLowerCase()
  return r === 'admin' || isSuperAdmin(role)
}

/**
 * Membentuk klausa SQL WHERE dan parameternya berdasarkan role user & scope request.
 * Supported scopes: 'reported', 'assigned', 'queue', 'unassigned', 'all'
 */
export function buildTicketScopeQuery(user, query = {}) {
  const userId = user.id
  const superAdmin = isSuperAdmin(user.role)
  const userRole = (user.role || '').trim().toLowerCase()

  let scope = query.scope
  const tab = query.tab

  // Backward compatibility & normalisasi scope
  if (!scope) {
    if (tab === 'mine') {
      scope = userRole === 'user' ? 'reported' : 'assigned'
    } else if (tab === 'unassigned') {
      scope = 'unassigned'
    } else if (tab === 'all' && superAdmin) {
      scope = 'all'
    } else {
      scope = userRole === 'user' ? 'reported' : 'queue'
    }
  }

  // Paksa user biasa hanya bisa mengakses scope 'reported'
  if (!superAdmin && userRole === 'user') {
    scope = 'reported'
  }

  const params = []
  const conditions = []

  switch (scope) {
    case 'reported':
      params.push(userId)
      conditions.push(`t.pelapor_user_id = $${params.length}`)
      break

    case 'assigned':
      params.push(userId)
      conditions.push(`t.assigned_to_user_id = $${params.length}`)
      break

    case 'unassigned':
      conditions.push(`t.assigned_to_user_id IS NULL`)
      if (!superAdmin) {
        params.push(userId)
        conditions.push(
          `EXISTS (SELECT 1 FROM user_ticket_queues utq WHERE utq.user_id = $${params.length} AND utq.queue_id = t.queue_id)`
        )
      }
      break

    case 'all':
      if (!superAdmin) {
        // Fallback untuk admin biasa jika meminta 'all' -> dibatasi ke queue miliknya
        params.push(userId)
        conditions.push(
          `EXISTS (SELECT 1 FROM user_ticket_queues utq WHERE utq.user_id = $${params.length} AND utq.queue_id = t.queue_id)`
        )
      }
      break

    case 'queue':
    default:
      if (!superAdmin) {
        params.push(userId)
        conditions.push(
          `EXISTS (SELECT 1 FROM user_ticket_queues utq WHERE utq.user_id = $${params.length} AND utq.queue_id = t.queue_id)`
        )
      }
      break
  }

  return {
    scope,
    params,
    conditions
  }
}

/**
 * Verifikasi apakah user berhak membaca / mengomentari tiket tertentu
 */
export async function canAccessTicket(pool, user, ticketId) {
  if (isSuperAdmin(user.role)) return { canAccess: true, isSuperAdmin: true }

  const userId = user.id
  const ticketRes = await pool.query(
    `SELECT t.id, t.pelapor_user_id, t.assigned_to_user_id, t.queue_id
       FROM tickets t
      WHERE t.id = $1`,
    [ticketId]
  )

  if (ticketRes.rowCount === 0) {
    return { canAccess: false, notFound: true }
  }

  const ticket = ticketRes.rows[0]
  const isReporter = ticket.pelapor_user_id === userId
  const isAssignee = ticket.assigned_to_user_id === userId

  if (isReporter || isAssignee) {
    return { canAccess: true, isReporter, isAssignee, ticket }
  }

  // Cek apakah user admin queue dari tiket ini
  const queueCheck = await pool.query(
    `SELECT 1 FROM user_ticket_queues WHERE user_id = $1 AND queue_id = $2`,
    [userId, ticket.queue_id]
  )

  const isQueueAdmin = queueCheck.rowCount > 0
  return {
    canAccess: isQueueAdmin,
    isReporter,
    isAssignee,
    isQueueAdmin,
    ticket
  }
}

/**
 * Validasi apakah user eligible memberikan penilaian CASP pada tiket
 */
export function checkCaspEligibility(user, ticket, existingCasp = null) {
  if (!user || !ticket) {
    return { eligible: false, reason: 'Data tiket atau user tidak valid.' }
  }

  if (ticket.status_tiket !== 'Resolved') {
    return { eligible: false, reason: 'CASP hanya dapat diisi jika tiket berstatus Resolved.' }
  }

  if (ticket.pelapor_user_id !== user.id) {
    return { eligible: false, reason: 'Hanya pelapor tiket yang berhak memberikan penilaian CASP.' }
  }

  if (ticket.assigned_to_user_id && ticket.assigned_to_user_id === user.id) {
    return { eligible: false, reason: 'Petugas/Assignee tidak diperbolehkan memberi nilai CASP pada tiket sendiri.' }
  }

  if (existingCasp) {
    return { eligible: false, reason: 'Penilaian CASP untuk tiket ini sudah dikirim.', rating: existingCasp }
  }

  return { eligible: true, reason: null }
}
