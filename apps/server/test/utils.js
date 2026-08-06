import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { loadEnv } from '../src/config/env.js';
import { openDb } from '../src/config/db.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedCatalog } from '../src/db/seeds/seed.js';
import { createApp } from '../src/app.js';
import { AdminRepository } from '../src/repositories/admins.js';
import { AdminAuthService } from '../src/services/admin-auth.js';
import { randomId } from '../src/security/tokens.js';

/** Create a throwaway database file for tests. Returns { path, cleanup }. */
export function makeTempDbPath(prefix = 'kiosk-test') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(dir, 'test.db');
  return {
    dbPath,
    cleanup: () => {
      for (const suffix of ['', '-wal', '-shm', '-lock']) {
        fs.rmSync(`${dbPath}${suffix}`, { force: true });
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Migrated + seeded database on a temp file. */
export function makeTestDb() {
  const { dbPath, cleanup: pathCleanup } = makeTempDbPath();
  const db = openDb(dbPath);
  runMigrations(db);
  seedCatalog(db);
  return {
    db,
    dbPath,
    cleanup: () => {
      try {
        db.close();
      } catch {
        // already closed
      }
      pathCleanup();
    },
  };
}

/** Full app + supertest-ready server with a temp database. */
export function makeTestApp({ seed = true, envOverrides = {} } = {}) {
  const temp = makeTempDbPath();
  const env = loadEnv({
    NODE_ENV: 'test',
    DB_PATH: temp.dbPath,
    SESSION_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
    LOG_LEVEL: 'silent',
    ...envOverrides,
  });
  const db = openDb(env.dbPath);
  runMigrations(db);
  if (seed) seedCatalog(db);
  const { app, orderService, eventBus, authService } = createApp({ env, db });
  return {
    app,
    db,
    env,
    orderService,
    eventBus,
    authService,
    dbPath: env.dbPath,
    cleanup: temp.cleanup,
  };
}

/** Create an admin with a known password for API tests. */
export function createTestAdmin(
  db,
  { username = 'admin', password = 'correct-horse-9', role = 'admin' } = {},
) {
  const repo = new AdminRepository(db);
  const admin = repo.create({
    id: randomId(),
    username,
    passwordHash: AdminAuthService.hashPassword(password),
    role,
  });
  return admin;
}

/**
 * Login helper: returns an authenticated supertest agent with CSRF token.
 */
export async function loginAgent(app, { username = 'admin', password = 'correct-horse-9' } = {}) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/admin/session').send({ username, password });
  if (res.status !== 200) {
    throw new Error(`Test login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { agent, csrfToken: res.body.csrfToken, username: res.body.username };
}

/** Standard valid order payload for tests. */
export function cashOrderPayload(overrides = {}) {
  return {
    locale: 'en',
    paymentMethod: 'cash',
    items: [{ productId: 'hashbrown-2pc', quantity: 2 }],
    ...overrides,
  };
}

export function demoOrderPayload(overrides = {}) {
  return {
    locale: 'fil',
    paymentMethod: 'demo_wallet',
    items: [{ productId: 'americano', quantity: 1 }],
    ...overrides,
  };
}
