-- 010_unify_staff_roles.sql
-- Replace station-specific account roles with one operational staff role.

DROP INDEX IF EXISTS idx_admins_username_nocase;
DROP INDEX IF EXISTS idx_audit_created_at;
DROP INDEX IF EXISTS idx_audit_created_date;
DROP INDEX IF EXISTS idx_audit_events_deployment_created;

ALTER TABLE admins RENAME TO admins_legacy;

CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','staff'))
);

INSERT INTO admins (id, username, password_hash, is_active, created_at, updated_at, role)
SELECT id, username, password_hash, is_active, created_at, updated_at,
       CASE WHEN role = 'admin' THEN 'admin' ELSE 'staff' END
FROM admins_legacy;

DROP TABLE admins_legacy;

CREATE UNIQUE INDEX idx_admins_username_nocase
  ON admins(username COLLATE NOCASE);

ALTER TABLE audit_events RENAME TO audit_events_legacy;

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  actor_role TEXT CHECK (actor_role IS NULL OR actor_role IN ('admin','staff','kiosk','system')),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  previous_state TEXT,
  new_state TEXT,
  request_id TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deployment_id TEXT NOT NULL DEFAULT 'local-primary'
);

INSERT INTO audit_events
  (id, actor, actor_role, action, target_type, target_id, previous_state,
   new_state, request_id, ip, user_agent, created_at, deployment_id)
SELECT id, actor,
       CASE WHEN actor_role IN ('cashier','kitchen','serving') THEN 'staff' ELSE actor_role END,
       action, target_type, target_id, previous_state, new_state,
       request_id, ip, user_agent, created_at, deployment_id
FROM audit_events_legacy;

DROP TABLE audit_events_legacy;

CREATE INDEX idx_audit_created_at ON audit_events(created_at DESC);
CREATE INDEX idx_audit_created_date ON audit_events(substr(created_at, 1, 10), created_at DESC);
CREATE INDEX idx_audit_events_deployment_created
  ON audit_events(deployment_id, created_at);
