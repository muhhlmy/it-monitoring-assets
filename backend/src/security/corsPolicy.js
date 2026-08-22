/**
 * Determines whether a given request Origin header is permitted according to configured CORS origins.
 * Performs strict scheme, host, and port matching against normalized origins.
 */
export function isCorsOriginAllowed(origin, configuredOrigins) {
  if (!origin) {
    return true
  }

  const cleanOrigin = String(origin).trim().replace(/\/+$/, '')

  if (!Array.isArray(configuredOrigins) || configuredOrigins.length === 0) {
    return false
  }

  const cleanConfigured = configuredOrigins.map((o) => String(o).trim().replace(/\/+$/, ''))

  // Direct exact match
  if (cleanConfigured.includes(cleanOrigin)) {
    return true
  }

  // Parse origin URL safely
  try {
    const originUrl = new URL(cleanOrigin)
    const originProtocol = originUrl.protocol // e.g. 'http:' or 'https:'
    const originPort = originUrl.port || (originProtocol === 'https:' ? '443' : '80')
    const originHostname = originUrl.hostname

    for (const conf of cleanConfigured) {
      try {
        const confUrl = new URL(conf)
        const confProtocol = confUrl.protocol
        const confPort = confUrl.port || (confProtocol === 'https:' ? '443' : '80')
        const confHostname = confUrl.hostname

        // Protocol and port MUST match strictly
        if (originProtocol !== confProtocol || originPort !== confPort) {
          continue
        }

        // Exact hostname match
        if (originHostname === confHostname) {
          return true
        }

        // Bind-all (0.0.0.0) or localhost network alias support for local dev environments
        if (
          confHostname === '0.0.0.0' &&
          (originHostname === 'localhost' ||
            originHostname === '127.0.0.1' ||
            originHostname === '::1' ||
            originHostname.startsWith('192.168.') ||
            originHostname.startsWith('10.') ||
            originHostname.startsWith('172.') ||
            originHostname.endsWith('.local'))
        ) {
          return true
        }

        if (
          (confHostname === 'localhost' || confHostname === '127.0.0.1') &&
          ['localhost', '127.0.0.1', '::1'].includes(originHostname)
        ) {
          return true
        }
      } catch {
        // Skip invalid configured origin URL
      }
    }
  } catch {
    // Return false if request origin is malformed
    return false
  }

  return false
}
