import mongoose from 'mongoose';
import { GameHistory } from '../models/GameHistory.js';
import { isDatabaseReady } from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export async function saveMatch(summary) {
  if (!isDatabaseReady()) return null;
  try {
    const doc = await GameHistory.create(summary);
    return doc.id;
  } catch (err) {
    logger.error('Could not save match history:', err.message);
    return null;
  }
}

export async function getMatch(id) {
  if (!isDatabaseReady()) throw new AppError('HISTORY_UNAVAILABLE', 'Match history is offline right now.', 503);
  if (!mongoose.isValidObjectId(id)) throw new AppError('NOT_FOUND', 'That match summary does not exist.', 404);
  const doc = await GameHistory.findById(id).lean();
  if (!doc) throw new AppError('NOT_FOUND', 'That match summary does not exist.', 404);
  const { _id, __v, ...rest } = doc;
  return { id: String(_id), ...rest };
}

export async function recentMatches(limit = 6) {
  if (!isDatabaseReady()) return [];
  const docs = await GameHistory.find({}, 'gameName headline finishedAt players').sort({ finishedAt: -1 }).limit(limit).lean();
  return docs.map(({ _id, players, ...rest }) => ({ id: String(_id), playerCount: players.length, ...rest }));
}
