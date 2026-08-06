import rateLimit from 'express-rate-limit';
import { tooManyRequests } from '../utils/app-error.js';
import { LoginRateLimiter } from '../services/admin-auth.js';

/** General API rate limiter (per IP). */
export function apiRateLimit({ windowMs = 60_000, max = 300 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const err = tooManyRequests('Too many requests, please slow down', 60);
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
      res.status(429).json({
        error: { code: err.code, message: err.message },
        requestId: req.id || null,
      });
    },
  });
}

/**
 * Login limiter keyed by IP+username, counting FAILED attempts only
 * (5 per pair per 15 minutes). Success resets the pair.
 */
export function loginRateLimit({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const limiter = new LoginRateLimiter({ max, windowMs });
  return {
    limiter,
    middleware(req, res, next) {
      const username = req.body?.username || '';
      if (limiter.isBlocked(req.ip, username)) {
        const err = tooManyRequests(
          'Too many failed login attempts. Try again later.',
          limiter.retryAfterSeconds(req.ip, username),
        );
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
        return res.status(429).json({
          error: { code: err.code, message: err.message },
          requestId: req.id || null,
        });
      }
      req.loginLimiter = limiter;
      next();
    },
  };
}
