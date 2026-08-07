import { pool } from '../config/database.js'
import { sendEmail, renderTicketEmailHtml } from './emailService.js'

/**
 * PostgreSQL BIGINT columns return string values in node-postgres (e.g. "5").
 * actorUserId is converted to Number. Strict equality ("5" !== 5) would always
 * be true, silently breaking every "don't email the actor" guard.
 * This helper normalises any ID to a Number for safe comparison.
 */
function toNumericId(value) {
  if (value == null) return null
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * Fetch recipient details from database safely
 */
async function fetchUserById(queryable, userId) {
  if (!userId || !Number.isSafeInteger(Number(userId))) return null
  try {
    const res = await queryable.query(
      `SELECT id, nama, email, role FROM users WHERE id = $1 AND is_active = true AND deleted_at IS NULL`,
      [Number(userId)],
    )
    return res.rows[0] || null
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[emailNotificationService] Error fetching user ${userId}:`, err.message)
    }
    return null
  }
}

async function fetchQueueAdmins(queryable, queueId) {
  if (!queueId || !Number.isSafeInteger(Number(queueId))) return []
  try {
    const res = await queryable.query(
      `SELECT DISTINCT u.id, u.nama, u.email, u.role
       FROM users u
       LEFT JOIN user_ticket_queues utq ON utq.user_id = u.id
       WHERE (utq.queue_id = $1 OR u.role IN ('superadmin', 'super admin'))
         AND u.is_active = true
         AND u.deleted_at IS NULL`,
      [Number(queueId)],
    )
    return res.rows
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[emailNotificationService] Error fetching queue admins for queue ${queueId}:`, err.message)
    }
    return []
  }
}

async function fetchReporterUser(queryable, ticket) {
  if (ticket.pelapor_user_id) {
    const user = await fetchUserById(queryable, ticket.pelapor_user_id)
    if (user && user.email) return user
  }
  if (ticket.pelapor) {
    try {
      const resUser = await queryable.query(
        `SELECT id, nama, email, role FROM users WHERE LOWER(TRIM(nama)) = LOWER(TRIM($1)) AND is_active = true AND deleted_at IS NULL LIMIT 1`,
        [ticket.pelapor],
      )
      if (resUser.rows[0] && resUser.rows[0].email) return resUser.rows[0]

      const resKaryawan = await queryable.query(
        `SELECT id_karyawan AS id, nama_karyawan AS nama, email_kantor AS email, 'user' AS role
         FROM karyawan
         WHERE LOWER(TRIM(nama_karyawan)) = LOWER(TRIM($1)) AND email_kantor IS NOT NULL AND BTRIM(email_kantor) <> '' LIMIT 1`,
        [ticket.pelapor],
      )
      if (resKaryawan.rows[0]) return resKaryawan.rows[0]
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[emailNotificationService] Error searching reporter by name:', err.message)
      }
    }
  }
  return null
}

/**
 * Handle dispatching email notifications for ticket events asynchronously.
 * NEVER throw errors to caller — log failures silently.
 */
