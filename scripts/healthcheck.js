/**
 * Health check: verifies the database is openable, migrated, seeded, and the
 * HTTP endpoint responds. Exits non-zero on any failure.
 */
import { loadEnv } from '../apps/server/src/config/env.js';
import { openDb } from '../apps/server/src/config/db.js';
import { listAppliedMigrations } from '../apps/server/src/db/migrate.js';
import { AdminRepository } from '../apps/server/src/repositories/admins.js';

const env = loadEnv();
const baseUrl = `http://${env.HOST}:${env.PORT}`;

let ok = true;
const failures = [];

// 1. Database opens, integrity ok, migrations present, catalog seeded.
try {
  const db = openDb(env.dbPath);
  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') {
    ok = false;
    failures.push(`database integrity: ${integrity}`);
  }
  const migrations = listAppliedMigrations(db);
  if (migrations.length === 0) {
    ok = false;
    failures.push('no migrations applied');
  }
  const productCount = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (productCount === 0) {
    ok = false;
    failures.push('catalog not seeded (0 products)');
  }
  const admins = new AdminRepository(db).count();
  if (admins === 0) {
    ok = false;
    failures.push('no admin account created yet (run npm run admin:create)');
  }
  db.close();
  console.log(
    `[db] ok: ${migrations.length} migrations, ${productCount} products, ${admins} admin(s)`,
  );
} catch (err) {
  ok = false;
  failures.push(`database: ${err.message}`);
}

// 2. HTTP health endpoint (only if a server is expected to be running).
try {
  const res = await fetch(`${baseUrl}/api/v1/health`, { signal: AbortSignal.timeout(3000) });
  const body = await res.json();
  if (res.ok && body.status === 'ok') {
    console.log(`[http] ok: ${baseUrl}/api/v1/health`);
  } else {
    ok = false;
    failures.push(`http health: ${res.status} ${JSON.stringify(body)}`);
  }
} catch (err) {
  ok = false;
  failures.push(`http health: ${err.message} (is the server running?)`);
}

if (ok) {
  console.log('HEALTHCHECK PASSED');
  process.exit(0);
}
console.error('HEALTHCHECK FAILED:');
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
