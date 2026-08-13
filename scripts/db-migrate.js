import { loadEnv } from '../apps/server/src/config/env.js';
import { openDb } from '../apps/server/src/config/db.js';
import { openPostgres } from '../apps/server/src/db/postgres.js';
import { runMigrations, listAppliedMigrations } from '../apps/server/src/db/migrate.js';
import { runPostgresMigrations } from '../apps/server/src/db/postgres-migrate.js';

const env = loadEnv();
if (env.databaseProvider === 'postgres') {
  const migrationEnv = {
    ...env,
    databaseUrl: process.env.MIGRATION_DATABASE_URL || env.databaseUrl,
  };
  const db = openPostgres(migrationEnv);
  const applied = await runPostgresMigrations(db);
  console.log(
    `PostgreSQL migrations applied: ${applied.length ? applied.join(', ') : '(none pending)'}`,
  );
  console.log('Current PostgreSQL schema versions:');
  for (const m of await db.many(
    'SELECT version, name, applied_at FROM schema_migrations ORDER BY version',
  )) {
    console.log(`  ${m.version}  ${m.name}  ${m.applied_at}`);
  }
  await db.close();
} else {
  const db = openDb(env.dbPath);
  const applied = runMigrations(db);
  console.log(`Migrations applied: ${applied.length ? applied.join(', ') : '(none pending)'}`);
  console.log('Current schema versions:');
  for (const m of listAppliedMigrations(db)) {
    console.log(`  ${m.version}  ${m.name}  ${m.applied_at}`);
  }
  db.close();
}
