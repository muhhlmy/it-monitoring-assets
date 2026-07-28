import { Router } from 'express'
import {
  listTickets,
  getTicketStats,
  getTicketHistory,
  getTicketComments,
  createTicketComment,
  createTicket,
  updateTicket,
  deleteTicket
} from '../controllers/ticketController.js'
import { authorizeRoles } from '../middleware/authMiddleware.js'

export const ticketRouter = Router()

const requireAdmin = authorizeRoles('admin', 'super admin', 'superadmin')

ticketRouter.get('/stats', getTicketStats)
ticketRouter.get('/', listTickets)
ticketRouter.get('/:id/history', getTicketHistory)
ticketRouter.get('/:id/comments', getTicketComments)
ticketRouter.post('/:id/comments', createTicketComment)
ticketRouter.post('/', requireAdmin, createTicket)
ticketRouter.put('/:id', requireAdmin, updateTicket)
ticketRouter.delete('/:id', requireAdmin, deleteTicket)
