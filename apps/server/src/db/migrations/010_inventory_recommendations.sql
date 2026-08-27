-- Track optional per-product inventory and explicit product cross-sells.
-- NULL stock_quantity means inventory is intentionally not tracked.

ALTER TABLE products
  ADD COLUMN stock_quantity INTEGER DEFAULT NULL CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

CREATE INDEX idx_products_stock ON products(stock_quantity);

CREATE TABLE product_recommendations (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  recommended_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, recommended_product_id),
  CHECK (product_id <> recommended_product_id)
);

CREATE INDEX idx_product_recommendations_product
  ON product_recommendations(product_id, sort_order);

CREATE INDEX idx_product_recommendations_recommended
  ON product_recommendations(recommended_product_id);

-- Add a standard sweetness choice to existing beverage records without
-- overwriting operator-managed catalog fields.
INSERT OR IGNORE INTO product_option_groups
  (id, product_id, name_en, name_fil, is_required, min_select, max_select, sort_order)
SELECT id || '__sugar-level', id, 'Sugar Level', 'Antas ng Asukal', 0, 0, 1, 10
FROM products
WHERE category_id IN ('drip-coffee', 'espresso', 'ice-shaken', 'non-coffee');

WITH sugar_options(sku, label, sort_order) AS (
  SELECT 'sugar-0', '0%', 1 UNION ALL
  SELECT 'sugar-25', '25%', 2 UNION ALL
  SELECT 'sugar-50', '50%', 3 UNION ALL
  SELECT 'sugar-75', '75%', 4 UNION ALL
  SELECT 'sugar-100', '100%', 5
)
INSERT OR IGNORE INTO product_options
  (id, group_id, name_en, name_fil, price_centavos, sort_order)
SELECT groups.id || '__' || sugar_options.sku, groups.id,
       sugar_options.label, sugar_options.label, 0, sugar_options.sort_order
FROM product_option_groups groups
CROSS JOIN sugar_options
WHERE groups.id LIKE '%__sugar-level';

WITH recommendation_defaults(kind, recommended_product_id, sort_order) AS (
  SELECT 'food', 'cafe-latte', 1 UNION ALL
  SELECT 'food', 'honey-calamansi', 2 UNION ALL
  SELECT 'food', 'ube-latte', 3 UNION ALL
  SELECT 'drink', 'creamcheese-garlic-bun', 1 UNION ALL
  SELECT 'drink', 'hashbrown-2pc', 2 UNION ALL
  SELECT 'drink', 'crinkled-fries', 3
)
INSERT OR IGNORE INTO product_recommendations
  (product_id, recommended_product_id, sort_order)
SELECT source.id, recommended.id, recommendation_defaults.sort_order
FROM products source
JOIN recommendation_defaults ON (
  (recommendation_defaults.kind = 'drink'
    AND source.category_id IN ('drip-coffee', 'espresso', 'ice-shaken', 'non-coffee'))
  OR
  (recommendation_defaults.kind = 'food'
    AND source.category_id NOT IN ('drip-coffee', 'espresso', 'ice-shaken', 'non-coffee'))
)
JOIN products recommended ON recommended.id = recommendation_defaults.recommended_product_id
WHERE source.id <> recommended.id;
