import { unauthorized, forbidden } from '../utils/app-error.js';
import { AdminAuthService } from '../services/admin-auth.js';

/** Require an authenticated admin session. */
export function requireAuth(req, res, next) {
  if (!req.session?.adminId) {
    return next(unauthorized('UNAUTHORIZED', 'Authentication required'));
  }
  next();
}

/** Resolve the account on every request so pre-migration sessions gain roles. */
export function resolveStaff(source) {
  return (req, res, next) => {
    if (!req.session?.adminId) return next(unauthorized('UNAUTHORIZED', 'Authentication required'));
    Promise.resolve(
      typeof source.findById === 'function'
        ? source.findById(req.session.adminId)
        : source
            .prepare('SELECT id, username, role, is_active FROM admins WHERE id = ?')
            .get(req.session.adminId),
    )
      .then((account) => {
        if (!account || account.is_active !== 1) {
          return next(unauthorized('UNAUTHORIZED', 'Authentication required'));
        }
        req.staff = account;
        req.session.username = account.username;
        req.session.role = account.role;
        next();
      })
      .catch(next);
  };
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.staff || !roles.includes(req.staff.role)) {
      return next(forbidden('FORBIDDEN', 'Your role cannot perform this action'));
    }
    next();
  };
}

/**
 * CSRF protection for authenticated mutations: the session carries a token
 * issued at login; mutations must echo it in the X-CSRF-Token header.
 * Same-origin policy (strict) is enforced via Helmet; this is the second
 * layer for cookie-based sessions.
 */
export function requireCsrf(req, res, next) {
  const headerToken = req.get('X-CSRF-Token');
  if (!AdminAuthService.csrfMatches(req.session?.csrfToken, headerToken)) {
    return next(forbidden('CSRF_INVALID', 'Missing or invalid CSRF token'));
  }
  next();
}

/** Cache-Control: no-store for authenticated/admin responses. */
export function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
