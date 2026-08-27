SET LOCAL search_path TO app, public;

ALTER TABLE app.products
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT NULL
  CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

CREATE INDEX IF NOT EXISTS idx_app_products_stock ON app.products(stock_quantity);

CREATE TABLE IF NOT EXISTS app.product_recommendations (
  product_id TEXT NOT NULL REFERENCES app.products(id) ON DELETE CASCADE,
  recommended_product_id TEXT NOT NULL REFERENCES app.products(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, recommended_product_id),
  CHECK (product_id <> recommended_product_id)
);

CREATE INDEX IF NOT EXISTS idx_app_product_recommendations_product
  ON app.product_recommendations(product_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_app_product_recommendations_recommended
  ON app.product_recommendations(recommended_product_id);

REVOKE ALL ON app.product_recommendations FROM PUBLIC;

INSERT INTO app.product_option_groups
  (id, product_id, name_en, name_fil, is_required, min_select, max_select, sort_order)
SELECT id || '__sugar-level', id, 'Sugar Level', 'Antas ng Asukal', FALSE, 0, 1, 10
FROM app.products
WHERE category_id IN ('drip-coffee', 'espresso', 'ice-shaken', 'non-coffee')
ON CONFLICT (id) DO NOTHING;

WITH sugar_options(sku, label, sort_order) AS (
  VALUES
    ('sugar-0', '0%', 1),
    ('sugar-25', '25%', 2),
    ('sugar-50', '50%', 3),
    ('sugar-75', '75%', 4),
    ('sugar-100', '100%', 5)
)
INSERT INTO app.product_options
  (id, group_id, name_en, name_fil, price_centavos, sort_order)
SELECT groups.id || '__' || sugar_options.sku, groups.id,
       sugar_options.label, sugar_options.label, 0, sugar_options.sort_order
FROM app.product_option_groups groups
CROSS JOIN sugar_options
WHERE groups.id LIKE '%__sugar-level'
ON CONFLICT (id) DO NOTHING;

WITH recommendation_defaults(kind, recommended_product_id, sort_order) AS (
  VALUES
    ('food', 'cafe-latte', 1),
    ('food', 'honey-calamansi', 2),
    ('food', 'ube-latte', 3),
    ('drink', 'creamcheese-garlic-bun', 1),
    ('drink', 'hashbrown-2pc', 2),
    ('drink', 'crinkled-fries', 3)
)
INSERT INTO app.product_recommendations
  (product_id, recommended_product_id, sort_order)
SELECT source.id, recommended.id, recommendation_defaults.sort_order
FROM app.products source
JOIN recommendation_defaults ON (
  (recommendation_defaults.kind = 'drink'
    AND source.category_id IN ('drip-coffee', 'espresso', 'ice-shaken', 'non-coffee'))
  OR
  (recommendation_defaults.kind = 'food'
    AND source.category_id NOT IN ('drip-coffee', 'espresso', 'ice-shaken', 'non-coffee'))
)
JOIN app.products recommended ON recommended.id = recommendation_defaults.recommended_product_id
WHERE source.id <> recommended.id
ON CONFLICT (product_id, recommended_product_id) DO NOTHING;
