import 'dotenv/config';

const list = (value) => (value || '').split(',').map((s) => s.trim()).filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || '',
  clientOrigins: list(process.env.CLIENT_ORIGINS || 'http://localhost:5173'),
  publicClientUrl: process.env.PUBLIC_CLIENT_URL || 'http://localhost:5173',
};

export const isProduction = env.nodeEnv === 'production';
