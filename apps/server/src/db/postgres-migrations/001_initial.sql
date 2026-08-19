CREATE SCHEMA IF NOT EXISTS app;
SET LOCAL search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.categories (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_fil TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app.products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES app.categories(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description_en TEXT NOT NULL DEFAULT '',
  description_fil TEXT NOT NULL DEFAULT '',
  price_centavos INTEGER NOT NULL CHECK (price_centavos >= 0),
  image_path TEXT NOT NULL DEFAULT '',
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app.addons (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_fil TEXT NOT NULL,
  price_centavos INTEGER NOT NULL CHECK (price_centavos >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app.product_addons (
  product_id TEXT NOT NULL REFERENCES app.products(id) ON DELETE CASCADE,
  addon_id TEXT NOT NULL REFERENCES app.addons(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, addon_id)
);

CREATE TABLE IF NOT EXISTS app.product_option_groups (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES app.products(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL,
  name_fil TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  min_select INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select INTEGER NOT NULL DEFAULT 0 CHECK (max_select >= 0 AND (max_select = 0 OR max_select >= min_select)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  CHECK (NOT is_required OR min_select >= 1)
);

CREATE TABLE IF NOT EXISTS app.product_options (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES app.product_option_groups(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL,
  name_fil TEXT NOT NULL,
  price_centavos INTEGER NOT NULL DEFAULT 0 CHECK (price_centavos >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app.orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  business_date DATE NOT NULL,
  daily_sequence INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('placed','preparing','ready','completed','cancelled')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','demo_wallet')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending_cash','cash_received','demo_confirmed')),
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','fil')),
  subtotal_centavos INTEGER NOT NULL CHECK (subtotal_centavos >= 0),
  total_centavos INTEGER NOT NULL CHECK (total_centavos >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  receipt_token_hash TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  deployment_id TEXT NOT NULL DEFAULT 'cloud-fallback',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  preparing_at TIMESTAMPTZ,
  payment_confirmed_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  UNIQUE (business_date, daily_sequence),
  CHECK (
    (payment_method = 'cash' AND payment_status IN ('pending_cash','cash_received'))
    OR (payment_method = 'demo_wallet' AND payment_status = 'demo_confirmed')
  )
);

CREATE TABLE IF NOT EXISTS app.order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price_centavos INTEGER NOT NULL CHECK (unit_price_centavos >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_centavos INTEGER NOT NULL CHECK (line_total_centavos = unit_price_centavos * quantity),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app.order_item_addons (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES app.order_items(id) ON DELETE CASCADE,
  addon_id TEXT NOT NULL,
  addon_name TEXT NOT NULL,
  addon_price_centavos INTEGER NOT NULL CHECK (addon_price_centavos >= 0),
  UNIQUE (order_item_id, addon_id)
);

CREATE TABLE IF NOT EXISTS app.order_item_options (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES app.order_items(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  option_name TEXT NOT NULL,
  option_price_centavos INTEGER NOT NULL CHECK (option_price_centavos >= 0),
  UNIQUE (order_item_id, option_id)
);

CREATE TABLE IF NOT EXISTS app.admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','staff')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app.admin_sessions (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expire BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS app.audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  actor_role TEXT CHECK (actor_role IS NULL OR actor_role IN ('admin','staff','kiosk','system')),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  previous_state JSONB,
  new_state JSONB,
  request_id TEXT,
  ip TEXT,
  user_agent TEXT,
  deployment_id TEXT NOT NULL DEFAULT 'cloud-fallback',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app.daily_order_sequences (
  business_date DATE PRIMARY KEY,
  last_value INTEGER NOT NULL CHECK (last_value >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_admins_username_lower ON app.admins (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_products_sku_lower ON app.products (LOWER(sku));
CREATE INDEX IF NOT EXISTS idx_app_products_category ON app.products(category_id, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_app_products_published ON app.products(is_published, is_available, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_app_option_groups_product ON app.product_option_groups(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_app_options_group ON app.product_options(group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_app_orders_station ON app.orders(status, payment_status, business_date, created_at, daily_sequence);
CREATE INDEX IF NOT EXISTS idx_app_orders_preparing ON app.orders(preparing_at) WHERE preparing_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_orders_board ON app.orders(business_date, status, completed_at, created_at);
CREATE INDEX IF NOT EXISTS idx_app_order_items_order ON app.order_items(order_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_app_addons_item ON app.order_item_addons(order_item_id);
CREATE INDEX IF NOT EXISTS idx_app_options_item ON app.order_item_options(order_item_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expire ON app.admin_sessions(expire);
CREATE INDEX IF NOT EXISTS idx_app_audit_created ON app.audit_events(created_at DESC);

REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM PUBLIC;
