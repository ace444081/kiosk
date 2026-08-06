# Test Plan

## 1. Strategy

Automated verification at four levels, all runnable from the repo root:

| Level               | Tooling                  | Location                                               | Command                                |
| ------------------- | ------------------------ | ------------------------------------------------------ | -------------------------------------- |
| Unit (domain logic) | Vitest                   | `apps/server/test/unit`, `packages/shared/test`        | `npm run test:unit`                    |
| Component (React)   | Vitest + Testing Library | `apps/web/src/test`                                    | `npm run test:unit`                    |
| Integration + API   | Vitest + Supertest       | `apps/server/test/integration`, `apps/server/test/api` | `npm run test:integration`             |
| Browser E2E         | Playwright               | `apps/web/e2e`                                         | `npm run test:e2e`                     |
| Performance         | custom benchmark         | `scripts/benchmark.mjs`                                | `npm run benchmark`                    |
| Quality gates       | ESLint / Prettier        | repo root                                              | `npm run lint`, `npm run format:check` |

Integration/API tests use **temporary databases** (`os.tmpdir()`), never the
development database. E2E tests boot a dedicated server on port 4100 with a
fresh temp DB and the built app via `vite preview` (port 4173).

## 2. Unit tests (domain logic)

- **Order numbering** — Manila business date, `SG-YYYYMMDD-NNN` format,
  sequence increment and padding, per-day reset.
- **State machine** — allowed/denied transitions; completed/cancelled cannot
  reopen; self-transition allowed.
- **Payment rules** — `pending_cash → cash_received` only; demo immutable;
  cash completion blocked until confirmed; demo always completable.
- **Pricing** — base + add-ons + options × quantity; client prices ignored;
  snapshot stability after menu edits.
- **Validation** — required options (fries flavor), option limits,
  option/product membership, add-on compatibility, unknown products,
  sold-out products, quantity bounds (0, 21 rejected; 20 accepted).
- **Idempotency** — same key → same order, no token re-issue; different key
  → different order.
- **Receipts** — hash-only lookup; wrong token indistinguishable from
  missing.
- **Daily summary** — per-business-date counts; only completed +
  confirmed-payment orders count toward sales; cash/demo split.
- **Translation parity** — every key present in both `en` and `fil`;
  values actually differ; all stable API error codes covered in both.
- **Locale fallback** — missing keys fall back to English default.
- **Timeout behavior** — warn at 105 s, grace 15 s, reset at 120 s;
  protected-while-submitting (pure logic + React hook with fake timers).
- **Money helpers** — centavo formatting, multiplication/sum.

## 3. Integration tests (database behaviors)

- Fresh migrations apply in order on a brand-new database.
- Seeding is idempotent (repeat runs do not duplicate).
- Foreign keys enforced (order items require a real order).
- Unique constraints: order number, `(business_date, daily_sequence)`,
  idempotency key.
- Atomic rollback: a failing item insert leaves no order behind.
- Snapshot preservation after product name/price changes.
- Concurrent sequence allocation: 5 workers × 3 orders → 15 unique
  sequences, no lock errors.
- Backup produces an openable, intact copy (integrity + row counts).
- Restore round-trip preserves rows and passes migration/integrity checks.
- CHECK constraints reject invalid status/payment values.

## 4. API tests (Supertest)

- Valid cash order (201, shape, totals, receipt token).
- Valid demo order (201, `demo_confirmed`).
- Empty cart, missing Idempotency-Key, unknown product, sold-out product,
  incompatible add-on, missing fries flavor.
- Fake client price ignored (order priced from catalog).
- Duplicate idempotency key → 200 duplicate, one DB row, sequence not
  consumed.
- Receipt: correct token 200; wrong token 404; `no-store` header.
- Admin auth: 401 without session; generic login errors; session
  regeneration; CSRF required (missing + forged); login rate limiting
  (5 failures → 429, success resets); logout invalidation; `no-store` on
  admin responses.
- Workflow: placed → preparing → ready → completed with cash confirmation;
  unpaid cash completion rejected; invalid transitions rejected;
  cancellation and no-reopen; demo cash-confirmation rejected.
- Optimistic concurrency: stale version → 409 with newest state.
- Availability: toggle reflected in the public menu; stale version 409;
  no price/name editing endpoints.
- Daily summary counts + completed-sales split.
- SSE delivers `OrderCreated` to a connected admin stream.

## 5. Component tests (React)

- Cart: empty start, add/merge identical lines, separate differently
  configured lines, quantity cap at 20, recomputed totals, persistence to
  `sessionStorage`, screen-reader announcements.
- Idle timer hook: active → warning at 105 s with countdown → reset at
  120 s; continue dismisses; no reset while protected.

## 6. Playwright E2E (browser)

### Viewports

Kiosk: 1024×600, 1280×800, 1366×768, 768×1024 (fallback drawer layout).
Admin: 390×844 (mobile), 1440×900 (desktop).

### Scenarios

1. English cash order end to end.
2. Filipino cash order end to end.
3. Demo e-wallet order (warnings, DEMO reference, simulated notice).
4. Language change with an active cart (cart preserved).
5. Drink customization with add-on (line total verified).
6. Fries flavor required-choice validation.
7. Cart edit/remove.
8. Timeout warning + reset (Playwright clock).
9. Network failure before submission (cart preserved, retry succeeds with
   the same idempotency key).
10. Double-tap checkout → exactly one order.
11. Sold-out race (product sold out after adding to cart → rejected).
12. Admin login (bad then good credentials).
13. Full order progression with cash confirmation (incl. blocked unpaid
    completion).
14. Admin filters + exact order-number search.
15. Menu availability toggle reflected in the kiosk.
16. Responsive layouts: no horizontal overflow on kiosk menu/review/payment
    at all kiosk viewports; admin login/dashboard at both admin viewports;
    drawer cart works below 1024 px.

### E2E hygiene

- Fresh temp DB per suite run; one admin fixture (`e2e-admin`).
- Service worker blocked in tests for deterministic behavior.
- Tests clean up availability changes (restore the original state).

## 7. Performance benchmark (`npm run benchmark`)

- Warm menu API: 20 requests (target p95 < 500 ms).
- Sequential order creation: 20 orders, no failures (target p95 < 1000 ms).
- Concurrent: 5 clients × 5 orders (target: no lock errors).
- Idempotency: duplicate submission → one DB row.
  Measured results: see TEST_RESULTS.md.

## 8. Quality gates

- `npm run lint` — ESLint flat config, 0 errors/0 warnings.
- `npm run format:check` — Prettier, all files.
- `npm run build` — production PWA build + server syntax check.
