/**
 * Application error with a stable machine-readable code and HTTP status.
 */
export class AppError extends Error {
  constructor(status, code, message, fieldErrors = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function badRequest(code, message, fieldErrors) {
  return new AppError(400, code, message, fieldErrors);
}

export function unauthorized(code = 'UNAUTHORIZED', message = 'Authentication required') {
  return new AppError(401, code, message);
}

export function forbidden(code = 'CSRF_INVALID', message = 'Invalid CSRF token') {
  return new AppError(403, code, message);
}

export function notFound(code = 'NOT_FOUND', message = 'Not found') {
  return new AppError(404, code, message);
}

export function conflict(code, message, extra = {}) {
  const err = new AppError(409, code, message);
  err.extra = extra;
  return err;
}

export function tooManyRequests(message = 'Too many attempts', retryAfterSeconds = 60) {
  const err = new AppError(429, 'RATE_LIMITED', message);
  err.retryAfterSeconds = retryAfterSeconds;
  return err;
}
