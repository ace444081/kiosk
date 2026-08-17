import { randomId } from '../security/tokens.js';

const bool = (value) => (value ? 1 : 0);

function normalizeCatalog(row) {
  if (!row) return null;
  return { ...row, is_available: bool(row.is_available), is_published: bool(row.is_published) };
}

function normalizeAdmin(row) {
  if (!row) return null;
  return { ...row, is_active: bool(row.is_active) };
}

export class PgAdminRepository {
  constructor(db) {
    this.db = db;
  }

  async findByUsername(username) {
    return normalizeAdmin(
      await this.db.one('SELECT * FROM admins WHERE LOWER(username) = LOWER($1) LIMIT 1', [
        username,
      ]),
    );
  }

  async findById(id) {
    return normalizeAdmin(await this.db.one('SELECT * FROM admins WHERE id = $1', [id]));
  }

  async create({ id, username, passwordHash, role = 'admin' }) {
    await this.db.query(
      'INSERT INTO admins (id, username, password_hash, role) VALUES ($1, $2, $3, $4)',
      [id, username, passwordHash, role],
    );
    return this.findById(id);
  }

  async count() {
    const row = await this.db.one('SELECT COUNT(*)::int AS n FROM admins');
    return row.n;
  }
}

export class PgAuditRepository {
  constructor(db, deploymentId = 'cloud-fallback') {
    this.db = db;
    this.deploymentId = deploymentId;
  }

  async record({
    actor,
    actorRole,
    action,
    targetType,
    targetId,
    previousState,
    newState,
    requestId,
    ip,
    userAgent,
  }) {
    await this.db.query(
      `INSERT INTO audit_events
        (id, actor, actor_role, action, target_type, target_id, previous_state,
         new_state, request_id, ip, user_agent, deployment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12)`,
      [
        randomId(),
        actor,
        actorRole || null,
        action,
        targetType || null,
        targetId || null,
        previousState == null ? null : JSON.stringify(previousState),
        newState == null ? null : JSON.stringify(newState),
        requestId || null,
        ip || null,
        userAgent || null,
        this.deploymentId,
      ],
    );
  }

  async listRecent(limit = 100) {
    return this.db.many('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT $1', [limit]);
  }

