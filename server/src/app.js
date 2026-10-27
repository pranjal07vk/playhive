import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { corsOptions } from './config/cors.js';
import healthRoutes from './routes/healthRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '20kb' }));

  app.get('/', (req, res) => res.json({ ok: true, name: 'PlayHive API', health: '/api/health' }));
  app.use('/api/health', healthRoutes);
  app.use('/api', apiLimiter);
  app.use('/api', roomRoutes);
  app.use('/api/history', historyRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
