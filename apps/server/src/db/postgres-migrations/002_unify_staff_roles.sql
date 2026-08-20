-- 002_unify_staff_roles.sql
-- Replace station-specific account roles with one operational staff role.

ALTER TABLE app.admins DROP CONSTRAINT IF EXISTS admins_role_check;

UPDATE app.admins
SET role = 'staff'
WHERE role IN ('cashier', 'kitchen', 'serving');

ALTER TABLE app.admins
  ADD CONSTRAINT admins_role_check CHECK (role IN ('admin', 'staff'));

ALTER TABLE app.audit_events DROP CONSTRAINT IF EXISTS audit_events_actor_role_check;

UPDATE app.audit_events
SET actor_role = 'staff'
WHERE actor_role IN ('cashier', 'kitchen', 'serving');

ALTER TABLE app.audit_events
  ADD CONSTRAINT audit_events_actor_role_check
  CHECK (actor_role IS NULL OR actor_role IN ('admin', 'staff', 'kiosk', 'system'));
