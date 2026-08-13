import fs from 'node:fs';
import { loadEnv } from './config/env.js';
import { openDb } from './config/db.js';
import { openPostgres } from './db/postgres.js';
import { runMigrations } from './db/migrate.js';
import { createLogger } from './utils/logger.js';
import { createApp } from './app.js';

async function main() {
  const env = loadEnv();
  const logger = createLogger(env.logLevel);
  const isPostgres = env.databaseProvider === 'postgres';
  const db = isPostgres ? openPostgres(env) : openDb(env.dbPath);
  let lockPath = null;

  try {
    if (isPostgres) {
      // Hosted PostgreSQL migrations run as an explicit owner-only deployment
      // step. Runtime startup must remain compatible with kiosk_runtime.
      await db.one('SELECT 1 FROM app.schema_migrations LIMIT 1');
    } else {
      runMigrations(db);
      lockPath = `${env.dbPath}.lock`;
      fs.writeFileSync(lockPath, String(process.pid));
    }

    const { app } = createApp({ env, db, logger });
    const server = app.listen(env.PORT, env.HOST, () => {
      logger.info(
        {
          host: env.HOST,
          port: env.PORT,
          nodeEnv: env.NODE_ENV,
          databaseProvider: env.databaseProvider,
          deploymentId: env.deploymentId,
        },
        'Sweet Gonz kiosk server started',
      );
    });

    const shutdown = (signal) => {
      logger.info({ signal }, 'shutting down');
      server.close(async () => {
        if (lockPath) fs.rmSync(lockPath, { force: true });
        await db.close?.();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 5000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    if (lockPath) fs.rmSync(lockPath, { force: true });
    await db.close?.();
    throw error;
  }
}

main().catch((error) => {
  const logger = createLogger(process.env.LOG_LEVEL || 'info');
  logger.error({ err: error }, 'fatal startup error');
  process.exit(1);
});
