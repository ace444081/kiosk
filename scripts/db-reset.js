/**
 * Reset the database. NEVER runs automatically: requires --confirm-reset.
 * The existing database is moved to a timestamped .reset-<ts> file instead
 * of being deleted, so an accidental reset is recoverable.
 */
import fs from 'node:fs';
import { loadEnv } from '../apps/server/src/config/env.js';

const args = process.argv.slice(2);
if (!args.includes('--confirm-reset')) {
  console.error(
    'Refusing to reset without confirmation.\n' +
      'Usage: npm run db:reset -- --confirm-reset\n' +
      'This deletes all orders and admin accounts and re-creates the schema.',
  );
  process.exit(1);
}

const env = loadEnv();
if (!fs.existsSync(env.dbPath)) {
  console.log('No database file exists; nothing to reset.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const quarantine = `${env.dbPath}.reset-${stamp}`;
fs.renameSync(env.dbPath, quarantine);
for (const suffix of ['-wal', '-shm']) {
  const sidecar = `${env.dbPath}${suffix}`;
  if (fs.existsSync(sidecar)) fs.renameSync(sidecar, `${quarantine}${suffix}`);
}
console.log(`Database quarantined to: ${quarantine}`);

const { openDb } = await import('../apps/server/src/config/db.js');
const { runMigrations } = await import('../apps/server/src/db/migrate.js');
const db = openDb(env.dbPath);
runMigrations(db);
db.close();
console.log(
  'Fresh schema created. Run "npm run db:seed" to load the catalog, then "npm run admin:create" to add an admin account.',
);
