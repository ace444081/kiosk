# Backup & Restore

## 1. Principles

- Backups use **SQLite's online backup API** (`better-sqlite3
db.backup()`), never a naive filesystem copy of a live database.
- Backups are **timestamped**, stored **outside** the live database
  directory (in `backups/`), and **verified** (opened + `PRAGMA
integrity_check`) before the command reports success.
- The **newest seven automatic backups** are retained; older ones are
  pruned.
- Restore is **explicit and safe**: it requires the backup path and a
  confirmation flag, refuses paths outside `backups/`, refuses while the
  application is running (lock file), **quarantines** the current database
  (never deletes it), and runs integrity + migration checks afterwards.
- The live database (`data/kiosk.db`) must be on a **local disk**, never a
  network share.

## 2. Backup

```powershell
cd <project-root>
npm run backup
```

Example output:

```
Backup written: <project-root>\backups\kiosk-<timestamp>.db
Backup verified: integrity ok, 1 orders in snapshot.
Retaining 1 newest backups.
```

Notes:

- Can run while the server is up (online backup API gives a consistent
  snapshot).
- Retention is enforced at the end of every backup run (newest 7).

## 3. Restore

```powershell
# 1. Stop the server first (backup/restore refuses otherwise):
#    Ctrl+C, or
netstat -ano | findstr ":4000"
taskkill /F /PID <pid>
#    If the server crashed, remove any stale lock file:
Remove-Item data\kiosk.db.lock -ErrorAction SilentlyContinue

# 2. Restore (file name inside backups/, or backups/<file>):
npm run restore -- kiosk-2026-08-06T02-09-43-816Z.db --confirm-restore
# or:
npm run restore -- backups/kiosk-2026-08-06T02-09-43-816Z.db --confirm-restore
```

Example output:

```
Current database quarantined to: <project-root>\data\kiosk.db.pre-restore-<timestamp>
Integrity ok; migrations applied: (none pending)
Restore complete: 1 orders in database.
Latest order: SG-20260806-001 (placed) created 2026-08-06T02:09:43.176Z
Verify the latest expected order is present before resuming service.
```

### Safety rules enforced by the script

| Rule                        | Behavior                                        |
| --------------------------- | ----------------------------------------------- |
| Missing path or flag        | Usage error, exit 1                             |
| Path outside `backups/`     | Refused, exit 1                                 |
| Backup file missing         | Refused, exit 1                                 |
| Server running (lock file)  | Refused, exit 1                                 |
| Current DB missing          | Refused, exit 1                                 |
| Restored DB fails integrity | Exit 1 (quarantine remains for manual recovery) |

## 4. How to verify a restore

1. The restore script prints the **latest order** in the restored database.
2. Cross-check it against the latest order you remember (or against the
   backup's own listing) — this is the "latest expected order" check.
3. Start the server and open the admin **Orders** queue; confirm the
   newest order numbers match the printed value.
4. Place a small test order and confirm the daily sequence continues
   correctly (e.g. previous `...-007` → new `...-008`).

## 5. Recovery drill (recommended before the pilot)

```powershell
npm run backup
# create a couple of orders through the kiosk
npm run backup                       # second snapshot contains the orders
npm run restore -- kiosk-<second>.db --confirm-restore
# start the server and confirm the orders are back
```

## 6. Automated/periodic backups

For a supervised pilot, schedule the same command with Task Scheduler:

```powershell
# PowerShell (Task Scheduler):
$action  = New-ScheduledTaskAction -Execute "cmd.exe" `
  -Argument '/c cd /d <project-root> && npm run backup >> data\backup.log 2>&1'
$trigger = New-ScheduledTaskTrigger -Daily -At 20:30
Register-ScheduledTask -TaskName "SweetGonzBackup" -Action $action -Trigger $trigger
```

(Optional — not installed by the project; the script is safe to run
periodically because it is self-retaining.)
