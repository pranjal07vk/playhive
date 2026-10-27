import { AppError, toClientError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function notFound(req, res) {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'That endpoint does not exist.' } });
}

// Express recognises error handlers by their four arguments.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: { code: 'BAD_JSON', message: 'The request body is not valid JSON.' } });
  }
  if (!(err instanceof AppError)) logger.error(err);
  res.status(err.status || 500).json({ ok: false, error: toClientError(err) });
}
