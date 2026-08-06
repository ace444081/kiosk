-- 007_integrity_polish.sql
-- Additive integrity and query-performance safeguards. Historical order
-- snapshots remain intentionally denormalized and are not rewritten.

-- Match the application's case-insensitive username lookup and slug rules.
CREATE UNIQUE INDEX idx_admins_username_nocase
  ON admins(username COLLATE NOCASE);

CREATE UNIQUE INDEX idx_products_sku_nocase
  ON products(sku COLLATE NOCASE);

-- Receipt hashes are opaque lookup keys and must identify one order only.
CREATE UNIQUE INDEX idx_orders_receipt_token_hash
  ON orders(receipt_token_hash);

-- A selected customization is represented once per order-item snapshot.
CREATE UNIQUE INDEX idx_order_item_addons_unique
  ON order_item_addons(order_item_id, addon_id);

CREATE UNIQUE INDEX idx_order_item_options_unique
  ON order_item_options(order_item_id, option_id);

-- Support the actual admin/report sort patterns.
CREATE INDEX idx_orders_created_sequence
  ON orders(created_at DESC, daily_sequence DESC);

CREATE INDEX idx_orders_report_date
  ON orders(business_date, created_at, daily_sequence);

CREATE INDEX idx_products_published_order
  ON products(is_published, sort_order, name);

CREATE INDEX idx_audit_created_date
  ON audit_events(substr(created_at, 1, 10), created_at DESC);

-- Keep direct database writes aligned with the domain rules. The application
-- still owns normal business transitions and user-facing error messages.
CREATE TRIGGER trg_option_group_bounds_insert
BEFORE INSERT ON product_option_groups
WHEN NEW.min_select < 0
  OR NEW.max_select < 0
  OR NEW.max_select > 0 AND NEW.max_select < NEW.min_select
  OR NEW.is_required = 1 AND NEW.min_select < 1
BEGIN
  SELECT RAISE(ABORT, 'invalid option group selection bounds');
END;

CREATE TRIGGER trg_option_group_bounds_update
BEFORE UPDATE OF is_required, min_select, max_select ON product_option_groups
WHEN NEW.min_select < 0
  OR NEW.max_select < 0
  OR NEW.max_select > 0 AND NEW.max_select < NEW.min_select
  OR NEW.is_required = 1 AND NEW.min_select < 1
BEGIN
  SELECT RAISE(ABORT, 'invalid option group selection bounds');
END;

CREATE TRIGGER trg_order_payment_pair_insert
BEFORE INSERT ON orders
WHEN NOT (
  (NEW.payment_method = 'cash' AND NEW.payment_status IN ('pending_cash', 'cash_received'))
  OR (NEW.payment_method = 'demo_wallet' AND NEW.payment_status = 'demo_confirmed')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid payment method and payment status combination');
END;

CREATE TRIGGER trg_order_payment_pair_update
BEFORE UPDATE OF payment_method, payment_status ON orders
WHEN NOT (
  (NEW.payment_method = 'cash' AND NEW.payment_status IN ('pending_cash', 'cash_received'))
  OR (NEW.payment_method = 'demo_wallet' AND NEW.payment_status = 'demo_confirmed')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid payment method and payment status combination');
END;

CREATE TRIGGER trg_order_item_total_insert
BEFORE INSERT ON order_items
WHEN NEW.line_total_centavos <> NEW.unit_price_centavos * NEW.quantity
BEGIN
  SELECT RAISE(ABORT, 'order item line total must equal unit price times quantity');
END;

CREATE TRIGGER trg_order_item_total_update
BEFORE UPDATE OF unit_price_centavos, quantity, line_total_centavos ON order_items
WHEN NEW.line_total_centavos <> NEW.unit_price_centavos * NEW.quantity
BEGIN
  SELECT RAISE(ABORT, 'order item line total must equal unit price times quantity');
END;
