-- 003_cashier_attribution.sql
-- Persist the staff account that confirms a cash payment for reporting.

ALTER TABLE app.orders ADD COLUMN payment_confirmed_by TEXT;

UPDATE app.orders o
SET payment_confirmed_by = (
  SELECT actor
  FROM app.audit_events e
  WHERE e.action = 'CASH_CONFIRMED'
    AND e.target_type = 'order'
    AND e.target_id = o.id
  ORDER BY e.created_at ASC
  LIMIT 1
)
WHERE o.payment_status = 'cash_received';

CREATE INDEX IF NOT EXISTS idx_app_orders_payment_confirmed_by
  ON app.orders(payment_confirmed_by, business_date, payment_status);