  async list({ action, from, to, limit = 200 } = {}) {
    const clauses = [];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      clauses.push(sql.replace('$value', `$${params.length}`));
    };
    if (action) add('action = $value', action);
    if (from) add('created_at::date >= $value::date', from);
    if (to) add('created_at::date <= $value::date', to);
    params.push(limit);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db.many(
      `SELECT * FROM audit_events ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
  }
}

export class PgCatalogRepository {
  constructor(db) {
    this.db = db;
  }

  async listCategories() {
    return this.db.many('SELECT * FROM categories ORDER BY sort_order, name_en');
  }

  async listProducts({ publishedOnly = false } = {}) {
    const rows = await this.db.many(
      `SELECT * FROM products ${publishedOnly ? 'WHERE is_published = TRUE' : ''}
       ORDER BY sort_order, name`,
    );
    return rows.map(normalizeCatalog);
  }

  async findProductsByIds(ids, { publishedOnly = false } = {}) {
    if (!ids.length) return [];
    const rows = await this.db.many(
      `SELECT * FROM products WHERE id = ANY($1::text[])${publishedOnly ? ' AND is_published = TRUE' : ''}`,
      [ids],
    );
    return rows.map(normalizeCatalog);
  }

  async findProductById(id) {
    return normalizeCatalog(await this.db.one('SELECT * FROM products WHERE id = $1', [id]));
  }

  async listAddons() {
    return this.db.many('SELECT * FROM addons ORDER BY sort_order, name_en');
  }

  async getPublishedMenuData() {
    const [categories, products, addons] = await Promise.all([
      this.listCategories(),
      this.listProducts({ publishedOnly: true }),
      this.listAddons(),
    ]);
    const productIds = products.map((product) => product.id);
    if (!productIds.length) {
      return { categories, products, addons, productAddonRows: [], optionGroups: [], options: [] };
    }
    const [productAddonRows, optionGroups] = await Promise.all([
      this.db.many(
        'SELECT product_id, addon_id FROM product_addons WHERE product_id = ANY($1::text[])',
        [productIds],
      ),
      this.db.many(
        `SELECT * FROM product_option_groups
         WHERE product_id = ANY($1::text[]) ORDER BY product_id, sort_order`,
        [productIds],
      ),
    ]);
    const options = await this.optionsForGroups(optionGroups.map((group) => group.id));
    return {
      categories,
      products,
      addons,
      productAddonRows,
      optionGroups: optionGroups.map((group) => ({
        ...group,
        is_required: bool(group.is_required),
      })),
      options,
    };
  }

  async getProductConfiguration(productIds) {
    const ids = [...new Set(productIds)];
    if (!ids.length) {
      return {
        addonIdsByProduct: new Map(),
        optionGroupsByProduct: new Map(),
        optionsByGroup: new Map(),
      };
    }
    const [addonRows, groupRows] = await Promise.all([
      this.db.many(
        'SELECT product_id, addon_id FROM product_addons WHERE product_id = ANY($1::text[])',
        [ids],
      ),
      this.db.many(
        `SELECT * FROM product_option_groups
         WHERE product_id = ANY($1::text[]) ORDER BY product_id, sort_order`,
        [ids],
      ),
    ]);
    const optionRows = await this.optionsForGroups(groupRows.map((group) => group.id));
    const addonIdsByProduct = new Map();
    const optionGroupsByProduct = new Map();
    const optionsByGroup = new Map();
    for (const row of addonRows) {
      const list = addonIdsByProduct.get(row.product_id) || [];
      list.push(row.addon_id);
      addonIdsByProduct.set(row.product_id, list);
    }
    for (const row of groupRows) {
      const list = optionGroupsByProduct.get(row.product_id) || [];
      list.push({ ...row, is_required: bool(row.is_required) });
      optionGroupsByProduct.set(row.product_id, list);
    }
    for (const row of optionRows) {
      const list = optionsByGroup.get(row.group_id) || [];
      list.push(row);
      optionsByGroup.set(row.group_id, list);
    }
    return { addonIdsByProduct, optionGroupsByProduct, optionsByGroup };
  }

  async findAddonsByIds(ids) {
    if (!ids.length) return [];
    return this.db.many('SELECT * FROM addons WHERE id = ANY($1::text[])', [ids]);
  }

  async addonIdsForProduct(productId) {
    const rows = await this.db.many('SELECT addon_id FROM product_addons WHERE product_id = $1', [
      productId,
    ]);
    return rows.map((row) => row.addon_id);
  }

  async optionGroupsForProduct(productId) {
    const rows = await this.db.many(
      'SELECT * FROM product_option_groups WHERE product_id = $1 ORDER BY sort_order',
      [productId],
    );
    return rows.map((row) => ({ ...row, is_required: bool(row.is_required) }));
  }

  async optionsForGroups(groupIds) {
    if (!groupIds.length) return [];
    return this.db.many(
      'SELECT * FROM product_options WHERE group_id = ANY($1::text[]) ORDER BY sort_order',
      [groupIds],
    );
  }

  async updateAvailability(productId, isAvailable, expectedVersion) {
    const params = [isAvailable, productId];
    const versionClause =
      expectedVersion == null ? '' : ` AND version = $${params.push(expectedVersion)}`;
    const row = await this.db.one(
      `UPDATE products SET is_available = $1, version = version + 1,
         updated_at = CURRENT_TIMESTAMP WHERE id = $2${versionClause} RETURNING *`,
      params,
    );
    return normalizeCatalog(row);
  }

  async createProduct(input) {
    const product = await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO products
          (id, category_id, sku, name, description_en, description_fil, price_centavos,
           image_path, is_available, is_published, sort_order, version)
         VALUES ($1, $2, $1, $3, $4, $5, $6, $7, $8, $9, $10, 1)`,
        [
          input.sku,
          input.categoryId,
          input.name,
          input.descriptionEn,
          input.descriptionFil,
          input.priceCentavos,
          input.imagePath,
          input.isAvailable,
          input.isPublished,
          input.sortOrder,
        ],
      );
      for (const addonId of input.addonIds) {
        await tx.query('INSERT INTO product_addons (product_id, addon_id) VALUES ($1, $2)', [
          input.sku,
          addonId,
        ]);
      }
      for (const [groupIndex, group] of input.optionGroups.entries()) {
        const groupId = `${input.sku}--${group.key}`;
        await tx.query(
          `INSERT INTO product_option_groups
            (id, product_id, name_en, name_fil, is_required, min_select, max_select, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            groupId,
            input.sku,
            group.nameEn,
            group.nameFil,
            group.isRequired,
            group.minSelect,
            group.maxSelect,
            groupIndex,
          ],
        );
        for (const [optionIndex, option] of group.options.entries()) {
          await tx.query(
            `INSERT INTO product_options
              (id, group_id, name_en, name_fil, price_centavos, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              `${groupId}--${optionIndex + 1}`,
              groupId,
              option.nameEn,
              option.nameFil,
              option.priceCentavos,
              optionIndex,
            ],
          );
        }
      }
      return tx.one('SELECT * FROM products WHERE id = $1', [input.sku]);
    });
    return normalizeCatalog(product);
  }

  async updatePublication(productId, { isPublished, isAvailable }, expectedVersion) {
    const params = [isPublished, isAvailable, productId];
    const versionClause =
      expectedVersion == null ? '' : ` AND version = $${params.push(expectedVersion)}`;
    return normalizeCatalog(
      await this.db.one(
        `UPDATE products SET is_published = $1, is_available = $2, version = version + 1,
           updated_at = CURRENT_TIMESTAMP WHERE id = $3${versionClause} RETURNING *`,
        params,
      ),
    );
  }

  async searchProducts({ search, category, availability }) {
    const clauses = [];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      clauses.push(sql.replace('$value', `$${params.length}`));
    };
    if (search) {
      add('(name ILIKE $value OR sku ILIKE $value)', `%${search}%`);
    }
    if (category && category !== 'all') add('category_id = $value', category);
    if (availability === 'available') clauses.push('is_available = TRUE');
    if (availability === 'sold_out') clauses.push('is_available = FALSE');
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await this.db.many(
      `SELECT * FROM products ${where} ORDER BY sort_order, name LIMIT 500`,
      params,
    );
    return rows.map(normalizeCatalog);
  }
}

