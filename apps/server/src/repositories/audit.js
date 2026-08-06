import { randomId } from '../security/tokens.js';

export class AuditRepository {
  constructor(db) {
    this.db = db;
  }

  record({
    actor,
    actorRole,
    action,
    targetType,
    targetId,
    previousState,
    newState,
    requestId,
    ip,
    userAgent,
  }) {
    this.db
      .prepare(
        `INSERT INTO audit_events
          (id, actor, actor_role, action, target_type, target_id, previous_state, new_state, request_id, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomId(),
        actor,
        actorRole || null,
        action,
        targetType || null,
        targetId || null,
        previousState != null ? JSON.stringify(previousState) : null,
        newState != null ? JSON.stringify(newState) : null,
        requestId || null,
        ip || null,
        userAgent || null,
      );
  }

  listRecent(limit = 100) {
    return this.db
      .prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?')
      .all(limit);
  }

  list({ action, from, to, limit = 200 } = {}) {
    const clauses = [];
    const params = [];
    if (action) {
      clauses.push('action = ?');
      params.push(action);
    }
    if (from) {
      clauses.push('substr(created_at, 1, 10) >= ?');
      params.push(from);
    }
    if (to) {
      clauses.push('substr(created_at, 1, 10) <= ?');
      params.push(to);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db
      .prepare(`SELECT * FROM audit_events ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...params, limit);
  }
}
