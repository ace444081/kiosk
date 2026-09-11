-- Account profiles, station roles, optimistic versions, and durable product
-- photo storage. Existing admin/staff accounts remain valid.

DROP INDEX IF EXISTS idx_admins_username_nocase;

ALTER TABLE admins RENAME TO admins_legacy;

CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff'
    CHECK (role IN ('admin','staff','cashier','kitchen','serving')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  full_name TEXT NOT NULL DEFAULT '',
  employee_id TEXT,
  email TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0,1)),
  last_login_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO admins (
  id, username, password_hash, role, is_active, full_name, employee_id, email,
  must_change_password, last_login_at, version, created_at, updated_at
)
SELECT
  id,
  username,
  password_hash,
  CASE WHEN role = 'admin' THEN 'admin' ELSE 'staff' END,
  is_active,
  username,
  NULL,
  NULL,
  0,
  NULL,
  1,
  created_at,
  updated_at
FROM admins_legacy;

DROP TABLE admins_legacy;

CREATE UNIQUE INDEX idx_admins_username_nocase ON admins(username COLLATE NOCASE);
CREATE UNIQUE INDEX idx_admins_employee_id ON admins(employee_id) WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX idx_admins_email_nocase ON admins(email COLLATE NOCASE) WHERE email IS NOT NULL;

CREATE TABLE product_images (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/webp','image/jpeg','image/png')),
  image_data BLOB NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
