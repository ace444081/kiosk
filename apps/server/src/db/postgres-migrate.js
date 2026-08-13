import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'postgres-migrations',
);

export async function runPostgresMigrations(db) {
  await db.exec('CREATE SCHEMA IF NOT EXISTS app');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app.schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
  const applied = new Set(
    (await db.many('SELECT version FROM app.schema_migrations')).map((row) => row.version),
  );
  const appliedNow = [];

  for (const name of files) {
    const version = name.replace(/\.sql$/, '');
    if (applied.has(version)) continue;
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, name), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO app.schema_migrations (version, name) VALUES ($1, $2)', [
        version,
        name,
      ]);
    });
    appliedNow.push(version);
  }
  return appliedNow;
}
