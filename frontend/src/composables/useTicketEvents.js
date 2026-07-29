// ============================================================
// composables/useTicketEvents.js - SSE Realtime Ticket Events
// ============================================================
import { onUnmounted, ref } from 'vue'

const API_BASE = import.meta.env.VITE_API_URL || ''

export function useTicketEvents() {
  const isConnected = ref(false)
  let eventSource = null
  const handlers = new Map()

  function connect() {
    if (eventSource) return

    const token = localStorage.getItem('token')
    // SSE doesn't support custom headers, send token via query param
    const url = `${API_BASE}/api/tickets/events${token ? '?token=' + encodeURIComponent(token) : ''}`

    eventSource = new EventSource(url)

    eventSource.onopen = () => {
      isConnected.value = true
    }

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        const type = payload.type
        if (type && handlers.has(type)) {
          handlers.get(type).forEach(fn => fn(payload.data, payload))
        }
        // Also fire a wildcard '*' handler
        if (handlers.has('*')) {
          handlers.get('*').forEach(fn => fn(payload.data, payload))
        }
      } catch (_) { /* ignore parse errors */ }
    }

    eventSource.onerror = () => {
      isConnected.value = false
      // Auto reconnect is handled by EventSource natively
    }
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
      isConnected.value = false
    }
  }

  function on(eventType, handler) {
    if (!handlers.has(eventType)) handlers.set(eventType, new Set())
    handlers.get(eventType).add(handler)
  }

  function off(eventType, handler) {
    if (handlers.has(eventType)) {
      handlers.get(eventType).delete(handler)
    }
  }

  onUnmounted(() => {
    disconnect()
  })

  return { isConnected, connect, disconnect, on, off }
}
