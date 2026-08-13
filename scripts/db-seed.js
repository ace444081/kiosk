import { loadEnv } from '../apps/server/src/config/env.js';
import { openDb } from '../apps/server/src/config/db.js';
import { openPostgres } from '../apps/server/src/db/postgres.js';
import { runMigrations } from '../apps/server/src/db/migrate.js';
import { runPostgresMigrations } from '../apps/server/src/db/postgres-migrate.js';
import { seedCatalog } from '../apps/server/src/db/seeds/seed.js';
import { seedPostgresCatalog } from '../apps/server/src/db/seeds/postgres-seed.js';

const env = loadEnv();
if (env.databaseProvider === 'postgres') {
  const db = openPostgres(env);
  await runPostgresMigrations(db);
  const counts = await seedPostgresCatalog(db);
  console.log(
    `PostgreSQL catalog seed complete: ${counts.categories} categories, ${counts.products} products, ${counts.addons} add-ons (idempotent).`,
  );
  await db.close();
} else {
  const db = openDb(env.dbPath);
  runMigrations(db);
  const counts = seedCatalog(db);
  console.log(
    `Catalog seed complete: ${counts.categories} categories, ${counts.products} products, ${counts.addons} add-ons (idempotent).`,
  );
  db.close();
}
