import { Router } from 'express';
import * as rooms from '../controllers/roomController.js';
import { validateBody } from '../middleware/validateRequest.js';
import { roomWriteLimiter } from '../middleware/rateLimiter.js';

const router = Router();
router.get('/games', rooms.listGamesHandler);
router.post('/rooms', roomWriteLimiter, validateBody(['name', 'gameId', 'settings']), rooms.createRoom);
router.get('/rooms/:code', rooms.getRoom);
router.post('/rooms/:code/join', roomWriteLimiter, validateBody(['name']), rooms.joinRoom);
export default router;
