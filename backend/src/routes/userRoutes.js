import { Router } from 'express'
import * as userController from '../controllers/userController.js'

export const userRouter = Router()

userRouter.get('/', userController.listUsers)
userRouter.post('/', userController.storeUser)
userRouter.put('/:id', userController.replaceUser)
userRouter.delete('/:id', userController.destroyUser)
