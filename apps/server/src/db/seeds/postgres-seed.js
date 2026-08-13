import { ADDON_RULES, buildSeedMenu } from '@kiosk/shared';

export async function seedPostgresCatalog(db) {
  const { categories, products, addons } = buildSeedMenu();
  await db.transaction(async (tx) => {
    for (const category of categories) {
      await tx.query(
        `INSERT INTO categories (id, name_en, name_fil, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en,
           name_fil = EXCLUDED.name_fil, sort_order = EXCLUDED.sort_order,
           updated_at = CURRENT_TIMESTAMP`,
        [category.slug, category.nameEn, category.nameFil, category.sortOrder],
      );
    }
    for (const addon of addons) {
      await tx.query(
        `INSERT INTO addons (id, name_en, name_fil, price_centavos, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en,
           name_fil = EXCLUDED.name_fil, price_centavos = EXCLUDED.price_centavos,
           sort_order = EXCLUDED.sort_order`,
        [addon.sku, addon.nameEn, addon.nameFil, addon.priceCentavos, addon.sortOrder],
      );
    }
    for (const product of products) {
      await tx.query(
        `INSERT INTO products
          (id, category_id, sku, name, description_en, description_fil, price_centavos,
           image_path, is_available, is_published, sort_order)
         VALUES ($1, $2, $1, $3, $4, $5, $6, $7, TRUE, TRUE, $8)
         ON CONFLICT (id) DO UPDATE SET category_id = EXCLUDED.category_id,
           name = EXCLUDED.name, description_en = EXCLUDED.description_en,
           description_fil = EXCLUDED.description_fil, price_centavos = EXCLUDED.price_centavos,
           image_path = EXCLUDED.image_path, sort_order = EXCLUDED.sort_order,
           updated_at = CURRENT_TIMESTAMP`,
        [
          product.sku,
          product.categorySlug,
          product.name,
          product.descriptionEn,
          product.descriptionFil,
          product.priceCentavos,
          product.imagePath,
          product.sortOrder,
        ],
      );
      for (const addon of addons) {
        const rule = ADDON_RULES[addon.sku];
        if (rule?.(product)) {
          await tx.query(
            'INSERT INTO product_addons (product_id, addon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [product.sku, addon.sku],
          );
        }
      }
      for (const group of product.optionGroups || []) {
        const groupId = `${product.sku}__${group.sku}`;
        await tx.query(
          `INSERT INTO product_option_groups
            (id, product_id, name_en, name_fil, is_required, min_select, max_select, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en,
             name_fil = EXCLUDED.name_fil, is_required = EXCLUDED.is_required,
             min_select = EXCLUDED.min_select, max_select = EXCLUDED.max_select,
             sort_order = EXCLUDED.sort_order`,
          [
            groupId,
            product.sku,
            group.nameEn,
            group.nameFil,
            group.isRequired,
            group.minSelect,
            group.maxSelect,
            group.sortOrder || 0,
          ],
        );
        for (const option of group.options) {
          await tx.query(
            `INSERT INTO product_options
              (id, group_id, name_en, name_fil, price_centavos, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en,
               name_fil = EXCLUDED.name_fil, price_centavos = EXCLUDED.price_centavos,
               sort_order = EXCLUDED.sort_order`,
            [
              `${groupId}__${option.sku}`,
              groupId,
              option.nameEn,
              option.nameFil,
              option.priceCentavos,
              option.sortOrder,
            ],
          );
        }
      }
    }
  });
  return { categories: categories.length, products: products.length, addons: addons.length };
}