export class PgOrderRepository {
  constructor(db) {
    this.db = db;
  }

  findByOrderNumber(orderNumber) {
    return this.db.one('SELECT * FROM orders WHERE order_number = $1', [orderNumber]);
  }

  findById(id) {
    return this.db.one('SELECT * FROM orders WHERE id = $1', [id]);
  }

  findByIdempotencyKey(key) {
    return this.db.one('SELECT * FROM orders WHERE idempotency_key = $1', [key]);
  }

  findByReceiptTokenHash(hash) {
    return this.db.one('SELECT * FROM orders WHERE receipt_token_hash = $1', [hash]);
  }

  async itemsForOrder(orderId) {
    return this.db.many('SELECT * FROM order_items WHERE order_id = $1 ORDER BY sort_order', [
      orderId,
    ]);
  }

  async addonsForItem(itemId) {
    return this.db.many('SELECT * FROM order_item_addons WHERE order_item_id = $1', [itemId]);
  }

  async optionsForItem(itemId) {
    return this.db.many('SELECT * FROM order_item_options WHERE order_item_id = $1', [itemId]);
  }

  async list(filters = {}) {
    const clauses = [];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      clauses.push(sql.replace('$value', `$${params.length}`));
    };
    if (filters.status) add('status = $value', filters.status);
    if (filters.payment) add('payment_status = $value', filters.payment);
    if (filters.date) add('business_date = $value::date', filters.date);
    if (filters.search) add('LOWER(order_number) = LOWER($value)', filters.search.trim());
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db.many(
      `SELECT orders.*, COALESCE((SELECT SUM(quantity) FROM order_items WHERE order_id = orders.id), 0)::int AS item_count
       FROM orders ${where} ORDER BY created_at DESC, daily_sequence DESC LIMIT 200`,
      params,
    );
  }

  async listStationQueue(station, { page = 1, pageSize = 20 } = {}) {
    const offset = (page - 1) * pageSize;
    let where;
    let orderBy = 'created_at ASC, daily_sequence ASC';
    if (station === 'cashier') {
      where = `(status = 'placed' AND payment_status = 'pending_cash')
        OR (payment_method = 'cash' AND payment_status = 'cash_received'
            AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '10 seconds')`;
    } else if (station === 'kitchen') {
      where = `(status = 'placed' AND payment_status IN ('cash_received','demo_confirmed')) OR status = 'preparing'`;
    } else {
      where = `status = 'ready' OR (status = 'completed' AND completed_at >= CURRENT_TIMESTAMP - INTERVAL '60 seconds')`;
      orderBy = `CASE status WHEN 'ready' THEN 0 ELSE 1 END, COALESCE(ready_at, created_at) ASC`;
    }
    const count = await this.db.one(`SELECT COUNT(*)::int AS n FROM orders WHERE ${where}`);
    const rows = await this.db.many(
      `SELECT orders.*, COALESCE((SELECT SUM(quantity) FROM order_items WHERE order_id = orders.id), 0)::int AS item_count
       FROM orders WHERE ${where} ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );
    const total = count.n;
    return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async listPublicBoard(businessDate) {
    return this.db.many(
      `SELECT order_number, status, created_at, preparing_at, ready_at, completed_at
       FROM orders WHERE business_date = $1::date AND (
         (status = 'placed' AND payment_status IN ('cash_received','demo_confirmed'))
         OR status IN ('preparing','ready')
         OR (status = 'completed' AND completed_at >= CURRENT_TIMESTAMP - INTERVAL '60 seconds')
       ) ORDER BY created_at ASC, daily_sequence ASC`,
      [businessDate],
    );
  }

  listForReport({ from, to }) {
    return this.db.many(
      `SELECT * FROM orders WHERE business_date BETWEEN $1::date AND $2::date
       ORDER BY business_date ASC, created_at ASC, daily_sequence ASC`,
      [from, to],
    );
  }

  itemsForReport({ from, to }) {
    return this.db.many(
      `SELECT o.order_number, o.business_date, o.created_at, o.status, o.payment_method,
              o.payment_status, o.payment_confirmed_at, o.preparing_at, o.ready_at,
              o.completed_at, oi.order_id, oi.product_sku, oi.product_name,
              oi.unit_price_centavos, oi.quantity, oi.line_total_centavos,
              COALESCE((SELECT string_agg(addon_name, ', ' ORDER BY addon_name)
                        FROM order_item_addons WHERE order_item_id = oi.id), '') AS addons,
              COALESCE((SELECT string_agg(option_name, ', ' ORDER BY option_name)
                        FROM order_item_options WHERE order_item_id = oi.id), '') AS options,
              COALESCE((SELECT SUM(addon_price_centavos)
                        FROM order_item_addons WHERE order_item_id = oi.id), 0)
              + COALESCE((SELECT SUM(option_price_centavos)
                        FROM order_item_options WHERE order_item_id = oi.id), 0) AS customization_centavos
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.business_date BETWEEN $1::date AND $2::date
       ORDER BY o.business_date ASC, o.created_at ASC, oi.sort_order ASC`,
      [from, to],
    );
  }

  async detail(id) {
    const order = await this.findById(id);
    if (!order) return null;
    const items = await this.itemsForOrder(id);
    if (!items.length) return { ...order, items: [] };
    const itemIds = items.map((item) => item.id);
    const [addons, options] = await Promise.all([
      this.db.many('SELECT * FROM order_item_addons WHERE order_item_id = ANY($1::text[])', [
        itemIds,
      ]),
      this.db.many('SELECT * FROM order_item_options WHERE order_item_id = ANY($1::text[])', [
        itemIds,
      ]),
    ]);
    const addonsByItem = new Map();
    const optionsByItem = new Map();
    for (const addon of addons)
      addonsByItem.set(addon.order_item_id, [
        ...(addonsByItem.get(addon.order_item_id) || []),
        addon,
      ]);
    for (const option of options)
      optionsByItem.set(option.order_item_id, [
        ...(optionsByItem.get(option.order_item_id) || []),
        option,
      ]);
    return {
      ...order,
      items: items.map((item) => ({
        ...item,
        addons: addonsByItem.get(item.id) || [],
        options: optionsByItem.get(item.id) || [],
      })),
    };
  }

  async detailMany(ids) {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return new Map();
    const [orders, items, addons, options] = await Promise.all([
      this.db.many('SELECT * FROM orders WHERE id = ANY($1::text[])', [uniqueIds]),
      this.db.many(
        'SELECT * FROM order_items WHERE order_id = ANY($1::text[]) ORDER BY order_id, sort_order',
        [uniqueIds],
      ),
      this.db.many(
        `SELECT a.* FROM order_item_addons a
         JOIN order_items i ON i.id = a.order_item_id
         WHERE i.order_id = ANY($1::text[])`,
        [uniqueIds],
      ),
      this.db.many(
        `SELECT o.* FROM order_item_options o
         JOIN order_items i ON i.id = o.order_item_id
         WHERE i.order_id = ANY($1::text[])`,
        [uniqueIds],
      ),
    ]);
    const orderById = new Map(orders.map((order) => [order.id, { ...order, items: [] }]));
    const itemById = new Map();
    for (const item of items) {
      const order = orderById.get(item.order_id);
      if (!order) continue;
      const detail = { ...item, addons: [], options: [] };
      order.items.push(detail);
      itemById.set(item.id, detail);
    }
    for (const addon of addons) itemById.get(addon.order_item_id)?.addons.push(addon);
    for (const option of options) itemById.get(option.order_item_id)?.options.push(option);
    return orderById;
  }

  async insert({
    orderNumber,
    businessDate,
    dailySequence,
    status,
    paymentMethod,
    paymentStatus,
    locale,
    subtotalCentavos,
    totalCentavos,
    idempotencyKey,
    receiptTokenHash,
    items,
    deploymentId = 'cloud-fallback',
  }) {
    const orderId = randomId();
    const order = await this.db.one(
      `INSERT INTO orders
        (id, order_number, business_date, daily_sequence, status, payment_method,
         payment_status, locale, subtotal_centavos, total_centavos, idempotency_key,
         receipt_token_hash, payment_confirmed_at, deployment_id)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               CASE WHEN $7 = 'demo_confirmed' THEN CURRENT_TIMESTAMP ELSE NULL END, $13)
       RETURNING *`,
      [
        orderId,
        orderNumber,
        businessDate,
        dailySequence,
        status,
        paymentMethod,
        paymentStatus,
        locale,
        subtotalCentavos,
        totalCentavos,
        idempotencyKey,
        receiptTokenHash,
        deploymentId,
      ],
    );
    for (const [index, item] of items.entries()) {
      const itemId = randomId();
      await this.db.query(
        `INSERT INTO order_items
          (id, order_id, product_id, product_sku, product_name, unit_price_centavos,
           quantity, line_total_centavos, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          itemId,
          orderId,
          item.productId,
          item.productSku,
          item.productName,
          item.unitPriceCentavos,
          item.quantity,
          item.lineTotalCentavos,
          index,
        ],
      );
      for (const addon of item.addons) {
        await this.db.query(
          `INSERT INTO order_item_addons
            (id, order_item_id, addon_id, addon_name, addon_price_centavos)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomId(), itemId, addon.id, addon.name, addon.priceCentavos],
        );
      }
      for (const option of item.options) {
        await this.db.query(
          `INSERT INTO order_item_options
            (id, order_item_id, option_id, option_name, option_price_centavos)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomId(), itemId, option.id, option.name, option.priceCentavos],
        );
      }
    }
    return order;
  }

  async updateStatus(id, status, { version, preparingAt, readyAt, completedAt, cancelledAt }) {
    const params = [status, id, version];
    const sets = ['status = $1', 'version = version + 1', 'updated_at = CURRENT_TIMESTAMP'];
    const add = (column, value) => {
      if (value !== undefined) sets.push(`${column} = $${params.push(value)}`);
    };
    add('preparing_at', preparingAt);
    add('ready_at', readyAt);
    add('completed_at', completedAt);
    add('cancelled_at', cancelledAt);
    return this.db.one(
      `UPDATE orders SET ${sets.join(', ')} WHERE id = $2 AND version = $3 RETURNING *`,
      params,
    );
  }

  async updatePaymentStatus(id, paymentStatus, paymentConfirmedAt, version) {
    return this.db.one(
      `UPDATE orders SET payment_status = $1, payment_confirmed_at = $2,
         version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND version = $4 RETURNING *`,
      [paymentStatus, paymentConfirmedAt, id, version],
    );
  }
}
