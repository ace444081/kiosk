-- 005_order_timing.sql
-- Preparation timing starts at the first server-confirmed preparing transition.

ALTER TABLE orders ADD COLUMN preparing_at TEXT;

-- Existing demo rows predate this timestamp. Keep their visible timing usable
-- by using the last known order update as the closest available start point.
UPDATE orders
SET preparing_at = updated_at
WHERE status IN ('preparing', 'ready')
  AND preparing_at IS NULL;

CREATE INDEX idx_orders_preparing_at ON orders(preparing_at);
