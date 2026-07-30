import { EventEmitter } from 'events'

// EventEmitter ini disediakan untuk hook/extension di luar SSE (saat ini broadcast
// langsung ke SSE clients di bawah). Tetap diekspor agar tidak break import lain.
export const realtimeEmitter = new EventEmitter()

const isRegularUser = (role) => {
  const r = (role || '').trim().toLowerCase()
  return r !== 'admin' && r !== 'superadmin' && r !== 'super admin'
}

// Setiap SSE client menyimpan info user yang melakukan koneksi, agar broadcast
// bisa difilter per klien: user biasa hanya menerima event tiket MILIK DIRINYA,
// dan TIDAK menerima notifikasi "tiket baru".
const sseClients = new Set()

/**
 * Daftarkan SSE client beserta info user pemilik koneksi.
 * @param {import('express').Response} res
 * @param {{ id?:number, nama?:string, role?:string }} userInfo  data user (dari req.user JWT)
 */
export function addSseClient(res, userInfo) {
  res.__sseUser = {
    id: userInfo?.id ?? null,
    nama: userInfo?.nama ?? null,
    role: userInfo?.role ?? null,
  }
  sseClients.add(res)
  res.on('close', () => {
    sseClients.delete(res)
  })
}

/**
 * Cek apakah sebuah tiket "milik" user tertentu (pelapor = user ini).
 * Konsisten dengan access control di listTickets/getTicketHistory.
 */
function isTicketOwner(ticket, clientUser) {
  if (!ticket || !clientUser) return false
  if (ticket.pelapor_user_id != null && clientUser.id != null) {
    return Number(ticket.pelapor_user_id) === Number(clientUser.id)
  }
  if (ticket.pelapor != null && clientUser.nama != null) {
    return String(ticket.pelapor).trim().toLowerCase() === String(clientUser.nama).trim().toLowerCase()
  }
  return false
}

/**
 * Tentukan apakah sebuah event boleh diteruskan ke client tertentu.
 *
 * Aturan notifikasi (sesuai permintaan):
 *  - Admin / superadmin: menerima SEMUA event (tiket baru + semua perubahan).
 *  - User biasa (pelapor):
 *      * TIDAK menerima TICKET_CREATED (notif tiket baru).
 *      * Menerima TICKET_UPDATED untuk SETIAP perubahan pada tiket miliknya
 *        (status, detail, claim, reassign).
 *      * Tidak menerima event tiket milik user lain.
 */
function shouldDeliver(eventType, payload, clientUser) {
  if (!clientUser) return true // fallback aman bila info user belum lengkap

  const regularUser = isRegularUser(clientUser.role)
  if (!regularUser) return true // admin/superadmin terima semuanya

  if (eventType === 'TICKET_CREATED') {
    return false // user tidak mendapat notif "tiket baru"
  }

  if (eventType === 'TICKET_UPDATED') {
    // Payload TICKET_UPDATED berupa full ticket row (sudah berisi pelapor_user_id/pelapor)
    return isTicketOwner(payload, clientUser)
  }

  // Event lain (mis. COMMENT_CREATED) tidak relevan untuk notif bell user biasa.
  return false
}

export function broadcastEvent(eventType, payload) {
  const data = JSON.stringify({ type: eventType, data: payload, timestamp: Date.now() })
  for (const client of sseClients) {
    if (!shouldDeliver(eventType, payload, client.__sseUser)) continue
    try {
      client.write(`data: ${data}\n\n`)
    } catch (_) {
      sseClients.delete(client)
    }
  }
}
