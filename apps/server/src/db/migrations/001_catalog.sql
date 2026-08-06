-- 001_catalog.sql
-- Categories, products, add-ons, option groups, and the add-on compatibility
-- join table. Product ids are stable slugs for the seeded catalog.

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_fil TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description_en TEXT NOT NULL DEFAULT '',
  description_fil TEXT NOT NULL DEFAULT '',
  price_centavos INTEGER NOT NULL CHECK (price_centavos >= 0),
  image_path TEXT NOT NULL DEFAULT '',
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_products_category ON products(category_id, sort_order);

CREATE TABLE addons (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_fil TEXT NOT NULL,
  price_centavos INTEGER NOT NULL CHECK (price_centavos >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Compatibility matrix (provisional - see docs/MENU_VALIDATION.md).
CREATE TABLE product_addons (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  addon_id TEXT NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, addon_id)
);

CREATE TABLE product_option_groups (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL,
  name_fil TEXT NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0,1)),
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_option_groups_product ON product_option_groups(product_id, sort_order);

CREATE TABLE product_options (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES product_option_groups(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL,
  name_fil TEXT NOT NULL,
  price_centavos INTEGER NOT NULL DEFAULT 0 CHECK (price_centavos >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_options_group ON product_options(group_id, sort_order);
