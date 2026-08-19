import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestDb, makeTempDbPath } from '../utils.js';
import { openDb } from '../../src/config/db.js';
import { runMigrations, listAppliedMigrations } from '../../src/db/migrate.js';
import { seedCatalog } from '../../src/db/seeds/seed.js';
import { OrderRepository } from '../../src/repositories/orders.js';
import { allocateOrderNumber } from '../../src/domain/order-number.js';
import { DateTime } from 'luxon';
import { BUSINESS_TIMEZONE, ORDER_STATUSES } from '@kiosk/shared';
import { sha256Hex, generateToken } from '../../src/security/tokens.js';

const open = [];
afterEach(() => {
  for (const db of open.splice(0)) {
    try {
      db.close();
    } catch {
      // already closed
    }
  }
});

function track(db) {
  open.push(db);
  return db;
}

function insertOrder(db, overrides = {}) {
  const orders = new OrderRepository(db);
  const { orderNumber, businessDate, dailySequence } = allocateOrderNumber(
    db,
    DateTime.now().setZone(BUSINESS_TIMEZONE),
  );
  return orders.insert({
    orderNumber,
    businessDate,
    dailySequence,
    status: overrides.status || 'placed',
    paymentMethod: overrides.paymentMethod || 'cash',
    paymentStatus: overrides.paymentStatus || 'pending_cash',
    locale: 'en',
    subtotalCentavos: 1000,
    totalCentavos: 1000,
    idempotencyKey: overrides.idempotencyKey || `idem-${orderNumber}`,
    receiptTokenHash: sha256Hex(generateToken(24)),
    items: overrides.items || [],
  });
}

