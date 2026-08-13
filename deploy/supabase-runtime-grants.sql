-- Apply this once with the Supabase migration-owner connection after creating
-- a least-privilege runtime role. Replace kiosk_runtime with that role name.
-- Never commit the role password or a DATABASE_URL.

GRANT USAGE ON SCHEMA app TO kiosk_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO kiosk_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO kiosk_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kiosk_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO kiosk_runtime;
