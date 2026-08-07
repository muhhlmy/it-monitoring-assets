import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { extractSseFrames, parseSseFrame } from '../src/composables/useTicketEvents.js'

const sourceUrl = new URL('../src/composables/useTicketEvents.js', import.meta.url)

test('SSE frame extraction preserves partial chunks and accepts CRLF or LF boundaries', () => {
  const first = extractSseFrames(
    'data: {"type":"ONE"}\r\n\r\ndata: {"type":"TWO"}\n\ndata: partial',
  )

  assert.deepEqual(first.frames, ['data: {"type":"ONE"}', 'data: {"type":"TWO"}'])
  assert.equal(first.remainder, 'data: partial')

  const second = extractSseFrames(`${first.remainder} frame\r\n\r\n`)
  assert.deepEqual(second.frames, ['data: partial frame'])
  assert.equal(second.remainder, '')
})

test('SSE parser joins data lines and handles event metadata without treating comments as data', () => {
  assert.deepEqual(
    parseSseFrame(
      ': heartbeat\r\nevent: ticket\r\nid: event-7\r\nretry: 2500\r\ndata: {"line":1,\r\ndata: "next":2}',
    ),
    {
      event: 'ticket',
      id: 'event-7',
      retry: 2500,
      data: '{"line":1,\n"next":2}',
    },
  )
  assert.equal(parseSseFrame(': heartbeat'), null)
})

test('ticket realtime transport sends Bearer header and never places token in URL', async () => {
  const source = await readFile(sourceUrl, 'utf8')

  assert.match(source, /fetch\(`\$\{API_BASE\}\/api\/tickets\/events`,\s*\{/)
  assert.match(source, /Authorization:\s*`Bearer \$\{token\}`/)
  assert.match(source, /new AbortController\(\)/)
  assert.match(source, /MAX_RECONNECT_DELAY_MS/)
  assert.match(source, /MAX_RECONNECT_ATTEMPTS/)
  const connectSection = source.slice(source.indexOf('function connect()'))
  const tokenGuard = connectSection.indexOf('if (!getAuthToken()) return')
  const stateTransition = connectSection.indexOf('stopped = false')
  assert.notEqual(tokenGuard, -1)
  assert.ok(tokenGuard < stateTransition)
  assert.doesNotMatch(source, /new EventSource\s*\(/)
  assert.doesNotMatch(source, /[?&]token=/)
  assert.doesNotMatch(source, /encodeURIComponent\(token\)/)
})
