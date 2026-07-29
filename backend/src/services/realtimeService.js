import { EventEmitter } from 'events'

export const realtimeEmitter = new EventEmitter()

const sseClients = new Set()

export function addSseClient(res) {
  sseClients.add(res)
  res.on('close', () => {
    sseClients.delete(res)
  })
}

export function broadcastEvent(eventType, payload) {
  const data = JSON.stringify({ type: eventType, data: payload, timestamp: Date.now() })
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`)
    } catch (_) {
      sseClients.delete(client)
    }
  }
}
