import mongoose from 'mongoose';
import { env } from './environment.js';
import { logger } from '../utils/logger.js';

// MongoDB only stores finished-match history, so the game keeps working
// if it is unavailable; history endpoints report the outage instead.
export async function connectDatabase() {
  if (!env.mongoUri) {
    logger.warn('MONGODB_URI is not set; match history is disabled.');
    return false;
  }
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
    logger.info('Connected to MongoDB');
    return true;
  } catch (err) {
    logger.error('MongoDB connection failed:', err.message);
    return false;
  }
}

export const isDatabaseReady = () => mongoose.connection.readyState === 1;
