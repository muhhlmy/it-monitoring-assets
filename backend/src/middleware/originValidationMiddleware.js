import { env } from '../config/env.js'
import { isCorsOriginAllowed } from '../security/corsPolicy.js'

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Middleware to enforce strict Origin and Referer validation on state-changing HTTP requests.
 * Prevents cross-origin request forgery attempts from untrusted origins.
 */
export function requireSafeOrigin(req, res, next) {
  const method = (req.method || '').toUpperCase()

  // Only state-changing methods require origin validation
  if (!STATE_CHANGING_METHODS.has(method)) {
    return next()
  }

  const originHeader = req.headers.origin
  const refererHeader = req.headers.referer

  let candidateOrigin = null

  if (typeof originHeader === 'string' && originHeader.trim().length > 0) {
    candidateOrigin = originHeader.trim()
  } else if (typeof refererHeader === 'string' && refererHeader.trim().length > 0) {
    try {
      candidateOrigin = new URL(refererHeader).origin
    } catch {
      // Invalid referer URL format
      return res.status(403).json({
        message: 'Format Referer header tidak valid.',
      })
    }
  }

  // If request originates from a browser with Origin/Referer header present
  if (candidateOrigin) {
    if (!isCorsOriginAllowed(candidateOrigin, env.corsOrigins)) {
      console.warn(
        `[Origin Blocked] Method: ${method} Path: ${req.path} Origin: "${candidateOrigin}"`,
      )
      return res.status(403).json({
        message: 'Permintaan tidak diizinkan oleh kebijakan Origin.',
      })
    }
  }

  // Non-browser API clients (without Origin header) or trusted origins proceed to Auth & RBAC
  next()
}
