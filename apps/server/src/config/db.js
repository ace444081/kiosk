import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Open a SQLite database with the kiosk pragmas.
 * - foreign keys ON
 * - WAL mode
 * - 5 second busy timeout (kept short so write transactions stay snappy)
 */
export function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}

export function integrityCheck(db) {
  return db.pragma('integrity_check', { simple: true });
}
