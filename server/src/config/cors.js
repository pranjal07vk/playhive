import { env } from './environment.js';

// Shared by Express and Socket.IO so both accept exactly the same origins.
export const corsOptions = {
  origin(origin, callback) {
    // Unknown origins get no CORS headers, so browsers block cross-site
    // reads, while same-origin requests (the deployed app) still work.
    return callback(null, !origin || env.clientOrigins.includes(origin));
  },
  credentials: false,
};
