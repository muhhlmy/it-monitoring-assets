import { onUnmounted, ref } from 'vue'

const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/+$/, '')
const INITIAL_RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 30_000
const MAX_RECONNECT_ATTEMPTS = 8
const MAX_SSE_BUFFER_LENGTH = 256 * 1024
const SSE_BOUNDARY_PATTERN = /(?:\r\n|\r|\n)(?:\r\n|\r|\n)/

export function extractSseFrames(input) {
  let remainder = typeof input === 'string' ? input : ''
  const frames = []
  let boundary = SSE_BOUNDARY_PATTERN.exec(remainder)

  while (boundary) {
    frames.push(remainder.slice(0, boundary.index))
    remainder = remainder.slice(boundary.index + boundary[0].length)
    boundary = SSE_BOUNDARY_PATTERN.exec(remainder)
  }

  return { frames, remainder }
}

export function parseSseFrame(input) {
  if (typeof input !== 'string') return null

  const dataLines = []
  let event = 'message'
  let id = null
  let retry = null
  const lines = input.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue

    const separatorIndex = line.indexOf(':')
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex)
    let value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'data') {
      dataLines.push(value)
    } else if (field === 'event') {
      event = value || 'message'
    } else if (field === 'id' && !value.includes('\0')) {
      id = value
    } else if (field === 'retry' && /^\d+$/.test(value)) {
      retry = Number(value)
    }
  }

  if (dataLines.length === 0 && retry === null) return null
  return {
    event,
    id,
    retry,
    data: dataLines.length > 0 ? dataLines.join('\n') : null,
  }
}

const isConnected = ref(false)
const handlers = new Map()
let activeController = null
let reconnectTimer = null
let reconnectAttempts = 0
let reconnectBaseDelay = INITIAL_RECONNECT_DELAY_MS
let connectionGeneration = 0
let stopped = true

function invokeHandlers(eventType, data, payload) {
  const invoke = (handler) => {
    try {
      handler(data, payload)
    } catch {
      // Satu handler UI tidak boleh memutus stream atau handler lain.
    }
  }

  if (eventType && handlers.has(eventType)) {
    for (const handler of handlers.get(eventType)) invoke(handler)
  }
  if (handlers.has('*')) {
    for (const handler of handlers.get('*')) invoke(handler)
  }
}

function handleFrame(rawFrame) {
  const frame = parseSseFrame(rawFrame)
  if (!frame) return

  if (Number.isSafeInteger(frame.retry) && frame.retry >= 0) {
    reconnectBaseDelay = Math.min(
      Math.max(frame.retry, INITIAL_RECONNECT_DELAY_MS),
      MAX_RECONNECT_DELAY_MS,
    )
  }
  if (frame.data === null) return

  try {
    const payload = JSON.parse(frame.data)
    const eventType = payload?.type || (frame.event !== 'message' ? frame.event : null)
    if (eventType) invokeHandlers(eventType, payload?.data, payload)
  } catch {
    // Frame non-JSON atau parsial diabaikan; buffer transport tetap hidup.
  }
}

async function consumeResponse(response, generation) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error('Browser tidak mendukung streaming response.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (!stopped && generation === connectionGeneration) {
      const { done, value } = await reader.read()
      if (value) buffer += decoder.decode(value, { stream: true })
      if (done) buffer += decoder.decode()

      if (buffer.length > MAX_SSE_BUFFER_LENGTH) {
        throw new Error('Buffer realtime melebihi batas aman.')
      }

      const extracted = extractSseFrames(buffer)
      buffer = extracted.remainder
      for (const frame of extracted.frames) handleFrame(frame)

      if (done) {
        if (buffer.trim()) handleFrame(buffer)
        break
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function expireLocalSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

function scheduleReconnect(generation) {
  if (stopped || generation !== connectionGeneration || reconnectTimer) return

  const delay = Math.min(reconnectBaseDelay * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS)
  reconnectAttempts += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (!stopped && generation === connectionGeneration) {
      void openStream(generation)
    }
  }, delay)
}

async function openStream(generation) {
  if (stopped || generation !== connectionGeneration || activeController) return

  const token = localStorage.getItem('token')
  if (!token) {
    if (generation === connectionGeneration) stopped = true
    return
  }

  const controller = new AbortController()
  activeController = controller
  let reconnect = true

  try {
    const response = await fetch(`${API_BASE}/api/tickets/events`, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
      signal: controller.signal,
    })

    if (response.status === 401) {
      reconnect = false
      expireLocalSession()
      return
    }
    if (response.status === 403) {
      reconnect = false
      return
    }
    if (!response.ok) throw new Error(`Realtime gagal (HTTP ${response.status}).`)

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('text/event-stream')) {
      throw new Error('Response realtime bukan event stream.')
    }

    reconnectAttempts = 0
    isConnected.value = true
    await consumeResponse(response, generation)
  } catch (error) {
    if (error?.name === 'AbortError') reconnect = false
  } finally {
    if (activeController === controller) activeController = null
    isConnected.value = false
    if (reconnect) scheduleReconnect(generation)
  }
}

function connect() {
  if (activeController || reconnectTimer || isConnected.value) return
  if (!localStorage.getItem('token')) return

  stopped = false
  reconnectAttempts = 0
  reconnectBaseDelay = INITIAL_RECONNECT_DELAY_MS
  connectionGeneration += 1
  void openStream(connectionGeneration)
}

function disconnect() {
  stopped = true
  connectionGeneration += 1
  isConnected.value = false

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (activeController) {
    activeController.abort()
    activeController = null
  }
}

function on(eventType, handler) {
  if (!handlers.has(eventType)) handlers.set(eventType, new Set())
  handlers.get(eventType).add(handler)
}

function off(eventType, handler) {
  if (handlers.has(eventType)) handlers.get(eventType).delete(handler)
}

export function useTicketEvents() {
  return { isConnected, connect, disconnect, on, off }
}
