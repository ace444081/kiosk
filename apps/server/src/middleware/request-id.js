import crypto from 'node:crypto';

export function requestIdMiddleware(req, res, next) {
  const header = req.headers['x-request-id'];
  req.id = typeof header === 'string' && header.length <= 64 ? header : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
