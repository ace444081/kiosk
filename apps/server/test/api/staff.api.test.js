import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeTestApp, createTestAdmin, cashOrderPayload, demoOrderPayload } from '../utils.js';

describe('role-based station workflow', () => {
  let ctx;
  beforeEach(() => {
    ctx = makeTestApp();
    for (const role of ['admin', 'cashier', 'kitchen', 'serving']) {
      createTestAdmin(ctx.db, { username: role, password: `${role}-pass-123`, role });
    }
  });
  afterEach(() => {
    ctx.db.close();
    ctx.cleanup();
  });

  const key = () => `station-${Math.random().toString(36).slice(2, 16)}`;
  const login = async (role) => {
    const agent = request.agent(ctx.app);
    const response = await agent
      .post('/api/v1/staff/session')
      .set('X-Staff-Station', role)
      .send({ username: role, password: `${role}-pass-123` });
    expect(response.status).toBe(200);
    expect(response.body.role).toBe(role);
    return { agent, csrf: response.body.csrfToken };
  };

  it('moves a cash order cashier -> kitchen -> serving with timestamps and role audit', async () => {
    const created = await request(ctx.app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', key())
      .send(cashOrderPayload());
    const cashier = await login('cashier');
    const cashQueue = await cashier.agent.get('/api/v1/staff/queue/cashier');
    expect(cashQueue.body.orders.map((order) => order.id)).toContain(created.body.id);
    const paid = await cashier.agent
      .patch(`/api/v1/staff/orders/${created.body.id}/payment`)
      .set('X-CSRF-Token', cashier.csrf)
      .send({ paymentStatus: 'cash_received', version: created.body.version });
    expect(paid.status).toBe(200);
    expect(paid.body.order.paymentConfirmedAt).toBeTruthy();

    const kitchen = await login('kitchen');
    const kitchenQueue = await kitchen.agent.get('/api/v1/staff/queue/kitchen');
    expect(kitchenQueue.body.orders.map((order) => order.id)).toContain(created.body.id);
    expect(kitchenQueue.body.orders[0]).not.toHaveProperty('totalCentavos');
    const preparing = await kitchen.agent
      .patch(`/api/v1/staff/orders/${created.body.id}/status`)
      .set('X-CSRF-Token', kitchen.csrf)
      .send({ status: 'preparing', version: paid.body.order.version });
    expect(preparing.body.order.preparingAt).toBeTruthy();
    const ready = await kitchen.agent
      .patch(`/api/v1/staff/orders/${created.body.id}/status`)
      .set('X-CSRF-Token', kitchen.csrf)
      .send({ status: 'ready', version: preparing.body.order.version });
    expect(ready.body.order.readyAt).toBeTruthy();

    const serving = await login('serving');
    const servingQueue = await serving.agent.get('/api/v1/staff/queue/serving');
    expect(servingQueue.body.orders.map((order) => order.id)).toContain(created.body.id);
    const completed = await serving.agent
      .patch(`/api/v1/staff/orders/${created.body.id}/status`)
      .set('X-CSRF-Token', serving.csrf)
      .send({ status: 'completed', version: ready.body.order.version });
    expect(completed.body.order.completedAt).toBeTruthy();

    const audit = ctx.db
      .prepare(
        `SELECT actor, actor_role, action FROM audit_events
       WHERE target_id = ? AND action IN ('CASH_CONFIRMED','ORDER_STATUS_CHANGED')
       ORDER BY created_at`,
      )
      .all(created.body.id);
    expect(audit.map((event) => event.actor_role)).toEqual([
      'cashier',
      'kitchen',
      'kitchen',
      'serving',
    ]);

    const visible = await request(ctx.app).get('/api/v1/orders/board');
    expect(visible.body.orders.map((order) => order.orderNumber)).toContain(
      created.body.orderNumber,
    );
    ctx.db
      .prepare(
        "UPDATE orders SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','-61 seconds') WHERE id = ?",
      )
      .run(created.body.id);
    const expired = await request(ctx.app).get('/api/v1/orders/board');
    expect(expired.body.orders.map((order) => order.orderNumber)).not.toContain(
      created.body.orderNumber,
    );
  });

  it('keeps an admin session alive when a station session logs in in another tab', async () => {
    const agent = request.agent(ctx.app);
    const adminLogin = await agent
      .post('/api/v1/admin/session')
      .send({ username: 'admin', password: 'admin-pass-123' });
    expect(adminLogin.status).toBe(200);
    const staffLogin = await agent
      .post('/api/v1/staff/session')
      .set('X-Staff-Station', 'kitchen')
      .send({ username: 'kitchen', password: 'kitchen-pass-123' });
    expect(staffLogin.status).toBe(200);
    expect(staffLogin.headers['set-cookie'].join(';')).toContain('sgkiosk.staff.kitchen.sid=');
    const adminSession = await agent.get('/api/v1/admin/session');
    const staffSession = await agent.get('/api/v1/staff/session').set('X-Staff-Station', 'kitchen');
    expect(adminSession.body.role).toBe('admin');
    expect(staffSession.body.role).toBe('kitchen');
  });

  it('keeps separate station sessions when the same browser uses multiple tabs', async () => {
    const agent = request.agent(ctx.app);
    const servingLogin = await agent
      .post('/api/v1/staff/session')
      .set('X-Staff-Station', 'serving')
      .send({ username: 'serving', password: 'serving-pass-123' });
    const kitchenLogin = await agent
      .post('/api/v1/staff/session')
      .set('X-Staff-Station', 'kitchen')
      .send({ username: 'kitchen', password: 'kitchen-pass-123' });

    expect(servingLogin.status).toBe(200);
    expect(kitchenLogin.status).toBe(200);
    expect(servingLogin.body.csrfToken).not.toBe(kitchenLogin.body.csrfToken);
    expect(
      (await agent.get('/api/v1/staff/session').set('X-Staff-Station', 'serving')).body.role,
    ).toBe('serving');
    expect(
      (await agent.get('/api/v1/staff/session').set('X-Staff-Station', 'kitchen')).body.role,
    ).toBe('kitchen');
  });

  it('enforces station roles even for manually called APIs', async () => {
    const created = await request(ctx.app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', key())
      .send(cashOrderPayload());
    const kitchen = await login('kitchen');
    const forbidden = await kitchen.agent
      .patch(`/api/v1/staff/orders/${created.body.id}/payment`)
      .set('X-CSRF-Token', kitchen.csrf)
      .send({ paymentStatus: 'cash_received', version: created.body.version });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
    expect((await kitchen.agent.get('/api/v1/staff/queue/cashier')).status).toBe(403);
    expect(
      (await kitchen.agent.get('/api/v1/admin/reports/summary?from=2026-08-06&to=2026-08-06'))
        .status,
    ).toBe(401);
  });

  it('sends demo wallet orders directly to kitchen and sanitizes the public board', async () => {
    const created = await request(ctx.app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', key())
      .send(demoOrderPayload());
    expect(created.body.paymentConfirmedAt).toBeTruthy();
    const cashier = await login('cashier');
    expect((await cashier.agent.get('/api/v1/staff/queue/cashier')).body.orders).toHaveLength(0);
    const kitchen = await login('kitchen');
    expect(
      (await kitchen.agent.get('/api/v1/staff/queue/kitchen')).body.orders.map((order) => order.id),
    ).toContain(created.body.id);

    const board = await request(ctx.app).get('/api/v1/orders/board');
    expect(board.status).toBe(200);
    const publicOrder = board.body.orders.find(
      (order) => order.orderNumber === created.body.orderNumber,
    );
    expect(publicOrder).toEqual({
      orderNumber: created.body.orderNumber,
      publicStatus: 'preparing',
      displayTimestamp: expect.any(String),
    });
    expect(JSON.stringify(board.body)).not.toContain('totalCentavos');
    expect(JSON.stringify(board.body)).not.toContain('paymentStatus');
    expect(JSON.stringify(board.body)).not.toContain('productName');
  });
});
