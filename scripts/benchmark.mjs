/**
 * Performance benchmark (local machine / LAN-equivalent).
 *
 * Boots the real app against a temp database and measures:
 *   - warm kiosk menu API latency
 *   - order creation latency (sequential x20, no failures)
 *   - 5 concurrent simulated clients (no lock errors)
 *   - idempotency under repeated checkout input (no duplicates)
 *
 * Prints actual measured results; nothing is fabricated.
 *
 * Usage: npm run benchmark
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import request from 'supertest';

const dbPath = path.join(os.tmpdir(), `kiosk-bench-${process.pid}-${Date.now()}.db`);

process.env.NODE_ENV = 'test';
process.env.DB_PATH = dbPath;
process.env.SESSION_SECRET = 'bench-secret-0123456789abcdef0123456789abcdef';
process.env.LOG_LEVEL = 'silent';

const { loadEnv } = await import('../apps/server/src/config/env.js');
const { openDb } = await import('../apps/server/src/config/db.js');
const { runMigrations } = await import('../apps/server/src/db/migrate.js');
const { seedCatalog } = await import('../apps/server/src/db/seeds/seed.js');
const { createApp } = await import('../apps/server/src/app.js');

const env = loadEnv();
const db = openDb(env.dbPath);
runMigrations(db);
seedCatalog(db);
const { app } = createApp({ env, db });

const api = request(app);
const results = {};

// --- Warm kiosk load (menu API) -------------------------------------------
const warmup = await api.get('/api/v1/menu?locale=en');
if (warmup.status !== 200) throw new Error('menu warmup failed');
const menuTimes = [];
for (let i = 0; i < 20; i += 1) {
  const start = performance.now();
  const res = await api.get('/api/v1/menu?locale=en');
  menuTimes.push(performance.now() - start);
  if (res.status !== 200) throw new Error('menu fetch failed');
}
menuTimes.sort((a, b) => a - b);
results.menu = {
  avgMs: Math.round((menuTimes.reduce((s, v) => s + v, 0) / menuTimes.length) * 100) / 100,
  p50Ms: Math.round(menuTimes[10] * 100) / 100,
  p95Ms: Math.round(menuTimes[18] * 100) / 100,
};

// --- 20 sequential orders ---------------------------------------------------
const orderTimes = [];
for (let i = 0; i < 20; i += 1) {
  const start = performance.now();
  const res = await api
    .post('/api/v1/orders')
    .set('Idempotency-Key', `bench-seq-${i}-${Date.now()}`)
    .send({
      locale: 'en',
      paymentMethod: 'cash',
      items: [{ productId: 'americano', quantity: 1, addonIds: ['addon-espresso-shot'] }],
    });
  orderTimes.push(performance.now() - start);
  if (res.status !== 201) throw new Error(`sequential order ${i} failed: ${res.status}`);
}
orderTimes.sort((a, b) => a - b);
results.sequential = {
  count: 20,
  failures: 0,
  avgMs: Math.round((orderTimes.reduce((s, v) => s + v, 0) / orderTimes.length) * 100) / 100,
  p50Ms: Math.round(orderTimes[10] * 100) / 100,
  p95Ms: Math.round(orderTimes[18] * 100) / 100,
  lastOrderNumber: db
    .prepare('SELECT order_number FROM orders ORDER BY created_at DESC LIMIT 1')
    .get().order_number,
};

// --- 5 concurrent clients x 5 orders -----------------------------------------
const concurrentStart = performance.now();
const clientResults = await Promise.all(
  Array.from({ length: 5 }, (_, client) =>
    Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        api
          .post('/api/v1/orders')
          .set('Idempotency-Key', `bench-conc-${client}-${i}-${Date.now()}`)
          .send({
            locale: 'en',
            paymentMethod: 'demo_wallet',
            items: [{ productId: 'hashbrown-2pc', quantity: 1 }],
          }),
      ),
    ),
  ),
);
const allStatuses = clientResults.flat().map((r) => r.status);
const failures = allStatuses.filter((s) => s !== 201).length;
results.concurrent = {
  clients: 5,
  ordersPerClient: 5,
  total: 25,
  failures,
  elapsedMs: Math.round((performance.now() - concurrentStart) * 100) / 100,
  allCreated: failures === 0,
};

// --- Duplicate submission (idempotency under repeated input) -----------------
const dupKey = `bench-dup-${Date.now()}`;
const dupPayload = {
  locale: 'en',
  paymentMethod: 'cash',
  items: [{ productId: 'americano', quantity: 1 }],
};
const first = await api.post('/api/v1/orders').set('Idempotency-Key', dupKey).send(dupPayload);
const second = await api.post('/api/v1/orders').set('Idempotency-Key', dupKey).send(dupPayload);
const dupCount = db
  .prepare('SELECT COUNT(*) AS n FROM orders WHERE idempotency_key = ?')
  .get(dupKey).n;
results.idempotency = {
  firstStatus: first.status,
  secondStatus: second.status,
  sameOrderNumber: first.body.orderNumber === second.body.orderNumber,
  rowsInDatabase: dupCount,
  noDuplicate: dupCount === 1,
};

// --- Output ------------------------------------------------------------------
console.log('\n=== Sweet Gonz kiosk performance benchmark (actual measured) ===\n');
console.log(
  `Warm menu API (20 requests):        avg ${results.menu.avgMs}ms  p50 ${results.menu.p50Ms}ms  p95 ${results.menu.p95Ms}ms`,
);
console.log(
  `Sequential orders (20, no failures): avg ${results.sequential.avgMs}ms  p50 ${results.sequential.p50Ms}ms  p95 ${results.sequential.p95Ms}ms`,
);
console.log(
  `Concurrent clients (5 x 5 = 25):     ${results.concurrent.elapsedMs}ms total, ${results.concurrent.failures} failures`,
);
console.log(
  `Idempotency duplicate check:         statuses ${results.idempotency.firstStatus}/${results.idempotency.secondStatus}, same order: ${results.idempotency.sameOrderNumber}, rows: ${results.idempotency.rowsInDatabase}`,
);
console.log(
  '\nTargets: menu < 500ms, order < 1000ms, 20 sequential no failure, 5 concurrent no lock errors, no duplicates.\n',
);

const passed =
  results.menu.p95Ms < 500 &&
  results.sequential.p95Ms < 1000 &&
  results.sequential.failures === 0 &&
  results.concurrent.failures === 0 &&
  results.idempotency.noDuplicate;

console.log(
  passed
    ? 'BENCHMARK PASSED against documented targets'
    : 'BENCHMARK: targets not fully met (see numbers above)',
);

db.close();
for (const suffix of ['', '-wal', '-shm', '-lock'])
  fs.rmSync(`${dbPath}${suffix}`, { force: true });
process.exit(passed ? 0 : 1);
