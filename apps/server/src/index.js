import { loadEnv } from './config/env.js';
import { openDb } from './config/db.js';
import { runMigrations } from './db/migrate.js';
import { createLogger } from './utils/logger.js';
import { createApp } from './app.js';
import fs from 'node:fs';

const env = loadEnv();
const logger = createLogger(env.logLevel);

try {
  const db = openDb(env.dbPath);
  runMigrations(db);

  // Lock file so `npm run restore` can refuse to run while the app is live.
  const lockPath = `${env.dbPath}.lock`;
  fs.writeFileSync(lockPath, String(process.pid));

  const { app } = createApp({ env, db, logger });

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      { host: env.HOST, port: env.PORT, nodeEnv: env.NODE_ENV, dbPath: env.dbPath },
      'Sweet Gonz kiosk server started',
    );
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      fs.rmSync(lockPath, { force: true });
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
} catch (err) {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
}
