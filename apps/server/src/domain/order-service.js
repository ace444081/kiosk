import { MAX_QUANTITY, MIN_QUANTITY } from '@kiosk/shared';
import { OrderRepository } from '../repositories/orders.js';
import { CatalogRepository } from '../repositories/catalog.js';
import { allocateOrderNumber } from './order-number.js';
import {
  canTransitionPayment,
  canTransitionStatus,
  canCompleteOrder,
  canStartPreparing,
} from './state-machine.js';
import { generateToken, sha256Hex } from '../security/tokens.js';
import { badRequest, conflict, notFound } from '../utils/app-error.js';
import { EVENT_TYPES } from '../events/event-types.js';

const DEMO_REFERENCE_LENGTH = 8;

export class OrderService {
  constructor({ db, eventBus, audit }) {
    this.db = db;
    this.eventBus = eventBus;
    this.audit = audit;
    this.orders = new OrderRepository(db);
    this.catalog = new CatalogRepository(db);
  }

  /**
   * Create an order. `input` is already schema-validated; prices are always
   * loaded from the database. Idempotency: reusing an Idempotency-Key returns
   * the original order (receipt token cannot be re-issued - only its hash is
   * stored - so duplicate responses carry receiptToken: null and duplicate: true).
   */
  createOrder({ input, idempotencyKey, requestId, ip }) {
    const existing = this.orders.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        order: this.serializeOrder(this.orders.detail(existing.id)),
        receiptToken: null,
        duplicate: true,
      };
    }

    // Allocate order number and create the complete order atomically in one
    // IMMEDIATE transaction (holds a RESERVED lock from the start, so two
    // concurrent checkouts cannot allocate the same daily sequence).
    const create = this.db.transaction(() => {
      const { orderNumber, businessDate, dailySequence } = allocateOrderNumber(this.db);
      const receiptToken = generateToken(24);
      const order = this.buildOrder({
        input,
        idempotencyKey,
        orderNumber,
        businessDate,
        dailySequence,
        receiptToken,
      });
      return { order, receiptToken };
    });
    const result = create.immediate();
    const { order, receiptToken } = result;

    // Serialize from a fresh DB read so the public shape always matches the
    // stored snapshot rows (identical to the duplicate/idempotency path).
    const serialized = this.serializeOrder(this.orders.detail(order.id));

    this.audit.record({
      actor: 'kiosk',
      actorRole: 'kiosk',
      action: 'ORDER_CREATED',
      targetType: 'order',
      targetId: order.id,
      newState: { orderNumber: order.order_number, totalCentavos: order.total_centavos },
      requestId,
      ip,
    });

    this.eventBus.publish({
      type: EVENT_TYPES.ORDER_CREATED,
      data: serialized,
    });

    return { order: serialized, receiptToken, duplicate: false };
  }

  /**
   * Validate items against the live catalog and build the order row inside
   * the caller's transaction. Throws AppError on any violation.
   */
  buildOrder({ input, idempotencyKey, orderNumber, businessDate, dailySequence, receiptToken }) {
    const products = this.catalog.findProductsByIds(
      input.items.map((i) => i.productId),
      {
        publishedOnly: true,
      },
    );
    const productById = new Map(products.map((p) => [p.id, p]));
    const addons = this.catalog.findAddonsByIds([
      ...new Set(input.items.flatMap((i) => i.addonIds || [])),
    ]);
    const addonById = new Map(addons.map((a) => [a.id, a]));

    const fieldErrors = {};
    const items = input.items.map((item, index) => {
      // Normalize defensively: the route validates via zod, but the service
      // must not crash on direct callers that omit optional arrays.
      const addonIds = item.addonIds || [];
      const optionIds = item.optionIds || [];
      const product = productById.get(item.productId);
      if (!product) {
        fieldErrors[`items.${index}.productId`] = 'PRODUCT_NOT_FOUND';
        return null;
      }
      if (!product.is_available) {
        fieldErrors[`items.${index}.productId`] = 'PRODUCT_UNAVAILABLE';
        return null;
      }

      if (new Set(addonIds).size !== addonIds.length) {
        fieldErrors[`items.${index}.addonIds`] = 'DUPLICATE_ADDON';
        return null;
      }
      if (new Set(optionIds).size !== optionIds.length) {
        fieldErrors[`items.${index}.optionIds`] = 'DUPLICATE_OPTION';
        return null;
      }

      // Add-ons: must exist and be in the product compatibility matrix.
      const allowedAddonIds = new Set(this.catalog.addonIdsForProduct(product.id));
      const itemAddons = [];
      for (const addonId of addonIds) {
        const addon = addonById.get(addonId);
        if (!addon) {
          fieldErrors[`items.${index}.addonIds`] = 'ADDON_NOT_FOUND';
          return null;
        }
        if (!allowedAddonIds.has(addonId)) {
          fieldErrors[`items.${index}.addonIds`] = 'ADDON_INCOMPATIBLE';
          return null;
        }
        itemAddons.push(addon);
      }

      // Options: must belong to this product's groups and satisfy the
      // required/min/max constraints of each group.
      const groups = this.catalog.optionGroupsForProduct(product.id);
      const groupIds = groups.map((g) => g.id);
      const options = this.catalog.optionsForGroups(groupIds);
      const optionById = new Map(options.map((o) => [o.id, o]));

      const counts = new Map();
      const itemOptions = [];
      for (const optionId of optionIds) {
        const option = optionById.get(optionId);
        if (!option) {
          fieldErrors[`items.${index}.optionIds`] = 'OPTION_NOT_FOUND';
          return null;
        }
        counts.set(option.group_id, (counts.get(option.group_id) || 0) + 1);
        itemOptions.push(option);
      }
      for (const group of groups) {
        const selected = counts.get(group.id) || 0;
        if (group.is_required && selected < group.min_select) {
          fieldErrors[`items.${index}.optionIds`] = 'REQUIRED_OPTIONS';
          return null;
        }
        if (group.max_select > 0 && selected > group.max_select) {
          fieldErrors[`items.${index}.optionIds`] = 'OPTION_LIMIT';
          return null;
        }
      }

      if (
        !Number.isInteger(item.quantity) ||
        item.quantity < MIN_QUANTITY ||
        item.quantity > MAX_QUANTITY
      ) {
        fieldErrors[`items.${index}.quantity`] = 'QUANTITY_OUT_OF_RANGE';
        return null;
      }

      const unitPriceCentavos =
        product.price_centavos +
        itemAddons.reduce((sum, a) => sum + a.price_centavos, 0) +
        itemOptions.reduce((sum, o) => sum + o.price_centavos, 0);
      const lineTotalCentavos = unitPriceCentavos * item.quantity;

      return {
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        unitPriceCentavos,
        quantity: item.quantity,
        lineTotalCentavos,
        addons: itemAddons.map((a) => ({
          id: a.id,
          name: a.name_en,
          priceCentavos: a.price_centavos,
        })),
        options: itemOptions.map((o) => ({
          id: o.id,
          name: o.name_en,
          priceCentavos: o.price_centavos,
        })),
      };
    });

    if (Object.keys(fieldErrors).length > 0) {
      throw badRequest('VALIDATION_ERROR', 'Order items failed validation', fieldErrors);
    }

    const subtotalCentavos = items.reduce((sum, i) => sum + i.lineTotalCentavos, 0);
    const totalCentavos = subtotalCentavos;

    const paymentStatus = input.paymentMethod === 'cash' ? 'pending_cash' : 'demo_confirmed';

    const order = this.orders.insert({
      orderNumber,
      businessDate,
      dailySequence,
      status: 'placed',
      paymentMethod: input.paymentMethod,
      paymentStatus,
      locale: input.locale || 'en',
      subtotalCentavos,
      totalCentavos,
      idempotencyKey,
      receiptTokenHash: sha256Hex(receiptToken),
      items,
    });
    order.receipt_token_hash = undefined;
    return { ...order, items };
  }

  /** Serialize a DB row into the public API shape. */
  serializeOrder(order) {
    const items = (order.items || []).map((item) => ({
      productId: item.product_id,
      productSku: item.product_sku,
      productName: item.product_name,
      unitPriceCentavos: item.unit_price_centavos,
      quantity: item.quantity,
      lineTotalCentavos: item.line_total_centavos,
      addons: (item.addons || []).map((a) => ({
        id: a.addon_id,
        name: a.addon_name,
        priceCentavos: a.addon_price_centavos,
      })),
      options: (item.options || []).map((o) => ({
        id: o.option_id,
        name: o.option_name,
        priceCentavos: o.option_price_centavos,
      })),
    }));
    return {
      id: order.id,
      orderNumber: order.order_number,
      businessDate: order.business_date,
      dailySequence: order.daily_sequence,
      status: order.status,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      locale: order.locale,
      subtotalCentavos: order.subtotal_centavos,
      totalCentavos: order.total_centavos,
      version: order.version,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      completedAt: order.completed_at || null,
      cancelledAt: order.cancelled_at || null,
      preparingAt: order.preparing_at || null,
      readyAt: order.ready_at || null,
      paymentConfirmedAt: order.payment_confirmed_at || null,
      itemCount: order.item_count ?? items.reduce((sum, item) => sum + item.quantity, 0),
      items,
    };
  }

  /**
   * Fetch a receipt by order number + opaque token. Only the token hash is
   * stored, so a missing/incorrect token is indistinguishable from a missing
   * order (404).
   */
  getReceipt(orderNumber, token) {
    if (!token || typeof token !== 'string') {
      throw notFound('INVALID_RECEIPT_TOKEN', 'Receipt not found');
    }
    const hash = sha256Hex(token);
    const order = this.orders.findByReceiptTokenHash(hash);
    if (!order || order.order_number !== orderNumber) {
      throw notFound('INVALID_RECEIPT_TOKEN', 'Receipt not found');
    }
    return this.serializeOrder(this.orders.detail(order.id));
  }

  /** Change preparation status with optimistic concurrency. */
  changeStatus({ orderId, newStatus, version, actor, actorRole, requestId, ip }) {
    const order = this.orders.findById(orderId);
    if (!order) throw notFound('ORDER_NOT_FOUND', 'Order not found');
    if (order.version !== version) {
      throw conflict('STALE_VERSION', 'Order was modified by another action', {
        order: this.serializeOrder(this.orders.detail(orderId)),
      });
    }
    if (!canTransitionStatus(order.status, newStatus)) {
      throw conflict(
        'INVALID_TRANSITION',
        `Cannot move order from ${order.status} to ${newStatus}`,
        {
          order: this.serializeOrder(this.orders.detail(orderId)),
        },
      );
    }
    if (newStatus === 'preparing' && !canStartPreparing(order)) {
      throw conflict(
        'PREPARING_PAYMENT_REQUIRED',
        'Payment must be confirmed before preparation can start',
        {
          order: this.serializeOrder(this.orders.detail(orderId)),
        },
      );
    }
    if (newStatus === 'completed' && !canCompleteOrder(order)) {
      throw conflict(
        'PAYMENT_NOT_CONFIRMED',
        'Cash order cannot be completed until cash is received',
        {
          order: this.serializeOrder(this.orders.detail(orderId)),
        },
      );
    }

    const previous = { status: order.status, payment_status: order.payment_status };
    const updated = this.orders.updateStatus(orderId, newStatus, {
      preparingAt: newStatus === 'preparing' ? new Date().toISOString() : undefined,
      readyAt: newStatus === 'ready' ? new Date().toISOString() : undefined,
      completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined,
      cancelledAt: newStatus === 'cancelled' ? new Date().toISOString() : undefined,
    });

    this.audit.record({
      actor,
      actorRole,
      action: newStatus === 'cancelled' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_CHANGED',
      targetType: 'order',
      targetId: orderId,
      previousState: previous,
      newState: {
        status: updated.status,
        payment_status: updated.payment_status,
        version: updated.version,
      },
      requestId,
      ip,
    });

    this.eventBus.publish({
      type: EVENT_TYPES.ORDER_UPDATED,
      data: this.serializeOrder(this.orders.detail(orderId)),
    });
    return this.serializeOrder(this.orders.detail(orderId));
  }

  /** Confirm cash payment. Demo orders never change. */
  confirmCash({ orderId, version, actor, actorRole, requestId, ip }) {
    const order = this.orders.findById(orderId);
    if (!order) throw notFound('ORDER_NOT_FOUND', 'Order not found');
    if (order.version !== version) {
      throw conflict('STALE_VERSION', 'Order was modified by another action', {
        order: this.serializeOrder(this.orders.detail(orderId)),
      });
    }
    if (order.payment_method !== 'cash') {
      throw conflict('INVALID_PAYMENT_STATE', 'Only cash orders can receive cash confirmation', {
        order: this.serializeOrder(this.orders.detail(orderId)),
      });
    }
    if (!canTransitionPayment(order.payment_status, 'cash_received')) {
      throw conflict('INVALID_PAYMENT_STATE', `Cannot confirm cash for ${order.payment_status}`, {
        order: this.serializeOrder(this.orders.detail(orderId)),
      });
    }

    const previous = { status: order.status, payment_status: order.payment_status };
    const updated = this.orders.updatePaymentStatus(
      orderId,
      'cash_received',
      new Date().toISOString(),
    );

    this.audit.record({
      actor,
      actorRole,
      action: 'CASH_CONFIRMED',
      targetType: 'order',
      targetId: orderId,
      previousState: previous,
      newState: {
        status: updated.status,
        payment_status: updated.payment_status,
        version: updated.version,
      },
      requestId,
      ip,
    });

    this.eventBus.publish({
      type: EVENT_TYPES.ORDER_UPDATED,
      data: this.serializeOrder(this.orders.detail(orderId)),
    });
    return this.serializeOrder(this.orders.detail(orderId));
  }

  /** Generate a clearly non-financial demo reference, e.g. DEMO-3F9A2C81. */
  static generateDemoReference() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    const bytes = generateToken(DEMO_REFERENCE_LENGTH);
    for (let i = 0; i < DEMO_REFERENCE_LENGTH; i += 1) {
      out += alphabet[bytes.charCodeAt(i) % alphabet.length];
    }
    return `DEMO-${out}`;
  }
}
