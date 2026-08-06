import { buildSeedMenu, ADDON_RULES } from '@kiosk/shared';

/**
 * Idempotent catalog seed. Categories, products, add-ons, option groups and
 * the compatibility matrix are upserted; calling this repeatedly never
 * duplicates or overwrites operator changes to availability.
 */
export function seedCatalog(db) {
  const { categories, products, addons } = buildSeedMenu();

  const upsertCategory = db.prepare(`
    INSERT INTO categories (id, name_en, name_fil, sort_order)
    VALUES (@id, @nameEn, @nameFil, @sortOrder)
    ON CONFLICT(id) DO UPDATE SET
      name_en = excluded.name_en,
      name_fil = excluded.name_fil,
      sort_order = excluded.sort_order,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `);
  const upsertProduct = db.prepare(`
    INSERT INTO products
      (id, category_id, sku, name, description_en, description_fil, price_centavos,
       image_path, is_available, sort_order)
    VALUES
      (@id, @categoryId, @sku, @name, @descriptionEn, @descriptionFil, @priceCentavos,
       @imagePath, 1, @sortOrder)
    ON CONFLICT(id) DO UPDATE SET
      category_id = excluded.category_id,
      name = excluded.name,
      description_en = excluded.description_en,
      description_fil = excluded.description_fil,
      price_centavos = excluded.price_centavos,
      image_path = excluded.image_path,
      sort_order = excluded.sort_order,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `);
  const upsertAddon = db.prepare(`
    INSERT INTO addons (id, name_en, name_fil, price_centavos, sort_order)
    VALUES (@id, @nameEn, @nameFil, @priceCentavos, @sortOrder)
    ON CONFLICT(id) DO UPDATE SET
      name_en = excluded.name_en,
      name_fil = excluded.name_fil,
      price_centavos = excluded.price_centavos,
      sort_order = excluded.sort_order
  `);
  const linkAddon = db.prepare(
    'INSERT OR IGNORE INTO product_addons (product_id, addon_id) VALUES (?, ?)',
  );
  const upsertOptionGroup = db.prepare(`
    INSERT INTO product_option_groups (id, product_id, name_en, name_fil, is_required, min_select, max_select, sort_order)
    VALUES (@id, @productId, @nameEn, @nameFil, @isRequired, @minSelect, @maxSelect, @sortOrder)
    ON CONFLICT(id) DO UPDATE SET
      name_en = excluded.name_en, name_fil = excluded.name_fil,
      is_required = excluded.is_required, min_select = excluded.min_select,
      max_select = excluded.max_select, sort_order = excluded.sort_order
  `);
  const upsertOption = db.prepare(`
    INSERT INTO product_options (id, group_id, name_en, name_fil, price_centavos, sort_order)
    VALUES (@id, @groupId, @nameEn, @nameFil, @priceCentavos, @sortOrder)
    ON CONFLICT(id) DO UPDATE SET
      name_en = excluded.name_en, name_fil = excluded.name_fil,
      price_centavos = excluded.price_centavos, sort_order = excluded.sort_order
  `);

  const seed = db.transaction(() => {
    const categoryIds = new Map();
    for (const c of categories) {
      upsertCategory.run({ ...c, id: c.slug, nameEn: c.nameEn, nameFil: c.nameFil });
      categoryIds.set(c.slug, c.slug);
    }

    for (const a of addons) {
      upsertAddon.run({ ...a, id: a.sku, nameEn: a.nameEn, nameFil: a.nameFil });
    }

    for (const p of products) {
      const categoryId = categoryIds.get(p.categorySlug);
      if (!categoryId) throw new Error(`Unknown category slug ${p.categorySlug} for ${p.sku}`);
      upsertProduct.run({
        id: p.sku,
        categoryId,
        sku: p.sku,
        name: p.name,
        descriptionEn: p.descriptionEn,
        descriptionFil: p.descriptionFil,
        priceCentavos: p.priceCentavos,
        imagePath: p.imagePath,
        sortOrder: p.sortOrder,
      });

      for (const addon of addons) {
        const rule = ADDON_RULES[addon.sku];
        if (rule && rule(p)) {
          linkAddon.run(p.sku, addon.sku);
        }
      }

      for (const group of p.optionGroups || []) {
        const groupId = `${p.sku}__${group.sku}`;
        upsertOptionGroup.run({
          id: groupId,
          productId: p.sku,
          nameEn: group.nameEn,
          nameFil: group.nameFil,
          isRequired: group.isRequired ? 1 : 0,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          sortOrder: group.sortOrder || 0,
        });
        for (const opt of group.options) {
          upsertOption.run({
            id: `${groupId}__${opt.sku}`,
            groupId,
            nameEn: opt.nameEn,
            nameFil: opt.nameFil,
            priceCentavos: opt.priceCentavos,
            sortOrder: opt.sortOrder,
          });
        }
      }
    }
  });

  seed();
  return {
    categories: categories.length,
    products: products.length,
    addons: addons.length,
  };
}
