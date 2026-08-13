export class CatalogRepository {
  constructor(db) {
    this.db = db;
  }

  listCategories() {
    return this.db.prepare('SELECT * FROM categories ORDER BY sort_order, name_en').all();
  }

  listProducts({ publishedOnly = false } = {}) {
    const where = publishedOnly ? 'WHERE is_published = 1' : '';
    return this.db.prepare(`SELECT * FROM products ${where} ORDER BY sort_order, name`).all();
  }

  findProductsByIds(ids, { publishedOnly = false } = {}) {
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    const published = publishedOnly ? ' AND is_published = 1' : '';
    return this.db
      .prepare(`SELECT * FROM products WHERE id IN (${placeholders})${published}`)
      .all(...ids);
  }

  findProductById(id) {
    return this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) || null;
  }

  listAddons() {
    return this.db.prepare('SELECT * FROM addons ORDER BY sort_order, name_en').all();
  }

  getPublishedMenuData() {
    const categories = this.listCategories();
    const products = this.listProducts({ publishedOnly: true });
    const addons = this.listAddons();
    const productIds = products.map((product) => product.id);
    if (!productIds.length) {
      return { categories, products, addons, productAddonRows: [], optionGroups: [], options: [] };
    }
    const productPlaceholders = productIds.map(() => '?').join(',');
    const productAddonRows = this.db
      .prepare(
        `SELECT product_id, addon_id FROM product_addons WHERE product_id IN (${productPlaceholders})`,
      )
      .all(...productIds);
    const optionGroups = this.db
      .prepare(
        `SELECT * FROM product_option_groups
         WHERE product_id IN (${productPlaceholders}) ORDER BY product_id, sort_order`,
      )
      .all(...productIds);
    const groupIds = optionGroups.map((group) => group.id);
    const options = this.optionsForGroups(groupIds);
    return { categories, products, addons, productAddonRows, optionGroups, options };
  }

  findAddonsByIds(ids) {
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.db.prepare(`SELECT * FROM addons WHERE id IN (${placeholders})`).all(...ids);
  }

  addonIdsForProduct(productId) {
    return this.db
      .prepare('SELECT addon_id FROM product_addons WHERE product_id = ?')
      .all(productId)
      .map((r) => r.addon_id);
  }

  optionGroupsForProduct(productId) {
    return this.db
      .prepare(
        `SELECT og.* FROM product_option_groups og
         WHERE og.product_id = ? ORDER BY og.sort_order`,
      )
      .all(productId);
  }

  optionsForGroups(groupIds) {
    if (!groupIds.length) return [];
    const placeholders = groupIds.map(() => '?').join(',');
    return this.db
      .prepare(
        `SELECT * FROM product_options WHERE group_id IN (${placeholders}) ORDER BY sort_order`,
      )
      .all(...groupIds);
  }

  updateAvailability(productId, isAvailable) {
    this.db
      .prepare(
        `UPDATE products SET is_available = ?, version = version + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      )
      .run(isAvailable ? 1 : 0, productId);
    return this.findProductById(productId);
  }

  createProduct(input) {
    const insert = this.db.transaction((product) => {
      this.db
        .prepare(
          `INSERT INTO products
            (id, category_id, sku, name, description_en, description_fil, price_centavos, image_path,
             is_available, is_published, sort_order, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .run(
          product.sku,
          product.categoryId,
          product.sku,
          product.name,
          product.descriptionEn,
          product.descriptionFil,
          product.priceCentavos,
          product.imagePath,
          product.isAvailable ? 1 : 0,
          product.isPublished ? 1 : 0,
          product.sortOrder,
        );

      const insertAddon = this.db.prepare(
        'INSERT INTO product_addons (product_id, addon_id) VALUES (?, ?)',
      );
      for (const addonId of product.addonIds) insertAddon.run(product.sku, addonId);

      const insertGroup = this.db.prepare(
        `INSERT INTO product_option_groups
          (id, product_id, name_en, name_fil, is_required, min_select, max_select, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertOption = this.db.prepare(
        `INSERT INTO product_options
          (id, group_id, name_en, name_fil, price_centavos, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      product.optionGroups.forEach((group, groupIndex) => {
        const groupId = `${product.sku}--${group.key}`;
        insertGroup.run(
          groupId,
          product.sku,
          group.nameEn,
          group.nameFil,
          group.isRequired ? 1 : 0,
          group.minSelect,
          group.maxSelect,
          groupIndex,
        );
        group.options.forEach((option, optionIndex) => {
          insertOption.run(
            `${groupId}--${optionIndex + 1}`,
            groupId,
            option.nameEn,
            option.nameFil,
            option.priceCentavos,
            optionIndex,
          );
        });
      });
    });
    insert(input);
    return this.findProductById(input.sku);
  }

  updatePublication(productId, { isPublished, isAvailable }) {
    this.db
      .prepare(
        `UPDATE products SET is_published = ?, is_available = ?, version = version + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      )
      .run(isPublished ? 1 : 0, isAvailable ? 1 : 0, productId);
    return this.findProductById(productId);
  }

  searchProducts({ search, category, availability }) {
    const clauses = [];
    const params = [];
    if (search) {
      clauses.push('(name LIKE ? OR sku LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }
    if (category && category !== 'all') {
      clauses.push('category_id = ?');
      params.push(category);
    }
    if (availability === 'available') {
      clauses.push('is_available = 1');
    } else if (availability === 'sold_out') {
      clauses.push('is_available = 0');
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db
      .prepare(`SELECT * FROM products ${where} ORDER BY sort_order, name LIMIT 500`)
      .all(...params);
  }
}
