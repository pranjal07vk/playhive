import 'dotenv/config';

const list = (value) => (value || '').split(',').map((s) => s.trim()).filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || '',
  // Render sets RENDER_EXTERNAL_URL, so the deployed site always trusts itself.
  clientOrigins: [...list(process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173'), ...list(process.env.RENDER_EXTERNAL_URL)],
  // When set, Express also serves the built React app (single-service deploy).
  clientDist: process.env.CLIENT_DIST || '',
  publicClientUrl: process.env.PUBLIC_CLIENT_URL || 'http://localhost:5173',
};

export const isProduction = env.nodeEnv === 'production';
