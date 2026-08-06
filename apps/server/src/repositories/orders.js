import { randomId } from '../security/tokens.js';

export class OrderRepository {
  constructor(db) {
    this.db = db;
  }

  findByOrderNumber(orderNumber) {
    return this.db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber) || null;
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) || null;
  }

  findByIdempotencyKey(key) {
    return this.db.prepare('SELECT * FROM orders WHERE idempotency_key = ?').get(key) || null;
  }

  findByReceiptTokenHash(hash) {
    return this.db.prepare('SELECT * FROM orders WHERE receipt_token_hash = ?').get(hash) || null;
  }

  itemsForOrder(orderId) {
    return this.db
      .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order')
      .all(orderId);
  }

  addonsForItem(itemId) {
    return this.db.prepare('SELECT * FROM order_item_addons WHERE order_item_id = ?').all(itemId);
  }

  optionsForItem(itemId) {
    return this.db.prepare('SELECT * FROM order_item_options WHERE order_item_id = ?').all(itemId);
  }

  list(filters = {}) {
    const clauses = [];
    const params = [];
    if (filters.status) {
      clauses.push('status = ?');
      params.push(filters.status);
    }
    if (filters.payment) {
      clauses.push('payment_status = ?');
      params.push(filters.payment);
    }
    if (filters.date) {
      clauses.push('business_date = ?');
      params.push(filters.date);
    }
    if (filters.search) {
      clauses.push('order_number = ? COLLATE NOCASE');
      params.push(filters.search.trim().toUpperCase());
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db
      .prepare(
        `SELECT orders.*,
                COALESCE((SELECT SUM(quantity) FROM order_items WHERE order_id = orders.id), 0) AS item_count
         FROM orders ${where}
         ORDER BY created_at DESC, daily_sequence DESC LIMIT 200`,
      )
      .all(...params);
  }

  listStationQueue(station, { page = 1, pageSize = 20 } = {}) {
    const offset = (page - 1) * pageSize;
    let where;
    let orderBy = 'created_at ASC, daily_sequence ASC';
    if (station === 'cashier') {
      where = `(status = 'placed' AND payment_status = 'pending_cash')
        OR (payment_method = 'cash' AND payment_status = 'cash_received'
            AND updated_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 seconds'))`;
    } else if (station === 'kitchen') {
      where = `(status = 'placed' AND payment_status IN ('cash_received','demo_confirmed'))
        OR status = 'preparing'`;
    } else {
      where = `status = 'ready'
        OR (status = 'completed' AND completed_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds'))`;
      orderBy = `CASE status WHEN 'ready' THEN 0 ELSE 1 END, COALESCE(ready_at, created_at) ASC`;
    }
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE ${where}`).get().n;
    const rows = this.db
      .prepare(
        `SELECT orders.*,
                COALESCE((SELECT SUM(quantity) FROM order_items WHERE order_id = orders.id), 0) AS item_count
         FROM orders WHERE ${where}
         ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      )
      .all(pageSize, offset);
    return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  listPublicBoard(businessDate) {
    return this.db
      .prepare(
        `SELECT order_number, status, created_at, preparing_at, ready_at, completed_at
         FROM orders
         WHERE business_date = ? AND (
           (status = 'placed' AND payment_status IN ('cash_received','demo_confirmed'))
           OR status IN ('preparing','ready')
           OR (status = 'completed' AND completed_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds'))
         )
         ORDER BY created_at ASC, daily_sequence ASC`,
      )
      .all(businessDate);
  }

  listForReport({ from, to }) {
    return this.db
      .prepare(
        `SELECT * FROM orders
         WHERE business_date BETWEEN ? AND ?
         ORDER BY business_date ASC, created_at ASC, daily_sequence ASC`,
      )
      .all(from, to);
  }

  itemsForReport({ from, to }) {
    return this.db
      .prepare(
        `SELECT o.order_number, o.business_date, o.status, o.payment_method, o.payment_status,
                oi.product_sku, oi.product_name, oi.unit_price_centavos, oi.quantity, oi.line_total_centavos
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.business_date BETWEEN ? AND ?
         ORDER BY o.business_date ASC, o.created_at ASC, oi.sort_order ASC`,
      )
      .all(from, to);
  }

  /** Full detail for one order including items/addons/options. */
  detail(id) {
    const order = this.findById(id);
    if (!order) return null;
    const items = this.itemsForOrder(id).map((item) => ({
      ...item,
      addons: this.addonsForItem(item.id),
      options: this.optionsForItem(item.id),
    }));
    return { ...order, items };
  }

  /**
   * Insert a complete order atomically. Must be called inside the caller's
   * immediate transaction. Returns the inserted order row.
   */
  insert({
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
  }) {
    const orderId = randomId();
    this.db
      .prepare(
        `INSERT INTO orders
          (id, order_number, business_date, daily_sequence, status, payment_method,
           payment_status, locale, subtotal_centavos, total_centavos, idempotency_key,
           receipt_token_hash, payment_confirmed_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
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
        paymentStatus === 'demo_confirmed' ? new Date().toISOString() : null,
      );

    const insertItem = this.db.prepare(
      `INSERT INTO order_items
        (id, order_id, product_id, product_sku, product_name, unit_price_centavos,
         quantity, line_total_centavos, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAddon = this.db.prepare(
      `INSERT INTO order_item_addons (id, order_item_id, addon_id, addon_name, addon_price_centavos)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const insertOption = this.db.prepare(
      `INSERT INTO order_item_options (id, order_item_id, option_id, option_name, option_price_centavos)
       VALUES (?, ?, ?, ?, ?)`,
    );

    items.forEach((item, index) => {
      const itemId = randomId();
      insertItem.run(
        itemId,
        orderId,
        item.productId,
        item.productSku,
        item.productName,
        item.unitPriceCentavos,
        item.quantity,
        item.lineTotalCentavos,
        index,
      );
      for (const addon of item.addons) {
        insertAddon.run(randomId(), itemId, addon.id, addon.name, addon.priceCentavos);
      }
      for (const option of item.options) {
        insertOption.run(randomId(), itemId, option.id, option.name, option.priceCentavos);
      }
    });

    return this.findById(orderId);
  }

  updateStatus(id, status, { preparingAt, readyAt, completedAt, cancelledAt }) {
    const sets = [
      'status = ?',
      'version = version + 1',
      "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    ];
    const params = [status];
    if (preparingAt !== undefined) {
      sets.push('preparing_at = ?');
      params.push(preparingAt);
    }
    if (completedAt !== undefined) {
      sets.push('completed_at = ?');
      params.push(completedAt);
    }
    if (readyAt !== undefined) {
      sets.push('ready_at = ?');
      params.push(readyAt);
    }
    if (cancelledAt !== undefined) {
      sets.push('cancelled_at = ?');
      params.push(cancelledAt);
    }
    params.push(id);
    this.db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  }

  updatePaymentStatus(id, paymentStatus, paymentConfirmedAt) {
    this.db
      .prepare(
        `UPDATE orders SET payment_status = ?, payment_confirmed_at = ?, version = version + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      )
      .run(paymentStatus, paymentConfirmedAt, id);
    return this.findById(id);
  }
}
