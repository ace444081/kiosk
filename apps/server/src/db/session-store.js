import session from 'express-session';
import { SESSION_INACTIVITY_MS, SESSION_ABSOLUTE_MS } from '@kiosk/shared';

/**
 * SQLite-backed express-session store.
 *
 * - `expire` column mirrors the cookie expiry so stale rows can be pruned.
 * - The session payload carries `absExpiresAt`; sessions older than 8 hours
 *   are treated as expired regardless of rolling activity.
 */
export class SqliteSessionStore extends session.Store {
  constructor(db, options = {}) {
    super(options);
    this.db = db;
    this.cleanupTimer = setInterval(() => this.prune(), 60 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  prune() {
    try {
      this.db.prepare('DELETE FROM admin_sessions WHERE expire < ?').run(Date.now());
    } catch {
      // Never let cleanup break the request cycle.
    }
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare('SELECT sess, expire FROM admin_sessions WHERE sid = ?').get(sid);
      if (!row) return callback(null, null);
      if (row.expire < Date.now()) {
        this.destroy(sid, () => callback(null, null));
        return;
      }
      let sess;
      try {
        sess = JSON.parse(row.sess);
      } catch {
        return this.destroy(sid, () => callback(null, null));
      }
      if (sess.absExpiresAt && Date.now() > sess.absExpiresAt) {
        return this.destroy(sid, () => callback(null, null));
      }
      callback(null, sess);
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sess, callback) {
    try {
      const expire = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + SESSION_INACTIVITY_MS;
      this.db
        .prepare(
          `INSERT INTO admin_sessions (sid, sess, expire) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire`,
        )
        .run(sid, JSON.stringify(sess), expire);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid, callback) {
    try {
      this.db.prepare('DELETE FROM admin_sessions WHERE sid = ?').run(sid);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid, sess, callback) {
    try {
      const expire = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + SESSION_INACTIVITY_MS;
      this.db
        .prepare('UPDATE admin_sessions SET sess = ?, expire = ? WHERE sid = ?')
        .run(JSON.stringify(sess), expire, sid);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  /** Convenience for tests: absolute session lifetime constant. */
  static get ABSOLUTE_MS() {
    return SESSION_ABSOLUTE_MS;
  }
}
