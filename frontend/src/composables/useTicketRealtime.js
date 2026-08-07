/**
 * useTicketRealtime.js — Global realtime store for ticket events.
 *
 * Mengelola koneksi SSE sepanjang lifecycle aplikasi (bukan per-view).
 * View cukup subscribe via `onTicketEvent` dan unsubscribe di `onUnmounted`.
 * Koneksi SSE di-connect sekali di App.vue setelah login, tetap hidup
 * selama navigasi antar view, dan disconnect saat logout.
 */
import { useTicketEvents } from './useTicketEvents.js'

const { isConnected, connect, disconnect, on, off, forceReconnect } = useTicketEvents()

/**
 * Init koneksi SSE global. Dipanggil di App.vue onMounted / setelah login.
 * connect() di useTicketEvents.js sudah punya guard sendiri, jadi aman
 * dipanggil berulang kali.
 */
export function initTicketRealtime() {
  connect()
}

/**
 * Disconnect koneksi SSE global. Dipanggil di App.vue onUnmounted / logout.
 */
export function stopTicketRealtime() {
  disconnect()
}

/**
 * Subscribe ke event tiket dari SSE. Auto-connect jika belum terhubung.
 * Return unsubscribe function.
 *
 * @param {string} eventType - 'TICKET_CREATED' | 'TICKET_UPDATED' | 'COMMENT_CREATED' | '*'
 * @param {(data: any, payload: any) => void} handler
 * @returns {() => void} unsubscribe
 */
export function onTicketEvent(eventType, handler) {
  on(eventType, handler)

  // Auto-connect jika belum hidup (safety net jika App.vue belum init)
  if (!isConnected.value) {
    connect()
  }

  return () => {
    off(eventType, handler)
  }
}

export { isConnected, forceReconnect }