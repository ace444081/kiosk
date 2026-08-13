import session from 'express-session';
import { SESSION_INACTIVITY_MS, SESSION_ABSOLUTE_MS } from '@kiosk/shared';

export class PostgresSessionStore extends session.Store {
  constructor(db, options = {}) {
    super(options);
    this.db = db;
    this.cleanupTimer = setInterval(() => this.prune(), 60 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  async prune() {
    try {
      await this.db.query('DELETE FROM admin_sessions WHERE expire < $1', [Date.now()]);
    } catch {
      // Cleanup must never break an active request.
    }
  }

  get(sid, callback) {
    this.db
      .one('SELECT sess, expire FROM admin_sessions WHERE sid = $1', [sid])
      .then((row) => {
        if (!row || row.expire < Date.now()) return this.destroy(sid, () => callback(null, null));
        const sess = typeof row.sess === 'string' ? JSON.parse(row.sess) : row.sess;
        if (sess.absExpiresAt && Date.now() > sess.absExpiresAt)
          return this.destroy(sid, () => callback(null, null));
        callback(null, sess);
      })
      .catch((error) => callback(error));
  }

  set(sid, sess, callback) {
    const expire = sess.cookie?.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + SESSION_INACTIVITY_MS;
    this.db
      .query(
        `INSERT INTO admin_sessions (sid, sess, expire) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
        [sid, JSON.stringify(sess), expire],
      )
      .then(() => callback?.(null))
      .catch((error) => callback?.(error));
  }

  destroy(sid, callback) {
    this.db
      .query('DELETE FROM admin_sessions WHERE sid = $1', [sid])
      .then(() => callback?.(null))
      .catch((error) => callback?.(error));
  }

  touch(sid, sess, callback) {
    const expire = sess.cookie?.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + SESSION_INACTIVITY_MS;
    this.db
      .query('UPDATE admin_sessions SET sess = $1::jsonb, expire = $2 WHERE sid = $3', [
        JSON.stringify(sess),
        expire,
        sid,
      ])
      .then(() => callback?.(null))
      .catch((error) => callback?.(error));
  }

  close() {
    clearInterval(this.cleanupTimer);
  }

  static get ABSOLUTE_MS() {
    return SESSION_ABSOLUTE_MS;
  }
}
