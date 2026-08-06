# Test Results

All results below are **actual recorded outputs** from running the commands
in this repository on the development machine (Windows 10, Node v24.12.0,
npm 11.12.0). Dates are in the local pilot session (2026-08-06).

## 1. Quality gates

| Check              | Command                | Result                                                                                         |
| ------------------ | ---------------------- | ---------------------------------------------------------------------------------------------- |
| Lint               | `npm run lint`         | ✅ 0 errors, 0 warnings                                                                        |
| Format             | `npm run format:check` | ✅ All matched files use Prettier code style                                                   |
| Production build   | `npm run build`        | ✅ vite build (97 modules, PWA, 64 precache entries, 532 KiB) + server syntax check (27 files) |
| Dependency install | `npm install`          | ✅ 578 packages (fresh install)                                                                |

## 2. Automated tests

| Suite                                                      | Count   | Result                | Duration (last run) |
| ---------------------------------------------------------- | ------- | --------------------- | ------------------- |
| Server unit (`apps/server/test/unit`)                      | 34      | ✅ 34/34 passed       | ~1.4 s              |
| Server integration + API (`test/integration` + `test/api`) | 52      | ✅ 52/52 passed       | ~47 s               |
| Web component (`apps/web/src/test`)                        | 18      | ✅ 18/18 passed       | ~4 s                |
| Shared (`packages/shared/test`)                            | 10      | ✅ 10/10 passed       | ~0.7 s              |
| **Total automated**                                        | **114** | **✅ 114/114 passed** |                     |
| Playwright E2E (`apps/web/e2e`)                            | 33      | ✅ **33/33 passed**   | ~39 s               |

### E2E breakdown (33 tests)

- kiosk project (1024×600): 11 tests — English cash, Filipino cash, demo
  e-wallet, language change with active cart, drink customization, fries
  required choice, cart edit/remove, idle timeout/reset, network failure
  before submission, double-tap checkout idempotency, sold-out race.
- admin project (1440×900): 5 tests — login (bad/good), dashboard summary,
  full order progression with cash confirmation, filters + exact search,
  menu availability toggle.
- responsive project: 17 tests — no horizontal overflow for kiosk
  menu/review/payment at 1024×600, 1280×800, 1366×768, 768×1024; admin
  login/dashboard at 390×844 and 1440×900; drawer cart below 1024 px.

## 3. Performance benchmark (actual measured, `npm run benchmark`)

```
Warm menu API (20 requests):        avg 5ms    p50 4.44ms   p95 7.88ms
Sequential orders (20, no failures): avg 3.84ms p50 2.93ms  p95 3.94ms
Concurrent clients (5 x 5 = 25):     67.62ms total, 0 failures
Idempotency duplicate check:         statuses 201/200, same order: true, rows: 1

Targets: menu < 500ms, order < 1000ms, 20 sequential no failure,
5 concurrent no lock errors, no duplicates.
BENCHMARK PASSED against documented targets
```

Notes:

- Benchmarks run against the real app (temp DB) on the dev machine;
  tablet-side warm-load timing was not measured on physical hardware.
- "Admin receives a new order within 3 s": SSE delivery is verified by the
  SSE API test and by the admin E2E flow; end-to-end wall-clock on-device
  was not measured.

## 4. CLI verification (recorded)

- `npm run db:migrate` — ✅ applied `001_catalog`, `002_orders`,
  `003_admin_audit` (idempotent; second run applies none).
- `npm run db:seed` — ✅ 7 categories, 41 products, 4 add-ons (idempotent).
- `npm run admin:create -- --username pilot-admin --password ***` — ✅
  account created (bcrypt hash in DB).
- `npm run healthcheck` — ✅ `[db] ok: 3 migrations, 41 products, 1 admin(s)`
  - `[http] ok` → `HEALTHCHECK PASSED`.
- `npm run backup` — ✅ timestamped backup written, integrity verified
  ("integrity ok, 1 orders in snapshot"), newest 7 retained.
- `npm run restore -- backups/<file> --confirm-restore` — ✅ refused while
  the server lock file exists; after stopping the server: quarantined the
  current DB, restored, `Integrity ok; migrations applied: (none pending)`,
  `Restore complete: 1 orders`, latest order listed.
- Order creation via curl against the live server — ✅ `SG-20260806-001`
  created; receipt with a wrong token → `404 INVALID_RECEIPT_TOKEN`.

## 5. Known verification gaps (documented honestly)

| Item                                                              | Status                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Physical tablet (Android/iPadOS) PWA install, cert trust, pinning | Not performed — no hardware on the dev machine; see DEPLOYMENT.md for the exact steps to run |
| Caddy HTTPS end-to-end on the LAN                                 | Caddy is an external prerequisite; config example provided, not executed here                |
| Receipt printing to a physical printer                            | Not performed (print stylesheet verified via browser print preview only in manual use)       |
| Real payments                                                     | Out of scope by design — demo e-wallet is simulated                                          |
| Tablet-side load timing (<3 s warm kiosk load)                    | Dev-machine benchmark only; target remains for UAT on hardware                               |
| Dark mode, discounts, inventory, delivery, multi-branch           | Out of scope by design                                                                       |

Re-run commands for the user:

```
npm run lint
npm run format:check
npm test
npm run test:e2e -w apps/web
npm run benchmark
npm run healthcheck
npm run backup
```
