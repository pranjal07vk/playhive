import { isDatabaseReady } from '../config/database.js';
import { roomCount } from '../services/roomService.js';

export function health(req, res) {
  res.json({ ok: true, status: 'up', database: isDatabaseReady() ? 'connected' : 'offline', activeRooms: roomCount(), time: Date.now() });
}
