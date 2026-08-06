/**
 * Restore a backup.
 *
 * Usage: npm run restore -- <backup-file> --confirm-restore
 *
 * Safety rules:
 *  - backup path must live inside the workspace backups/ directory (or an
 *    explicitly approved absolute path) and must exist
 *  - --confirm-restore is required
 *  - refuses to run while the application is writing (a lock file created by
 *    the running server is respected)
 *  - the current database is preserved in a quarantine copy
 *  - after restore, integrity_check and migrations are run
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../apps/server/src/config/env.js';
import { openDb } from '../apps/server/src/config/db.js';
import { runMigrations } from '../apps/server/src/db/migrate.js';

const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith('--'));
if (!fileArg || !args.includes('--confirm-restore')) {
  console.error(
    'Usage: npm run restore -- <backup-file> --confirm-restore\n' +
      'The backup file must be inside the workspace backups/ directory.',
  );
  process.exit(1);
}

const env = loadEnv();
const workspaceBackupDir = path.resolve(process.cwd(), 'backups');

// Accept both `kiosk-...db` (relative to backups/) and `backups/kiosk-...db`.
const looksPrefixed = fileArg.startsWith('backups/') || fileArg.startsWith('backups\\');
const candidate = path.isAbsolute(fileArg)
  ? fileArg
  : path.resolve(looksPrefixed ? process.cwd() : workspaceBackupDir, fileArg);
const inWorkspace = candidate.startsWith(workspaceBackupDir + path.sep);
if (!inWorkspace) {
  console.error(`Refusing to restore from outside the workspace backups directory: ${candidate}`);
  process.exit(1);
}
if (!fs.existsSync(candidate)) {
  console.error(`Backup file not found: ${candidate}`);
  process.exit(1);
}

// Refuse while the application may be writing: the running server creates a
// lock file next to the live database.
const lockPath = `${env.dbPath}.lock`;
if (fs.existsSync(lockPath)) {
  console.error(
    'The application appears to be running (lock file present). Stop the server before restoring.',
  );
  process.exit(1);
}

if (!fs.existsSync(env.dbPath)) {
  console.error(`No live database found at ${env.dbPath} to replace.`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const quarantine = `${env.dbPath}.pre-restore-${stamp}`;
fs.renameSync(env.dbPath, quarantine);
for (const suffix of ['-wal', '-shm']) {
  const sidecar = `${env.dbPath}${suffix}`;
  if (fs.existsSync(sidecar)) fs.renameSync(sidecar, `${quarantine}${suffix}`);
}
console.log(`Current database quarantined to: ${quarantine}`);

// Copy (SQLite backup API) the chosen backup into place.
const source = openDb(candidate);
try {
  await source.backup(env.dbPath);
} finally {
  source.close();
}

const restored = openDb(env.dbPath);
try {
  const check = restored.pragma('integrity_check', { simple: true });
  if (check !== 'ok') {
    console.error(`Restored database integrity check FAILED: ${check}`);
    process.exit(1);
  }
  const applied = runMigrations(restored);
  console.log(
    `Integrity ok; migrations applied: ${applied.length ? applied.join(', ') : '(none pending)'}`,
  );
  const orderCount = restored.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
  const latest = restored
    .prepare('SELECT order_number, status, created_at FROM orders ORDER BY created_at DESC LIMIT 1')
    .get();
  console.log(`Restore complete: ${orderCount} orders in database.`);
  if (latest) {
    console.log(
      `Latest order: ${latest.order_number} (${latest.status}) created ${latest.created_at}`,
    );
  }
  console.log('Verify the latest expected order is present before resuming service.');
} finally {
  restored.close();
}
