-- 006_repair_unpaid_preparation.sql
-- Enforce the new payment-before-preparation rule for rows created by older builds.

UPDATE orders
SET status = 'placed',
    preparing_at = NULL,
    version = version + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE status IN ('preparing', 'ready')
  AND payment_status = 'pending_cash';
