const DEFAULT_MAX_ENTRIES = 10_000

function getClientIp(req) {
  if (typeof req.ip === 'string' && req.ip) return req.ip
  if (typeof req.socket?.remoteAddress === 'string' && req.socket.remoteAddress) {
    return req.socket.remoteAddress
  }
  return 'unknown'
}

function normalizedLoginEmail(req) {
  const email = req.body?.email
  return typeof email === 'string' && email.trim()
    ? email.trim().toLowerCase().slice(0, 150)
    : null
}

export function createBoundedRateLimiter({
  windowMs,
  max,
  maxEntries = DEFAULT_MAX_ENTRIES,
  keyGenerator,
  now = Date.now,
  message = 'Terlalu banyak permintaan. Silakan coba lagi nanti.',
}) {
  if (!Number.isSafeInteger(windowMs) || windowMs <= 0) throw new TypeError('windowMs tidak valid')
  if (!Number.isSafeInteger(max) || max <= 0) throw new TypeError('max tidak valid')
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
    throw new TypeError('maxEntries tidak valid')
  }
  if (typeof keyGenerator !== 'function') throw new TypeError('keyGenerator wajib berupa function')

  const buckets = new Map()

  function pruneExpired(currentTime) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= currentTime) buckets.delete(key)
    }
  }

  function makeRoom(currentTime) {
    if (buckets.size < maxEntries) return
    pruneExpired(currentTime)
    if (buckets.size < maxEntries) return

    const oldestKey = buckets.keys().next().value
    if (oldestKey !== undefined) buckets.delete(oldestKey)
  }

  const middleware = (req, res, next) => {
    const currentTime = now()
    const generatedKeys = keyGenerator(req)
    const keys = [...new Set((Array.isArray(generatedKeys) ? generatedKeys : [generatedKeys]).filter(Boolean))]
    if (keys.length === 0) keys.push('anonymous')

    let remaining = max
    let resetAt = currentTime + windowMs
    let blocked = false

    for (const key of keys) {
      let bucket = buckets.get(key)
      if (!bucket || bucket.resetAt <= currentTime) {
        if (!bucket) makeRoom(currentTime)
        bucket = { count: 0, resetAt: currentTime + windowMs }
      } else {
        // Refresh insertion order so bounded eviction behaves as an LRU.
        buckets.delete(key)
      }

      bucket.count += 1
      buckets.set(key, bucket)
      remaining = Math.min(remaining, Math.max(0, max - bucket.count))
      resetAt = Math.min(resetAt, bucket.resetAt)
      if (bucket.count > max) blocked = true
    }

    const resetSeconds = Math.max(1, Math.ceil((resetAt - currentTime) / 1000))
    res.setHeader?.('RateLimit-Limit', String(max))
    res.setHeader?.('RateLimit-Remaining', String(remaining))
    res.setHeader?.('RateLimit-Reset', String(resetSeconds))

    if (blocked) {
      res.setHeader?.('Retry-After', String(resetSeconds))
      return res.status(429).json({ message })
    }
    return next()
  }

  middleware.reset = () => buckets.clear()
  middleware.size = () => buckets.size
  return middleware
}

export const apiRateLimiter = createBoundedRateLimiter({
  windowMs: 60_000,
  max: 600,
  keyGenerator: (req) => `api:ip:${getClientIp(req)}`,
})

export const loginRateLimiter = createBoundedRateLimiter({
  windowMs: 15 * 60_000,
  max: 10,
  keyGenerator: (req) => {
    const ipKey = `login:ip:${getClientIp(req)}`
    const email = normalizedLoginEmail(req)
    return email ? [ipKey, `login:account:${email}`] : [ipKey]
  },
  message: 'Terlalu banyak percobaan login. Silakan coba lagi nanti.',
})

