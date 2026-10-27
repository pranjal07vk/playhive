import { createServer } from 'node:http';
import { env } from './config/environment.js';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { createSocketServer } from './sockets/index.js';
import { cleanupRooms } from './services/roomService.js';
import { logger } from './utils/logger.js';

const httpServer = createServer(createApp());
createSocketServer(httpServer);

setInterval(cleanupRooms, 60_000).unref();
connectDatabase();

httpServer.listen(env.port, () => logger.info(`PlayHive API listening on port ${env.port}`));

const shutdown = () => httpServer.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
