import pino from 'pino';
import pinoHttp from 'pino-http';

export function createLogger(level = 'info') {
  return pino({
    level,
    base: { service: 'sweet-gonz-kiosk' },
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-csrf-token"]',
        'res.headers["set-cookie"]',
        'body.password',
        'body.receiptToken',
      ],
      censor: '[redacted]',
    },
  });
}

export function createHttpLogger(logger) {
  return pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/api/v1/health' || req.url?.startsWith('/api/v1/admin/events'),
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
        };
      },
    },
  });
}
