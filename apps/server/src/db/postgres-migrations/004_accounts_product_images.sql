-- Account profiles, station roles, optimistic versions, and durable product
-- photo storage. Existing admin/staff accounts remain valid.

ALTER TABLE app.admins ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE app.admins ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE app.admins ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE app.admins ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app.admins ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE app.admins ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

UPDATE app.admins
SET full_name = username
WHERE full_name IS NULL OR btrim(full_name) = '';

ALTER TABLE app.admins DROP CONSTRAINT IF EXISTS admins_role_check;
ALTER TABLE app.admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('admin','staff','cashier','kitchen','serving'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_admins_employee_id
  ON app.admins(employee_id) WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_admins_email_lower
  ON app.admins(LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.product_images (
  product_id TEXT PRIMARY KEY REFERENCES app.products(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/webp','image/jpeg','image/png')),
  image_data BYTEA NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_product_images_updated
  ON app.product_images(updated_at DESC);

-- The deployed runtime role is intentionally restricted, but it still needs
-- CRUD access to the new image table used by the API.
GRANT SELECT, INSERT, UPDATE, DELETE ON app.product_images TO kiosk_runtime;
