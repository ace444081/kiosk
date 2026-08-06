import { loadEnv } from '../apps/server/src/config/env.js';
import { openDb } from '../apps/server/src/config/db.js';
import { runMigrations } from '../apps/server/src/db/migrate.js';
import { seedCatalog } from '../apps/server/src/db/seeds/seed.js';

const env = loadEnv();
const db = openDb(env.dbPath);
runMigrations(db);
const counts = seedCatalog(db);
console.log(
  `Catalog seed complete: ${counts.categories} categories, ${counts.products} products, ${counts.addons} add-ons (idempotent).`,
);
db.close();
