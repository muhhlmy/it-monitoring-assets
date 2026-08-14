export function isCorsOriginAllowed(origin, configuredOrigins) {
  if (!origin) {
    return true
  }

  const cleanOrigin = String(origin).trim().replace(/\/+$/, '')

  if (!Array.isArray(configuredOrigins)) {
    return false
  }

  const cleanConfigured = configuredOrigins.map((o) => String(o).trim().replace(/\/+$/, ''))

  if (cleanConfigured.includes(cleanOrigin)) {
    return true
  }

  const hasLocalhostOrBindAll = cleanConfigured.some((o) =>
    o.includes('localhost') || o.includes('127.0.0.1') || o.includes('0.0.0.0'),
  )

  if (hasLocalhostOrBindAll) {
    try {
      const url = new URL(cleanOrigin)
      const hostname = url.hostname
      if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) {
        return true
      }
      if (
        cleanConfigured.some((o) => o.includes('0.0.0.0')) &&
        (hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.') ||
          hostname.endsWith('.local'))
      ) {
        return true
      }
    } catch {
      // Ignore URL parse errors
    }
  }

  return false
}
