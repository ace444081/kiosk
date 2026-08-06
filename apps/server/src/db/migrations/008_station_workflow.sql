-- 008_station_workflow.sql
-- Role-based restaurant stations and explicit workflow timestamps.

ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'
  CHECK (role IN ('admin','cashier','kitchen','serving'));

ALTER TABLE orders ADD COLUMN payment_confirmed_at TEXT;
ALTER TABLE orders ADD COLUMN ready_at TEXT;
ALTER TABLE audit_events ADD COLUMN actor_role TEXT
  CHECK (actor_role IS NULL OR actor_role IN ('admin','cashier','kitchen','serving','kiosk','system'));

-- Preserve history without pretending to know timestamps that were not
-- recorded. updated_at is the closest known transition time for old rows.
UPDATE orders
SET payment_confirmed_at = CASE
  WHEN payment_status = 'demo_confirmed' THEN created_at
  ELSE updated_at
END
WHERE payment_status IN ('cash_received','demo_confirmed')
  AND payment_confirmed_at IS NULL;

UPDATE orders
SET ready_at = updated_at
WHERE status IN ('ready','completed')
  AND ready_at IS NULL;

UPDATE audit_events SET actor_role = 'kiosk'
WHERE actor = 'kiosk' AND actor_role IS NULL;

UPDATE audit_events SET actor_role = 'admin'
WHERE actor <> 'kiosk' AND actor_role IS NULL;

CREATE INDEX idx_orders_cashier_queue
  ON orders(payment_status, status, created_at, daily_sequence);

CREATE INDEX idx_orders_kitchen_queue
  ON orders(status, payment_status, created_at, daily_sequence);

CREATE INDEX idx_orders_serving_queue
  ON orders(status, ready_at, created_at, daily_sequence);

CREATE INDEX idx_orders_public_board
  ON orders(business_date, status, completed_at, created_at);
