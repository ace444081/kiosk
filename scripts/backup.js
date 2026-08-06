/**
 * Backup the live SQLite database using SQLite's online backup API
 * (never a naive filesystem copy of a live database). Timestamped backups go
 * to backups/ outside the live database directory. The newest seven automatic
 * backups are retained. Each backup is verified by opening it and running
 * PRAGMA integrity_check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../apps/server/src/config/env.js';
import { openDb } from '../apps/server/src/config/db.js';

const RETAIN_COUNT = 7;

const env = loadEnv();
if (!fs.existsSync(env.dbPath)) {
  console.error(`No database found at ${env.dbPath}. Run migrations and seed first.`);
  process.exit(1);
}

const backupDir = path.resolve(process.cwd(), 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `kiosk-${stamp}.db`);

const source = openDb(env.dbPath);
try {
  // SQLite online backup API: consistent snapshot even while the app is live.
  await source.backup(backupPath);
  console.log(`Backup written: ${backupPath}`);
} finally {
  source.close();
}

// Verify the backup can be opened and is intact.
const verify = openDb(backupPath);
try {
  const result = verify.pragma('integrity_check', { simple: true });
  if (result !== 'ok') {
    console.error(`Backup integrity check FAILED: ${result}`);
    fs.rmSync(backupPath, { force: true });
    process.exit(1);
  }
  const orderCount = verify.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
  console.log(`Backup verified: integrity ok, ${orderCount} orders in snapshot.`);
} finally {
  verify.close();
}

// Retain the newest seven automatic backups.
const backups = fs
  .readdirSync(backupDir)
  .filter((f) => f.startsWith('kiosk-') && f.endsWith('.db'))
  .sort()
  .reverse();
for (const old of backups.slice(RETAIN_COUNT)) {
  fs.rmSync(path.join(backupDir, old), { force: true });
  console.log(`Pruned old backup: ${old}`);
}
console.log(`Retaining ${Math.min(backups.length, RETAIN_COUNT)} newest backups.`);
