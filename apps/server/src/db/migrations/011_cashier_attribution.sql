-- 011_cashier_attribution.sql
-- Persist the staff account that confirms a cash payment for reporting.

ALTER TABLE orders ADD COLUMN payment_confirmed_by TEXT;

UPDATE orders
SET payment_confirmed_by = (
  SELECT actor
  FROM audit_events
  WHERE action = 'CASH_CONFIRMED'
    AND target_type = 'order'
    AND target_id = orders.id
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE payment_status = 'cash_received';

CREATE INDEX idx_orders_payment_confirmed_by
  ON orders(payment_confirmed_by, business_date, payment_status);
