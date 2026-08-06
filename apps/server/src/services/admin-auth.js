import bcrypt from 'bcryptjs';
import { AdminRepository } from '../repositories/admins.js';
import { AuditRepository } from '../repositories/audit.js';
import { generateToken, timingSafeEqualString } from '../security/tokens.js';
import { unauthorized } from '../utils/app-error.js';

/**
 * Login-rate limiting: max failed attempts per IP+username pair per window.
 * Success resets the pair; failures are counted. Purely in-memory (single
 * supervised kiosk server, LAN only).
 */
export class LoginRateLimiter {
  constructor({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.attempts = new Map();
    this.pruneTimer = setInterval(() => this.prune(), 60_000);
    this.pruneTimer.unref?.();
  }

  key(ip, username) {
    return `${ip}:${String(username).toLowerCase()}`;
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.attempts) {
      if (now > entry.resetAt) this.attempts.delete(key);
    }
  }

  isBlocked(ip, username) {
    const entry = this.attempts.get(this.key(ip, username));
    if (!entry) return false;
    if (Date.now() > entry.resetAt) {
      this.attempts.delete(this.key(ip, username));
      return false;
    }
    return entry.count >= this.max;
  }

  retryAfterSeconds(ip, username) {
    const entry = this.attempts.get(this.key(ip, username));
    if (!entry) return 0;
    return Math.max(0, Math.ceil((entry.resetAt - Date.now()) / 1000));
  }

  recordFailure(ip, username) {
    const key = this.key(ip, username);
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry || now > entry.resetAt) {
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count += 1;
    }
  }

  recordSuccess(ip, username) {
    this.attempts.delete(this.key(ip, username));
  }
}

export class AdminAuthService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
    this.admins = new AdminRepository(db);
    this.audit = new AuditRepository(db);
  }

  /**
   * Attempt login. Returns { username, csrfToken, expiresAt } on success.
   * The response is intentionally generic for unknown users and wrong
   * passwords alike.
   */
  login({ username, password, ip, userAgent, requestId }) {
    const admin = this.admins.findByUsername(username);
    const valid =
      admin && admin.is_active === 1 && bcrypt.compareSync(password, admin.password_hash);

    if (!valid) {
      this.audit.record({
        actor: username || 'unknown',
        actorRole: admin?.role || null,
        action: 'ADMIN_LOGIN_FAILED',
        targetType: 'admin',
        targetId: admin?.id || null,
        requestId,
        ip,
        userAgent,
      });
      throw unauthorized('INVALID_CREDENTIALS', 'Invalid username or password');
    }

    this.audit.record({
      actor: admin.username,
      actorRole: admin.role,
      action: 'ADMIN_LOGIN_SUCCESS',
      targetType: 'admin',
      targetId: admin.id,
      requestId,
      ip,
      userAgent,
    });
    return { adminId: admin.id, username: admin.username, role: admin.role };
  }

  /** Attach session state after a successful login. */
  establishSession(req, admin) {
    return new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        req.session.adminId = admin.adminId;
        req.session.username = admin.username;
        req.session.role = admin.role;
        req.session.csrfToken = generateToken(32);
        req.session.absExpiresAt = Date.now() + 8 * 60 * 60 * 1000;
        req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
      });
    });
  }

  logout({ req, requestId, ip, userAgent }) {
    const actor = req.session?.username || 'unknown';
    const actorRole = req.session?.role || null;
    return new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) return reject(err);
        this.audit.record({
          actor,
          actorRole,
          action: 'ADMIN_LOGOUT',
          targetType: 'admin-session',
          requestId,
          ip,
          userAgent,
        });
        resolve();
      });
    });
  }

  static hashPassword(password) {
    return bcrypt.hashSync(password, 12);
  }

  static verifyPassword(password, hash) {
    return bcrypt.compareSync(password, hash);
  }

  static csrfMatches(sessionToken, headerToken) {
    if (!sessionToken || !headerToken) return false;
    return timingSafeEqualString(sessionToken, headerToken);
  }
}
