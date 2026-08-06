-- 002_orders.sql
-- Orders with snapshots. Money is integer centavos.

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  business_date TEXT NOT NULL,
  daily_sequence INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('placed','preparing','ready','completed','cancelled')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','demo_wallet')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending_cash','cash_received','demo_confirmed')),
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','fil')),
  subtotal_centavos INTEGER NOT NULL CHECK (subtotal_centavos >= 0),
  total_centavos INTEGER NOT NULL CHECK (total_centavos >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  receipt_token_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT,
  cancelled_at TEXT,
  UNIQUE (business_date, daily_sequence)
);

CREATE INDEX idx_orders_business_date ON orders(business_date, created_at DESC);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price_centavos INTEGER NOT NULL CHECK (unit_price_centavos >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_centavos INTEGER NOT NULL CHECK (line_total_centavos >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_item_addons (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  addon_id TEXT NOT NULL,
  addon_name TEXT NOT NULL,
  addon_price_centavos INTEGER NOT NULL CHECK (addon_price_centavos >= 0)
);

CREATE INDEX idx_order_item_addons_item ON order_item_addons(order_item_id);

CREATE TABLE order_item_options (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  option_name TEXT NOT NULL,
  option_price_centavos INTEGER NOT NULL CHECK (option_price_centavos >= 0)
);

CREATE INDEX idx_order_item_options_item ON order_item_options(order_item_id);
