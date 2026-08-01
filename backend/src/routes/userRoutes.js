import { Router } from 'express'
import * as userController from '../controllers/userController.js'
import { authorizePermission } from '../middleware/authMiddleware.js'

export const userRouter = Router()

const requireUsersRead = authorizePermission('users', 'read')
const requireUsersWrite = authorizePermission('users', 'write')

userRouter.get('/', requireUsersRead, userController.listUsers)
userRouter.post('/', requireUsersWrite, userController.storeUser)
userRouter.put('/:id', requireUsersWrite, userController.replaceUser)
userRouter.delete('/:id', requireUsersWrite, userController.destroyUser)
