import rateLimit from 'express-rate-limit';

const handler = (req, res) =>
  res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Whoa, slow down! Try again in a minute.' } });

export const apiLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, handler });
// Creating and joining rooms is the expensive, abusable path.
export const roomWriteLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, handler });
