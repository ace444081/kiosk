import { LOW_STOCK_THRESHOLD } from '@kiosk/shared';

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
      return {
        categories,
        products,
        addons,
        productAddonRows: [],
        recommendationRows: [],
        optionGroups: [],
        options: [],
      };
    }
    const productPlaceholders = productIds.map(() => '?').join(',');
    const productAddonRows = this.db
      .prepare(
        `SELECT product_id, addon_id FROM product_addons WHERE product_id IN (${productPlaceholders})`,
      )
      .all(...productIds);
    const recommendationRows = this.db
      .prepare(
        `SELECT product_id, recommended_product_id, sort_order
         FROM product_recommendations
         WHERE product_id IN (${productPlaceholders})
         ORDER BY product_id, sort_order`,
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
    return {
      categories,
      products,
      addons,
      productAddonRows,
      recommendationRows,
      optionGroups,
      options,
    };
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

  updateAvailability(productId, isAvailable, expectedVersion) {
    const result = this.db
      .prepare(
        `UPDATE products SET is_available = ?, version = version + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id = ? AND version = ?`,
      )
      .run(isAvailable ? 1 : 0, productId, expectedVersion);
    if (result.changes === 0) return null;
    return this.findProductById(productId);
  }

  updateCatalog(productId, { imagePath, stockQuantity }, expectedVersion) {
    const result = this.db
      .prepare(
        `UPDATE products SET image_path = ?, stock_quantity = ?, version = version + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ? AND version = ?`,
      )
      .run(imagePath, stockQuantity, productId, expectedVersion);
    return result.changes ? this.findProductById(productId) : null;
  }

  getProductImage(productId) {
    return (
      this.db
        .prepare(
          `SELECT product_id, mime_type, image_data, byte_size, width, height, updated_at
           FROM product_images WHERE product_id = ?`,
        )
        .get(productId) || null
    );
  }

  updateProductImage(
    productId,
    { mimeType, imageData, byteSize, width = null, height = null },
    expectedVersion,
  ) {
    const update = this.db.transaction(() => {
      const nextVersion = expectedVersion + 1;
      const imagePath = `/api/v1/products/${productId}/image?v=${nextVersion}`;
      const result = this.db
        .prepare(
          `UPDATE products SET image_path = ?, version = version + 1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id = ? AND version = ?`,
        )
        .run(imagePath, productId, expectedVersion);
      if (!result.changes) return null;
      this.db
        .prepare(
          `INSERT INTO product_images
             (product_id, mime_type, image_data, byte_size, width, height)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(product_id) DO UPDATE SET
             mime_type = excluded.mime_type,
             image_data = excluded.image_data,
             byte_size = excluded.byte_size,
             width = excluded.width,
             height = excluded.height,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
        )
        .run(productId, mimeType, imageData, byteSize, width, height);
      return this.findProductById(productId);
    });
    return update();
  }

  updateProduct(productId, product, expectedVersion) {
    const update = this.db.transaction((input) => {
      const result = this.db
        .prepare(
          `UPDATE products SET category_id = ?, name = ?, description_en = ?, description_fil = ?,
             price_centavos = ?, image_path = ?, is_available = ?, is_published = ?,
             stock_quantity = ?, sort_order = ?, version = version + 1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id = ? AND version = ?`,
        )
        .run(
          input.categoryId,
          input.name,
          input.descriptionEn,
          input.descriptionFil,
          input.priceCentavos,
          input.imagePath,
          input.isAvailable ? 1 : 0,
          input.isPublished ? 1 : 0,
          input.stockQuantity,
          input.sortOrder,
          productId,
          expectedVersion,
        );
      if (!result.changes) return false;

      this.db.prepare('DELETE FROM product_addons WHERE product_id = ?').run(productId);
      const insertAddon = this.db.prepare(
        'INSERT INTO product_addons (product_id, addon_id) VALUES (?, ?)',
      );
      for (const addonId of input.addonIds) insertAddon.run(productId, addonId);

      this.db.prepare('DELETE FROM product_option_groups WHERE product_id = ?').run(productId);
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
      input.optionGroups.forEach((group, groupIndex) => {
        const groupId = `${productId}--${group.key}`;
        insertGroup.run(
          groupId,
          productId,
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
      return true;
    });
    if (!update(product)) return null;
    return this.findProductById(productId);
  }

  reserveStock(requirements) {
    for (const { productId, quantity } of requirements) {
      const product = this.findProductById(productId);
      if (product?.stock_quantity == null) continue;
      const result = this.db
        .prepare(
          `UPDATE products SET stock_quantity = stock_quantity - ?, version = version + 1,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id = ? AND stock_quantity >= ?`,
        )
        .run(quantity, productId, quantity);
      if (!result.changes) {
        return { productId, remaining: this.findProductById(productId)?.stock_quantity ?? 0 };
      }
    }
    return null;
  }

  releaseStock(items) {
    const quantities = new Map();
    for (const item of items) {
      quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + item.quantity);
    }
    const release = this.db.prepare(
      `UPDATE products SET stock_quantity = stock_quantity + ?, version = version + 1,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ? AND stock_quantity IS NOT NULL`,
    );
    for (const [productId, quantity] of [...quantities].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      release.run(quantity, productId);
    }
  }

  createProduct(input) {
    const insert = this.db.transaction((product) => {
      this.db
        .prepare(
          `INSERT INTO products
            (id, category_id, sku, name, description_en, description_fil, price_centavos, image_path,
            is_available, is_published, stock_quantity, sort_order, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
          product.stockQuantity,
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

  updatePublication(productId, { isPublished, isAvailable }, expectedVersion) {
    const result = this.db
      .prepare(
        `UPDATE products SET is_published = ?, is_available = ?, version = version + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id = ? AND version = ?`,
      )
      .run(isPublished ? 1 : 0, isAvailable ? 1 : 0, productId, expectedVersion);
    if (result.changes === 0) return null;
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
      clauses.push('is_available = 1 AND (stock_quantity IS NULL OR stock_quantity > 0)');
    } else if (availability === 'low_stock') {
      clauses.push(`stock_quantity > 0 AND stock_quantity <= ${LOW_STOCK_THRESHOLD}`);
    } else if (availability === 'sold_out') {
      clauses.push('(is_available = 0 OR stock_quantity = 0)');
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db
      .prepare(`SELECT * FROM products ${where} ORDER BY sort_order, name LIMIT 500`)
      .all(...params);
  }
}
