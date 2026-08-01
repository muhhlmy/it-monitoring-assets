import {
  createTicketIdentity,
  hasTicketReadPermission,
} from '../services/ticketAccessService.js'

/**
 * Attach one canonical ticket identity before any ticket controller executes.
 * Unknown roles, malformed IDs, and explicit/missing ticket permission fail
 * closed. The JWT remains the authenticated source for this slice.
 */
export function requireTicketIdentity(req, res, next) {
  const identity = createTicketIdentity(req.user)
  if (!identity.valid || !hasTicketReadPermission(identity)) {
    return res.status(403).json({ message: 'Anda tidak memiliki akses ke fitur tiket.' })
  }

  req.ticketIdentity = identity
  next()
}
