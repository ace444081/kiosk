import { loadEnv } from '../apps/server/src/config/env.js';
import { openDb } from '../apps/server/src/config/db.js';
import { runMigrations, listAppliedMigrations } from '../apps/server/src/db/migrate.js';

const env = loadEnv();
const db = openDb(env.dbPath);
const applied = runMigrations(db);
console.log(`Migrations applied: ${applied.length ? applied.join(', ') : '(none pending)'}`);
console.log('Current schema versions:');
for (const m of listAppliedMigrations(db)) {
  console.log(`  ${m.version}  ${m.name}  ${m.applied_at}`);
}
db.close();
