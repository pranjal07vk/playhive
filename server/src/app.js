import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from './config/environment.js';
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
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
          'connect-src': ["'self'", 'wss:', 'ws:'],
          'img-src': ["'self'", 'data:'],
          'worker-src': ["'self'", 'blob:'],
        },
      },
    }),
  );
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '20kb' }));

  app.use('/api/health', healthRoutes);
  app.use('/api', apiLimiter);
  app.use('/api', roomRoutes);
  app.use('/api/history', historyRoutes);

  const dist = env.clientDist && resolve(env.clientDist);
  if (dist && existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    // Client-side routes (/room/K7Q2M, /games…) all load the React app.
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(resolve(dist, 'index.html')));
  } else {
    app.get('/', (req, res) => res.json({ ok: true, name: 'PlayHive API', health: '/api/health' }));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
