import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeTestApp, createTestAdmin, cashOrderPayload, demoOrderPayload } from '../utils.js';

describe('unified staff station workflow', () => {
  let ctx;

  beforeEach(() => {
    ctx = makeTestApp();
    createTestAdmin(ctx.db, { username: 'admin', password: 'admin-pass-123', role: 'admin' });
    createTestAdmin(ctx.db, { username: 'staff', password: 'staff-pass-123', role: 'staff' });
    createTestAdmin(ctx.db, { username: 'staff-b', password: 'staff-b-pass-123', role: 'staff' });
  });

  afterEach(() => {
    ctx.db.close();
    ctx.cleanup();
  });

  const key = () => `station-${Math.random().toString(36).slice(2, 16)}`;
  const login = async (station = 'launcher', username = 'staff') => {
    const agent = request.agent(ctx.app);
    const password = username === 'staff-b' ? 'staff-b-pass-123' : 'staff-pass-123';
    const response = await agent
      .post('/api/v1/staff/session')
      .set('X-Staff-Station', station)
      .send({ username, password });
    expect(response.status).toBe(200);
    expect(response.body.role).toBe('staff');
    return { agent, csrf: response.body.csrfToken };
  };

  it('lets one staff account run cashier, kitchen, and serving views', async () => {
    const created = await request(ctx.app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', key())
      .send(cashOrderPayload());
    const staff = await login('cashier');

    const workboard = await staff.agent.get('/api/v1/staff/workboard');
    expect(workboard.status).toBe(200);
    expect(workboard.body).toEqual(
      expect.objectContaining({
        payment: expect.any(Object),
        preparation: expect.any(Object),
        handoff: expect.any(Object),
      }),
    );

    const cashQueue = await staff.agent.get('/api/v1/staff/queue/cashier');
    expect(cashQueue.body.orders.map((order) => order.id)).toContain(created.body.id);

    const paid = await staff.agent
      .patch(`/api/v1/staff/orders/${created.body.id}/payment`)
      .set('X-CSRF-Token', staff.csrf)
      .send({ paymentStatus: 'cash_received', version: created.body.version });
    expect(paid.status).toBe(200);
    expect(paid.body.order.paymentConfirmedAt).toBeTruthy();

    const kitchenQueue = await staff.agent.get('/api/v1/staff/queue/kitchen');
    expect(kitchenQueue.body.orders.map((order) => order.id)).toContain(created.body.id);
    expect(kitchenQueue.body.orders[0]).not.toHaveProperty('totalCentavos');

    const preparing = await staff.agent
      .patch(`/api/v1/staff/orders/${created.body.id}/status`)
      .set('X-CSRF-Token', staff.csrf)
      .send({ status: 'preparing', version: paid.body.order.version });
    expect(preparing.body.order.preparingAt).toBeTruthy();
    const ready = await staff.agent
      .patch(`/api/v1/staff/orders/${created.body.id}/status`)
      .set('X-CSRF-Token', staff.csrf)
      .send({ status: 'ready', version: preparing.body.order.version });
    expect(ready.body.order.readyAt).toBeTruthy();

    const servingQueue = await staff.agent.get('/api/v1/staff/queue/serving');
    expect(servingQueue.body.orders.map((order) => order.id)).toContain(created.body.id);
    const completed = await staff.agent
      .patch(`/api/v1/staff/orders/${created.body.id}/status`)
      .set('X-CSRF-Token', staff.csrf)
      .send({ status: 'completed', version: ready.body.order.version });
    expect(completed.body.order.completedAt).toBeTruthy();
    const completedWorkboard = await staff.agent.get('/api/v1/staff/workboard');
    expect(completedWorkboard.body.handoff.orders.map((order) => order.id)).not.toContain(
      created.body.id,
    );

    const audit = ctx.db
      .prepare(
        `SELECT actor, actor_role, action FROM audit_events
       WHERE target_id = ? AND action IN ('CASH_CONFIRMED','ORDER_STATUS_CHANGED')
       ORDER BY created_at`,
      )
      .all(created.body.id);
    expect(audit.map((event) => event.actor_role)).toEqual(['staff', 'staff', 'staff', 'staff']);
    expect(audit.map((event) => event.actor)).toEqual(['staff', 'staff', 'staff', 'staff']);
  });

  it('attributes cash activity to the staff account that confirms payment', async () => {
    const created = await request(ctx.app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', key())
      .send(cashOrderPayload());
    const staffB = await login('cashier', 'staff-b');
    const paid = await staffB.agent
      .patch(`/api/v1/staff/orders/${created.body.id}/payment`)
      .set('X-CSRF-Token', staffB.csrf)
      .send({ paymentStatus: 'cash_received', version: created.body.version });
    expect(paid.status).toBe(200);

    const admin = request.agent(ctx.app);
    const loginResponse = await admin
      .post('/api/v1/admin/session')
      .send({ username: 'admin', password: 'admin-pass-123' });
    const analytics = await admin.get(
      `/api/v1/admin/analytics?from=${created.body.businessDate}&to=${created.body.businessDate}`,
    );
    expect(loginResponse.status).toBe(200);
    expect(analytics.status).toBe(200);
    expect(analytics.body.analytics.staffPerformance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: 'staff-b', cashConfirmedOrders: 1 }),
        expect.objectContaining({ username: 'staff', cashConfirmedOrders: 0 }),
      ]),
    );
  });

  it('keeps admin and station sessions independent', async () => {
    const agent = request.agent(ctx.app);
    const adminLogin = await agent
      .post('/api/v1/admin/session')
      .send({ username: 'admin', password: 'admin-pass-123' });
    const staffLogin = await agent
      .post('/api/v1/staff/session')
      .set('X-Staff-Station', 'kitchen')
      .send({ username: 'staff', password: 'staff-pass-123' });
    expect(adminLogin.status).toBe(200);
    expect(staffLogin.headers['set-cookie'].join(';')).toContain('sgkiosk.staff.kitchen.sid=');
    expect((await agent.get('/api/v1/admin/session')).body.role).toBe('admin');
    expect(
      (await agent.get('/api/v1/staff/session').set('X-Staff-Station', 'kitchen')).body.role,
    ).toBe('staff');
  });

  it('keeps separate station sessions for one unified staff account', async () => {
    const agent = request.agent(ctx.app);
    const servingLogin = await agent
      .post('/api/v1/staff/session')
      .set('X-Staff-Station', 'serving')
      .send({ username: 'staff', password: 'staff-pass-123' });
    const kitchenLogin = await agent
      .post('/api/v1/staff/session')
      .set('X-Staff-Station', 'kitchen')
      .send({ username: 'staff', password: 'staff-pass-123' });

    expect(servingLogin.status).toBe(200);
    expect(kitchenLogin.status).toBe(200);
    expect(servingLogin.body.csrfToken).not.toBe(kitchenLogin.body.csrfToken);
    expect(
      (await agent.get('/api/v1/staff/session').set('X-Staff-Station', 'serving')).body.role,
    ).toBe('staff');
    expect(
      (await agent.get('/api/v1/staff/session').set('X-Staff-Station', 'kitchen')).body.role,
    ).toBe('staff');
  });

  it('denies staff access to the admin console', async () => {
    const staff = await login('kitchen');
    expect(
      (await staff.agent.get('/api/v1/admin/reports/summary?from=2026-08-06&to=2026-08-06')).status,
    ).toBe(401);
  });

  it('sends demo wallet orders directly to every staff station and sanitizes the public board', async () => {
    const created = await request(ctx.app)
      .post('/api/v1/orders')
      .set('Idempotency-Key', key())
      .send(demoOrderPayload());
    expect(created.body.paymentConfirmedAt).toBeTruthy();
    const staff = await login('cashier');
    expect((await staff.agent.get('/api/v1/staff/queue/cashier')).body.orders).toHaveLength(0);
    expect(
      (await staff.agent.get('/api/v1/staff/queue/kitchen')).body.orders.map((order) => order.id),
    ).toContain(created.body.id);

    const board = await request(ctx.app).get('/api/v1/orders/board');
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
