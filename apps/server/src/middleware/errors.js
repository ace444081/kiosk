import { AppError } from '../utils/app-error.js';

/**
 * Consistent error envelope:
 * { error: { code, message, fieldErrors }, requestId }
 */
export function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    const requestId = req.id || null;

    if (err instanceof AppError) {
      if (err.status >= 500) logger.error({ err, requestId, url: req.originalUrl }, 'app error');
      const body = {
        error: {
          code: err.code,
          message: err.message,
        },
        requestId,
      };
      if (err.fieldErrors && Object.keys(err.fieldErrors).length) {
        body.error.fieldErrors = err.fieldErrors;
      }
      if (
        err.code === 'STALE_VERSION' ||
        err.code === 'INVALID_TRANSITION' ||
        err.code === 'INVALID_PAYMENT_STATE' ||
        err.code === 'PREPARING_PAYMENT_REQUIRED' ||
        err.code === 'PAYMENT_NOT_CONFIRMED'
      ) {
        body.order = err.extra?.order || undefined;
      }
      if (err.retryAfterSeconds) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
      }
      return res.status(err.status).json(body);
    }

    if (err?.type === 'entity.too.large') {
      return res.status(413).json({
        error: { code: 'BAD_REQUEST', message: 'Request body too large' },
        requestId,
      });
    }

    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' },
        requestId,
      });
    }

    logger.error({ err, requestId, url: req.originalUrl }, 'unhandled error');
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      requestId,
    });
  };
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
    requestId: req.id || null,
  });
}

export function zodErrorToEnvelope(error) {
  const fieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { code: 'VALIDATION_ERROR', message: 'Request validation failed', fieldErrors };
}
