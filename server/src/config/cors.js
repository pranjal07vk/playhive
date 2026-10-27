import { env } from './environment.js';

// Shared by Express and Socket.IO so both accept exactly the same origins.
export const corsOptions = {
  origin(origin, callback) {
    if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed`));
  },
  credentials: false,
};