export async function handleTicketEventNotification(eventType, ticket, options = {}) {
  const queryable = options.queryable || pool
  const actorUserId = options.actorUserId != null ? Number(options.actorUserId) : null
  const changes = Array.isArray(options.changes) ? options.changes : []
  const comment = options.comment || null

  if (!ticket || !ticket.id) return

  try {
    const ticketId = ticket.id
    const nomorTiket = ticket.nomor_tiket || `TIKET-#${ticketId}`

    // Fetch Reporter and Assignee users if available
    const reporterUser = await fetchReporterUser(queryable, ticket)
    const assigneeUser = ticket.assigned_to_user_id
      ? await fetchUserById(queryable, ticket.assigned_to_user_id)
      : null

    // Normalise all IDs to Number for safe comparison (BIGINT → string fix)
    const reporterId = toNumericId(reporterUser?.id)
    const assigneeId = toNumericId(assigneeUser?.id)

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[emailNotificationService] Event: ${eventType} | Ticket: ${nomorTiket} | Actor ID: ${actorUserId} | Reporter: ${reporterUser?.email || 'N/A'} (ID: ${reporterId}) | Assignee: ${assigneeUser?.email || 'N/A'} (ID: ${assigneeId})`)
    }

    // ──────────────────────────────────────────────────────────
    // EVENT 1: TICKET_CREATED
    // ──────────────────────────────────────────────────────────
    if (eventType === 'TICKET_CREATED') {
      // 1A. Confirm to Reporter
      if (reporterUser && reporterUser.email && reporterId !== actorUserId) {
        if (process.env.NODE_ENV !== 'test') {
          console.log(`[emailNotificationService] Dispatching TICKET_CREATED email to Reporter <${reporterUser.email}>`)
        }
        const html = renderTicketEmailHtml({
          recipientName: reporterUser.nama,
          title: `[${nomorTiket}] Tiket Baru Berhasil Dibuat`,
          subtitle: `Tiket Anda telah berhasil dibuat dan saat ini sedang menunggu penanganan oleh Tim IT Support.`,
          ticket,
          actionText: 'Anda dapat memantau status tiket melalui aplikasi IT Monitoring.',
        })
        await sendEmail({
          to: reporterUser.email,
          subject: `[${nomorTiket}] Tiket Anda Telah Berhasil Dibuat`,
          html,
          text: `Tiket Anda (${nomorTiket}: ${ticket.judul}) telah berhasil dibuat dan akan diproses oleh Tim IT.`,
        })
      }

      // 1B. Notify Queue Admins & Superadmins
      const queueAdmins = await fetchQueueAdmins(queryable, ticket.queue_id)
      for (const admin of queueAdmins) {
        if (!admin.email || toNumericId(admin.id) === actorUserId) continue

        if (process.env.NODE_ENV !== 'test') {
          console.log(`[emailNotificationService] Dispatching TICKET_CREATED email to Admin <${admin.email}>`)
        }
        const html = renderTicketEmailHtml({
          recipientName: admin.nama,
          title: `[${nomorTiket}] Tiket Baru Masuk Antrean`,
          subtitle: `Sebuah tiket baru telah dibuat oleh <strong>${ticket.pelapor || reporterUser?.nama || 'Pengguna'}</strong> dan membutuhkan perhatian Tim IT.`,
          ticket,
          actionText: 'Silakan login ke sistem untuk menangani atau menugaskan tiket ini.',
        })
        await sendEmail({
          to: admin.email,
          subject: `[${nomorTiket}] Tiket Baru Masuk: ${ticket.judul || ''}`,
          html,
          text: `Tiket baru (${nomorTiket}) telah dibuat oleh ${ticket.pelapor || 'Pengguna'}. Judul: ${ticket.judul}`,
        })
      }
    }

    // ──────────────────────────────────────────────────────────
    // EVENT 2: TICKET_UPDATED
    // ──────────────────────────────────────────────────────────
    else if (eventType === 'TICKET_UPDATED') {
      // 2A. Notify Reporter
      if (reporterUser && reporterUser.email && reporterId !== actorUserId) {
        if (process.env.NODE_ENV !== 'test') {
          console.log(`[emailNotificationService] Dispatching TICKET_UPDATED email to Reporter <${reporterUser.email}>`)
        }
        const html = renderTicketEmailHtml({
          recipientName: reporterUser.nama,
          title: `[${nomorTiket}] Tiket Anda Mengalami Perubahan`,
          subtitle: `Terdapat pembaruan status / informasi pada tiket Anda.`,
          ticket,
          changes,
          actionText: 'Silakan cek aplikasi untuk informasi selengkapnya.',
        })
        await sendEmail({
          to: reporterUser.email,
          subject: `[${nomorTiket}] Pembaruan Tiket: ${ticket.judul || ''}`,
          html,
          text: `Tiket Anda (${nomorTiket}) mengalami perubahan status atau informasi.`,
        })
      } else {
        if (process.env.NODE_ENV !== 'test') {
          console.log(`[emailNotificationService] TICKET_UPDATED skipped for Reporter. reporterUser: ${reporterUser?.email || 'None'}, reporterId: ${reporterId}, actorUserId: ${actorUserId}`)
        }
      }
    }

    // ──────────────────────────────────────────────────────────
    // EVENT 3: COMMENT_CREATED
    // ──────────────────────────────────────────────────────────
    else if (eventType === 'COMMENT_CREATED') {
      const commentPesan = comment?.pesan || null
      const commentAuthor = comment?.nama_pengguna || 'Seseorang'

      // 3A. If comment made by Admin/Assignee -> Notify Reporter
      if (reporterUser && reporterUser.email && reporterId !== actorUserId) {
        const html = renderTicketEmailHtml({
          recipientName: reporterUser.nama,
          title: `[${nomorTiket}] Komentar Baru pada Tiket Anda`,
          subtitle: `<strong>${commentAuthor}</strong> menambahkan pesan baru pada tiket Anda.`,
          ticket,
          commentPesan,
          commentAuthor,
          actionText: 'Silakan balasan komentar ini melalui aplikasi IT Monitoring.',
        })
        await sendEmail({
          to: reporterUser.email,
          subject: `[${nomorTiket}] Pesan Baru dari IT Support: ${ticket.judul || ''}`,
          html,
          text: `Ada komentar baru pada tiket Anda (${nomorTiket}) oleh ${commentAuthor}: "${commentPesan}"`,
        })
      }

      // 3B. If comment made by Reporter -> Notify Assignee or Queue Admins
      if (reporterUser && actorUserId === reporterId) {
        // Send to assigned admin if exists, otherwise queue admins
        const targetAdmins = assigneeUser
          ? [assigneeUser]
          : await fetchQueueAdmins(queryable, ticket.queue_id)

        for (const admin of targetAdmins) {
          if (!admin.email || toNumericId(admin.id) === actorUserId) continue

          const html = renderTicketEmailHtml({
            recipientName: admin.nama,
            title: `[${nomorTiket}] Balasan Komentar dari Pelapor`,
            subtitle: `Pelapor (<strong>${commentAuthor}</strong>) telah mengirimkan pesan baru pada tiket.`,
            ticket,
            commentPesan,
            commentAuthor,
            actionText: 'Buka aplikasi untuk melihat dan merespon pesan pelapor.',
          })
          await sendEmail({
            to: admin.email,
            subject: `[${nomorTiket}] Balasan Pelapor: ${ticket.judul || ''}`,
            html,
            text: `Pelapor (${commentAuthor}) memberikan balasan di tiket ${nomorTiket}: "${commentPesan}"`,
          })
        }
      }
    }
  } catch (err) {
    console.error(`[emailNotificationService] Unhandled error dispatching email for ${eventType}:`, err.message)
  }
}
