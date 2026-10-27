import { AppError } from '../utils/errors.js';

// Rejects bodies that are not plain objects or carry unexpected keys.
export const validateBody = (allowedKeys) => (req, res, next) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return next(new AppError('INVALID_BODY', 'Expected a JSON object.'));
  }
  const extra = Object.keys(body).filter((k) => !allowedKeys.includes(k));
  if (extra.length) return next(new AppError('INVALID_BODY', `Unexpected field: ${extra[0]}`));
  return next();
};
