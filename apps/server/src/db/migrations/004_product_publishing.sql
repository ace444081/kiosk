-- 004_product_publishing.sql
-- Product drafts are visible to admins but must never be exposed to the kiosk
-- or accepted by the ordering service until explicitly published.

ALTER TABLE products ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0,1));

CREATE INDEX idx_products_published ON products(is_published, category_id, sort_order);
