import { Router } from 'express'
import {
  listTickets,
  getTicketStats,
  getTicketCaspStats,
  getCaspTrend,
  getTicketHistory,
  getTicketComments,
  getTicketAttachment,
  getTicketCommentAttachment,
  createTicketComment,
  createTicket,
  updateTicket,
  claimTicket,
  reassignTicket,
  deleteTicket,
  getTicketCasp,
  submitTicketCasp,
  streamTicketEvents
} from '../controllers/ticketController.js'
import { authorizeRoles } from '../middleware/authMiddleware.js'
import { requireTicketIdentity } from '../middleware/ticketIdentityMiddleware.js'

export const ticketRouter = Router()

const requireAdmin = authorizeRoles('admin', 'super admin', 'superadmin')

ticketRouter.use(requireTicketIdentity)

ticketRouter.get('/events',         streamTicketEvents)
ticketRouter.get('/stats',          getTicketStats)
ticketRouter.get('/casp/stats',     getTicketCaspStats)
ticketRouter.get('/casp/trend',     getCaspTrend)
ticketRouter.get('/',               listTickets)
ticketRouter.get('/:id/attachment', getTicketAttachment)
ticketRouter.get('/:id/history',    getTicketHistory)
ticketRouter.get('/:id/comments',   getTicketComments)
ticketRouter.get('/:id/comments/:commentId/attachment', getTicketCommentAttachment)
ticketRouter.post('/:id/comments',  createTicketComment)
ticketRouter.get('/:id/casp',       getTicketCasp)
ticketRouter.post('/:id/casp',      submitTicketCasp)
ticketRouter.post('/:id/claim',     requireAdmin, claimTicket)
ticketRouter.post('/:id/reassign',  requireAdmin, reassignTicket)
ticketRouter.post('/',              createTicket)
ticketRouter.put('/:id',            requireAdmin, updateTicket)
ticketRouter.delete('/:id',         requireAdmin, deleteTicket)