describe('database behaviors', () => {
  it('applies fresh migrations on a brand-new database', () => {
    const { db, cleanup } = makeTestDb();
    track(db);
    const versions = listAppliedMigrations(db);
    expect(versions.map((v) => v.version)).toEqual([
      '001_catalog',
      '002_orders',
      '003_admin_audit',
      '004_product_publishing',
      '005_order_timing',
      '006_repair_unpaid_preparation',
      '007_integrity_polish',
      '008_station_workflow',
      '009_deployment_identity',
      '010_unify_staff_roles',
      '011_cashier_attribution',
    ]);
    const adminColumns = db.pragma('table_info(admins)').map((column) => column.name);
    const orderColumns = db.pragma('table_info(orders)').map((column) => column.name);
    expect(adminColumns).toContain('role');
    expect(orderColumns).toEqual(
      expect.arrayContaining([
        'payment_confirmed_at',
        'payment_confirmed_by',
        'ready_at',
        'deployment_id',
      ]),
    );
    cleanup();
  });

  it('seeding is idempotent (repeat runs do not duplicate)', () => {
    const { db, cleanup } = makeTestDb();
    track(db);
    const first = seedCatalog(db);
    const second = seedCatalog(db);
    expect(first.products).toBe(second.products);
    const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
    expect(count).toBe(first.products);
    cleanup();
  });

  it('enforces foreign keys (order items require a real order)', () => {
    const { db, cleanup } = makeTestDb();
    track(db);
    expect(() =>
      db
        .prepare(
          'INSERT INTO order_items (id, order_id, product_id, product_sku, product_name, unit_price_centavos, quantity, line_total_centavos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('x', 'no-such-order', 'p', 'sku', 'n', 100, 1, 100),
    ).toThrow(/FOREIGN KEY/i);
    cleanup();
  });

  it('enforces unique order numbers', () => {
    const { db, cleanup } = makeTestDb();
    track(db);
    insertOrder(db, { idempotencyKey: 'idem-a' });
    const row = db.prepare('SELECT * FROM orders LIMIT 1').get();
    expect(() =>
      db
        .prepare(
          'INSERT INTO orders (id, order_number, business_date, daily_sequence, status, payment_method, payment_status, locale, subtotal_centavos, total_centavos, idempotency_key, receipt_token_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'other-id',
          row.order_number,
          '2026-08-06',
          99,
          'placed',
          'cash',
          'pending_cash',
          'en',
          0,
          0,
          'idem-b',
          'hash',
        ),
    ).toThrow(/UNIQUE/i);
    cleanup();
  });

  it('enforces unique (business_date, daily_sequence)', () => {
    const { db, cleanup } = makeTestDb();
    track(db);
    insertOrder(db, { idempotencyKey: 'idem-a' });
    const row = db.prepare('SELECT * FROM orders LIMIT 1').get();
    expect(() =>
      db
        .prepare(
          'INSERT INTO orders (id, order_number, business_date, daily_sequence, status, payment_method, payment_status, locale, subtotal_centavos, total_centavos, idempotency_key, receipt_token_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'other-id',
          'SG-OTHER-999',
          row.business_date,
          row.daily_sequence,
          'placed',
          'cash',
          'pending_cash',
          'en',
          0,
          0,
          'idem-b',
          'hash',
        ),
    ).toThrow(/UNIQUE/i);
    cleanup();
  });

  it('enforces unique idempotency keys', () => {
    const { db, cleanup } = makeTestDb();
    track(db);
    insertOrder(db, { idempotencyKey: 'same-key' });
    expect(() => insertOrder(db, { idempotencyKey: 'same-key' })).toThrow(/UNIQUE/i);
    cleanup();
  });

  it('rolls back atomically: a failed item leaves no order behind', () => {
    const { db, cleanup } = makeTestDb();
    track(db);
    const before = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
    const tx = db.transaction(() => {
      const { orderNumber, businessDate, dailySequence } = allocateOrderNumber(db);
      db.prepare(
        'INSERT INTO orders (id, order_number, business_date, daily_sequence, status, payment_method, payment_status, locale, subtotal_centavos, total_centavos, idempotency_key, receipt_token_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        'id-1',
        orderNumber,
        businessDate,
        dailySequence,
        'placed',
        'cash',
        'pending_cash',
        'en',
        100,
        100,
        'idem-rollback',
        'hash',
      );
      // Deliberately fail: FK violation on the item row.
      db.prepare(
        'INSERT INTO order_items (id, order_id, product_id, product_sku, product_name, unit_price_centavos, quantity, line_total_centavos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run('item-1', 'missing-order', 'p', 'sku', 'n', 100, 1, 100);
    });
    expect(() => tx()).toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n).toBe(before);
    cleanup();
  });

  it('preserves snapshots after menu edits (historical receipt stability)', () => {
    const { db, cleanup } = makeTestDb();
    track(db);
    const order = insertOrder(db, {
      items: [
        {
          productId: 'americano',
          productSku: 'americano',
          productName: 'Americano',
          unitPriceCentavos: 4500,
          quantity: 1,
          lineTotalCentavos: 4500,
          addons: [],
          options: [],
        },
      ],
    });
    db.prepare('UPDATE products SET name = ?, price_centavos = ? WHERE id = ?').run(
      'Americano V2',
      9999,
      'americano',
    );
    const repo = new OrderRepository(db);
    const detail = repo.detail(order.id);
    expect(detail.items[0].product_name).toBe('Americano');
    expect(detail.items[0].unit_price_centavos).toBe(4500);
    cleanup();
  });

  it('allocates unique daily sequences under concurrency', async () => {
    const { dbPath, cleanup } = makeTempDbPath();
    const db = track(openDb(dbPath));
    runMigrations(db);
    const workers = 5;
    const perWorker = 3;
    const results = await Promise.all(
      Array.from({ length: workers }, (_, w) =>
        Promise.all(
          Array.from(
            { length: perWorker },
            () =>
              new Promise((resolve, reject) => {
                const workerDb = openDb(dbPath);
                try {
                  const tx = workerDb.transaction(() => {
                    const { orderNumber, businessDate, dailySequence } =
                      allocateOrderNumber(workerDb);
                    workerDb
                      .prepare(
                        'INSERT INTO orders (id, order_number, business_date, daily_sequence, status, payment_method, payment_status, locale, subtotal_centavos, total_centavos, idempotency_key, receipt_token_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                      )
                      .run(
                        `w${w}-${orderNumber}`,
                        orderNumber,
                        businessDate,
                        dailySequence,
                        'placed',
                        'cash',
                        'pending_cash',
                        'en',
                        100,
                        100,
                        `idem-${w}-${orderNumber}`,
                        `hash-${w}-${orderNumber}`,
                      );
                    return { orderNumber, dailySequence };
                  });
                  const result = tx.immediate();
                  workerDb.close();
                  resolve(result);
                } catch (err) {
                  workerDb.close();
                  reject(err);
                }
              }),
          ),
        ),
      ),
    );
    const sequences = results.flat().map((r) => r.dailySequence);
    expect(new Set(sequences).size).toBe(workers * perWorker);
    expect(Math.max(...sequences)).toBe(workers * perWorker);
    db.close();
    cleanup();
  });

  it('reports a clean integrity check', () => {
    const { db, cleanup } = makeTestDb();
    track(db);
    insertOrder(db);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    cleanup();
  });
});

describe('backup and restore', () => {
  it('backup produces an openable, intact copy with the same rows', async () => {
    const { db, dbPath, cleanup } = makeTestDb();
    track(db);
    insertOrder(db);
    insertOrder(db);
    const backupPath = `${dbPath}.backup-test.db`;

    await db.backup(backupPath);
    const copy = track(openDb(backupPath));
    expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(copy.prepare('SELECT COUNT(*) AS n FROM orders').get().n).toBe(
      db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,
    );
    copy.close();
    fs.rmSync(backupPath, { force: true });
    cleanup();
  });

  it('restore round-trip preserves orders and passes migrations', async () => {
    const { db, dbPath, cleanup } = makeTestDb();
    track(db);
    insertOrder(db);
    const backupPath = path.join(path.dirname(dbPath), 'roundtrip.db');
    await db.backup(backupPath);
    const before = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
    db.close(); // stop using the live path before "restoring" over it

    // "Restore": copy the backup over the live path with the SQLite backup
    // API (no connection may hold the live path at this point), then reopen,
    // integrity-check, migrate.
    const backupDb = track(openDb(backupPath));
    await backupDb.backup(dbPath);
    backupDb.close();

    const finalDb = track(openDb(dbPath));
    expect(finalDb.pragma('integrity_check', { simple: true })).toBe('ok');
    const pending = runMigrations(finalDb);
    expect(pending).toEqual([]);
    expect(finalDb.prepare('SELECT COUNT(*) AS n FROM orders').get().n).toBe(before);
    finalDb.close();
    fs.rmSync(backupPath, { force: true });
    cleanup();
  });
});

describe('status/payment database constraints', () => {
  it('only stores valid statuses and payment states', () => {
    const { db, cleanup } = makeTestDb();
    track(db);
    for (const status of ORDER_STATUSES) {
      expect(() => insertOrder(db, { status })).not.toThrow();
    }
    expect(() => insertOrder(db, { status: 'bogus' })).toThrow();
    expect(() =>
      insertOrder(db, { paymentMethod: 'cash', paymentStatus: 'pending_cash' }),
    ).not.toThrow();
    expect(() =>
      insertOrder(db, { paymentMethod: 'cash', paymentStatus: 'cash_received' }),
    ).not.toThrow();
    expect(() =>
      insertOrder(db, { paymentMethod: 'demo_wallet', paymentStatus: 'demo_confirmed' }),
    ).not.toThrow();
    expect(() => insertOrder(db, { paymentStatus: 'bogus' })).toThrow();
    cleanup();
  });
});
