/**
 * E2E server fixture: boots the kiosk API on port 4100 with a FRESH temp
 * database (migrated, seeded, one admin account) for Playwright tests.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = path.join(os.tmpdir(), `kiosk-e2e-${process.pid}-${Date.now()}.db`);

process.env.NODE_ENV = 'test';
process.env.PORT = '4100';
process.env.HOST = '127.0.0.1';
process.env.DB_PATH = dbPath;
process.env.SESSION_SECRET = 'e2e-session-secret-0123456789abcdef0123456789abcdef';
process.env.LOG_LEVEL = 'warn';
// The whole suite shares one IP (127.0.0.1); do not trip the per-IP API
// rate limiter mid-run. Production limit stays 300/min.
process.env.API_RATE_LIMIT_MAX = '10000';

const { loadEnv } = await import('../../server/src/config/env.js');
const { openDb } = await import('../../server/src/config/db.js');
const { runMigrations } = await import('../../server/src/db/migrate.js');
const { seedCatalog } = await import('../../server/src/db/seeds/seed.js');
const { createApp } = await import('../../server/src/app.js');
const { AdminRepository } = await import('../../server/src/repositories/admins.js');
const { AdminAuthService } = await import('../../server/src/services/admin-auth.js');
const { randomId } = await import('../../server/src/security/tokens.js');

const env = loadEnv();
const db = openDb(env.dbPath);
runMigrations(db);
seedCatalog(db);

const admins = new AdminRepository(db);
if (!admins.findByUsername('e2e-admin')) {
  admins.create({
    id: randomId(),
    username: 'e2e-admin',
    passwordHash: AdminAuthService.hashPassword('e2e-pass-1234'),
  });
}

if (!admins.findByUsername('e2e-staff')) {
  admins.create({
    id: randomId(),
    username: 'e2e-staff',
    passwordHash: AdminAuthService.hashPassword('e2e-staff-1234'),
    role: 'staff',
  });
}

const { app } = createApp({ env, db });
const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`[e2e] kiosk API listening on http://${env.HOST}:${env.PORT} (db: ${env.dbPath})`);
});

const shutdown = () => {
  server.close(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
    for (const suffix of ['', '-wal', '-shm', '-lock']) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
