import { MAX_QUANTITY, MIN_QUANTITY } from '@kiosk/shared';
import {
  canTransitionPayment,
  canTransitionStatus,
  canCompleteOrder,
  canStartPreparing,
} from '../domain/state-machine.js';
import { generateToken, sha256Hex } from '../security/tokens.js';
import { badRequest, conflict, notFound } from '../utils/app-error.js';
import { EVENT_TYPES } from '../events/event-types.js';
import { PgCatalogRepository, PgOrderRepository } from './repositories.js';
import { allocatePostgresOrderNumber } from './order-number.js';

export class PgOrderService {
  constructor({ db, eventBus, audit, deploymentId = 'cloud-fallback' }) {
    this.db = db;
    this.eventBus = eventBus;
    this.audit = audit;
    this.deploymentId = deploymentId;
    this.orders = new PgOrderRepository(db);
    this.catalog = new PgCatalogRepository(db);
  }

  async createOrder({ input, idempotencyKey, requestId, ip }) {
    const existing = await this.orders.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        order: this.serializeOrder(await this.orders.detail(existing.id)),
        receiptToken: null,
        duplicate: true,
      };
    }

    const result = await this.db.transaction(async (tx) => {
      const orders = new PgOrderRepository(tx);
      const catalog = new PgCatalogRepository(tx);
      const sequence = await allocatePostgresOrderNumber(tx);
      const receiptToken = generateToken(24);
      const built = await this.buildOrder({
        input,
        idempotencyKey,
        receiptToken,
        sequence,
        orders,
        catalog,
      });
      return { order: built, receiptToken };
    });

    const serialized = this.serializeOrder(await this.orders.detail(result.order.id));
    await this.audit.record({
      actor: 'kiosk',
      actorRole: 'kiosk',
      action: 'ORDER_CREATED',
      targetType: 'order',
      targetId: result.order.id,
      newState: {
        orderNumber: result.order.order_number,
        totalCentavos: result.order.total_centavos,
      },
      requestId,
      ip,
    });
    this.eventBus.publish({ type: EVENT_TYPES.ORDER_CREATED, data: serialized });
    return { order: serialized, receiptToken: result.receiptToken, duplicate: false };
  }

  async buildOrder({ input, idempotencyKey, receiptToken, sequence, orders, catalog }) {
    const products = await catalog.findProductsByIds(
      input.items.map((item) => item.productId),
      {
        publishedOnly: true,
      },
    );
    const productById = new Map(products.map((product) => [product.id, product]));
    const addons = await catalog.findAddonsByIds([
      ...new Set(input.items.flatMap((item) => item.addonIds || [])),
    ]);
    const configuration = await catalog.getProductConfiguration(
      products.map((product) => product.id),
    );
    const addonById = new Map(addons.map((addon) => [addon.id, addon]));
    const fieldErrors = {};
    const items = [];

    for (const [index, item] of input.items.entries()) {
      const addonIds = item.addonIds || [];
      const optionIds = item.optionIds || [];
      const product = productById.get(item.productId);
      if (!product) {
        fieldErrors[`items.${index}.productId`] = 'PRODUCT_NOT_FOUND';
        continue;
      }
      if (!product.is_available) {
        fieldErrors[`items.${index}.productId`] = 'PRODUCT_UNAVAILABLE';
        continue;
      }
      if (new Set(addonIds).size !== addonIds.length) {
        fieldErrors[`items.${index}.addonIds`] = 'DUPLICATE_ADDON';
        continue;
      }
      if (new Set(optionIds).size !== optionIds.length) {
        fieldErrors[`items.${index}.optionIds`] = 'DUPLICATE_OPTION';
        continue;
      }
      if (
        !Number.isInteger(item.quantity) ||
        item.quantity < MIN_QUANTITY ||
        item.quantity > MAX_QUANTITY
      ) {
        fieldErrors[`items.${index}.quantity`] = 'QUANTITY_OUT_OF_RANGE';
        continue;
      }

      const allowedAddonIds = new Set(configuration.addonIdsByProduct.get(product.id) || []);
      const itemAddons = [];
      for (const addonId of addonIds) {
        const addon = addonById.get(addonId);
        if (!addon) {
          fieldErrors[`items.${index}.addonIds`] = 'ADDON_NOT_FOUND';
          break;
        }
        if (!allowedAddonIds.has(addonId)) {
          fieldErrors[`items.${index}.addonIds`] = 'ADDON_INCOMPATIBLE';
          break;
        }
        itemAddons.push(addon);
      }
      if (fieldErrors[`items.${index}.addonIds`]) continue;

      const groups = configuration.optionGroupsByProduct.get(product.id) || [];
      const options = groups.flatMap((group) => configuration.optionsByGroup.get(group.id) || []);
      const optionById = new Map(options.map((option) => [option.id, option]));
      const counts = new Map();
      const itemOptions = [];
      for (const optionId of optionIds) {
        const option = optionById.get(optionId);
        if (!option) {
          fieldErrors[`items.${index}.optionIds`] = 'OPTION_NOT_FOUND';
          break;
        }
        counts.set(option.group_id, (counts.get(option.group_id) || 0) + 1);
        itemOptions.push(option);
      }
      if (fieldErrors[`items.${index}.optionIds`]) continue;
      for (const group of groups) {
        const selected = counts.get(group.id) || 0;
        if (group.is_required && selected < group.min_select)
          fieldErrors[`items.${index}.optionIds`] = 'REQUIRED_OPTIONS';
        if (group.max_select > 0 && selected > group.max_select)
          fieldErrors[`items.${index}.optionIds`] = 'OPTION_LIMIT';
      }
      if (fieldErrors[`items.${index}.optionIds`]) continue;

      const unitPriceCentavos =
        product.price_centavos +
        itemAddons.reduce((sum, addon) => sum + addon.price_centavos, 0) +
        itemOptions.reduce((sum, option) => sum + option.price_centavos, 0);
      items.push({
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        unitPriceCentavos,
        quantity: item.quantity,
        lineTotalCentavos: unitPriceCentavos * item.quantity,
        addons: itemAddons.map((addon) => ({
          id: addon.id,
          name: addon.name_en,
          priceCentavos: addon.price_centavos,
        })),
        options: itemOptions.map((option) => ({
          id: option.id,
          name: option.name_en,
          priceCentavos: option.price_centavos,
        })),
      });
    }
    if (Object.keys(fieldErrors).length)
      throw badRequest('VALIDATION_ERROR', 'Order items failed validation', fieldErrors);
    const subtotalCentavos = items.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
    const paymentStatus = input.paymentMethod === 'cash' ? 'pending_cash' : 'demo_confirmed';
    const order = await orders.insert({
      orderNumber: sequence.orderNumber,
      businessDate: sequence.businessDate,
      dailySequence: sequence.dailySequence,
      status: 'placed',
      paymentMethod: input.paymentMethod,
      paymentStatus,
      locale: input.locale || 'en',
      subtotalCentavos,
      totalCentavos: subtotalCentavos,
      idempotencyKey,
      receiptTokenHash: sha256Hex(receiptToken),
      items,
      deploymentId: this.deploymentId,
    });
    return { ...order, items };
  }

  serializeOrder(order) {
    const items = (order.items || []).map((item) => ({
      productId: item.product_id,
      productSku: item.product_sku,
      productName: item.product_name,
      unitPriceCentavos: item.unit_price_centavos,
      quantity: item.quantity,
      lineTotalCentavos: item.line_total_centavos,
      addons: (item.addons || []).map((addon) => ({
        id: addon.addon_id,
        name: addon.addon_name,
        priceCentavos: addon.addon_price_centavos,
      })),
      options: (item.options || []).map((option) => ({
        id: option.option_id,
        name: option.option_name,
        priceCentavos: option.option_price_centavos,
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

  async getReceipt(orderNumber, token) {
    if (!token || typeof token !== 'string')
      throw notFound('INVALID_RECEIPT_TOKEN', 'Receipt not found');
    const order = await this.orders.findByReceiptTokenHash(sha256Hex(token));
    if (!order || order.order_number !== orderNumber)
      throw notFound('INVALID_RECEIPT_TOKEN', 'Receipt not found');
    return this.serializeOrder(await this.orders.detail(order.id));
  }

  async changeStatus({ orderId, newStatus, version, actor, actorRole, requestId, ip }) {
    const order = await this.orders.findById(orderId);
    if (!order) throw notFound('ORDER_NOT_FOUND', 'Order not found');
    if (order.version !== version)
      throw conflict('STALE_VERSION', 'Order was modified by another action', {
        order: this.serializeOrder(await this.orders.detail(orderId)),
      });
    if (!canTransitionStatus(order.status, newStatus))
      throw conflict(
        'INVALID_TRANSITION',
        `Cannot move order from ${order.status} to ${newStatus}`,
        { order: this.serializeOrder(await this.orders.detail(orderId)) },
      );
    if (newStatus === 'preparing' && !canStartPreparing(order))
      throw conflict(
        'PREPARING_PAYMENT_REQUIRED',
        'Payment must be confirmed before preparation can start',
        { order: this.serializeOrder(await this.orders.detail(orderId)) },
      );
    if (newStatus === 'completed' && !canCompleteOrder(order))
      throw conflict(
        'PAYMENT_NOT_CONFIRMED',
        'Cash order cannot be completed until cash is received',
        { order: this.serializeOrder(await this.orders.detail(orderId)) },
      );
    const updated = await this.orders.updateStatus(orderId, newStatus, {
      version,
      preparingAt: newStatus === 'preparing' ? new Date().toISOString() : undefined,
      readyAt: newStatus === 'ready' ? new Date().toISOString() : undefined,
      completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined,
      cancelledAt: newStatus === 'cancelled' ? new Date().toISOString() : undefined,
    });
    if (!updated) throw conflict('STALE_VERSION', 'Order was modified by another action');
    await this.audit.record({
      actor,
      actorRole,
      action: newStatus === 'cancelled' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_CHANGED',
      targetType: 'order',
      targetId: orderId,
      previousState: { status: order.status, payment_status: order.payment_status },
      newState: {
        status: updated.status,
        payment_status: updated.payment_status,
        version: updated.version,
      },
      requestId,
      ip,
    });
    const serialized = this.serializeOrder(await this.orders.detail(orderId));
    this.eventBus.publish({ type: EVENT_TYPES.ORDER_UPDATED, data: serialized });
    return serialized;
  }

  async confirmCash({ orderId, version, actor, actorRole, requestId, ip }) {
    const order = await this.orders.findById(orderId);
    if (!order) throw notFound('ORDER_NOT_FOUND', 'Order not found');
    if (order.version !== version)
      throw conflict('STALE_VERSION', 'Order was modified by another action', {
        order: this.serializeOrder(await this.orders.detail(orderId)),
      });
    if (order.payment_method !== 'cash')
      throw conflict('INVALID_PAYMENT_STATE', 'Only cash orders can receive cash confirmation', {
        order: this.serializeOrder(await this.orders.detail(orderId)),
      });
    if (!canTransitionPayment(order.payment_status, 'cash_received'))
      throw conflict('INVALID_PAYMENT_STATE', `Cannot confirm cash for ${order.payment_status}`, {
        order: this.serializeOrder(await this.orders.detail(orderId)),
      });
    const updated = await this.orders.updatePaymentStatus(
      orderId,
      'cash_received',
      new Date().toISOString(),
      actor,
      version,
    );
    if (!updated) throw conflict('STALE_VERSION', 'Order was modified by another action');
    await this.audit.record({
      actor,
      actorRole,
      action: 'CASH_CONFIRMED',
      targetType: 'order',
      targetId: orderId,
      previousState: { status: order.status, payment_status: order.payment_status },
      newState: {
        status: updated.status,
        payment_status: updated.payment_status,
        version: updated.version,
      },
      requestId,
      ip,
    });
    const serialized = this.serializeOrder(await this.orders.detail(orderId));
    this.eventBus.publish({ type: EVENT_TYPES.ORDER_UPDATED, data: serialized });
    return serialized;
  }
}
