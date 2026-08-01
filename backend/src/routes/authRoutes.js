import express from 'express';
import { login, getMe } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { loginRateLimiter } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

router.post('/login', loginRateLimiter, login);
router.get('/me', authenticateToken, getMe);

export default router;
