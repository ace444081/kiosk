-- Identify the runtime that created or changed a record during local/cloud
-- cutover. Existing SQLite records retain the local-primary default.

ALTER TABLE orders ADD COLUMN deployment_id TEXT NOT NULL DEFAULT 'local-primary';
ALTER TABLE audit_events ADD COLUMN deployment_id TEXT NOT NULL DEFAULT 'local-primary';

CREATE INDEX idx_orders_deployment_date
  ON orders(deployment_id, business_date, created_at);

CREATE INDEX idx_audit_events_deployment_created
  ON audit_events(deployment_id, created_at);
