# Software Requirements Specification

**Project:** Development of a Tablet-Based Self-Service Ordering Kiosk for Sweet Gonz Bakeshop Café
**Version:** 1.0 (pilot)
**Status:** Implemented and verified (see TEST_RESULTS.md)

## 1. Introduction

### 1.1 Purpose

A self-service ordering kiosk for a supervised school/client pilot. Customers
place, customize, and pay for orders on a 10-inch landscape tablet; staff
manage orders, payments, and menu availability from a protected console.
The system is local-network only and uses placeholder brand assets until the
client provides production artwork.

### 1.2 Scope

In scope: customer kiosk, persistent menu and orders, product customization,
shopping cart, cash and simulated e-wallet checkout, order numbers and
digital receipts, protected staff interface, cash-payment confirmation,
preparation-status workflow, menu availability controls, daily operational
summary, English/Filipino interface, local-network deployment, local HTTPS,
PWA behavior, backup/restore scripts, automated tests, school/operator docs.

Out of scope (explicitly NOT implemented): real GCash/Maya/card/bank payment
integration, real merchant QR codes, real transfer confirmation, VAT,
senior/PWD discounts, promotions, coupons, inventory/ingredient deduction,
customer accounts or personal-data collection, delivery/table service, cloud
hosting/sync, receipt-printer drivers/cash drawers, multi-branch support,
public internet exposure, dark mode.

### 1.3 Definitions

- **Kiosk** — the customer-facing web app on the tablet.
- **Admin console** — the staff-facing web app on the shop PC/tablet.
- **Demo e-wallet** — a fully simulated payment flow with a clearly labeled
  placeholder QR; never a real transaction.
- **Business date** — the calendar date in `Asia/Manila` at the moment an
  order is created.

## 2. Overall description

### 2.1 Actors

- **Customer** — uses the kiosk to order and pay.
- **Staff/Admin** — signs in to the console to process orders, confirm cash,
  and control availability.
- **Operator** — installs, backs up, restores, and monitors the system.

### 2.2 Environment

- 10-inch landscape tablet (Android or iPadOS) on a private LAN.
- Node server on the shop PC; Caddy (optional) terminates HTTPS.
- Single-branch, single-device pilot.

### 2.3 Design constraints

- JavaScript throughout; npm-workspace monorepo.
- Money stored as integer centavos; displayed in Philippine peso format.
- All times derived from `Asia/Manila`.
- English default locale for every new kiosk session.
- Minimum 48×48 CSS-pixel touch targets; 4.5:1 normal-text contrast;
  3:1 large-text contrast; keyboard focus; reduced-motion support;
  usable at 200% zoom.

## 3. Functional requirements

### FR1 Customer kiosk

- FR1.1 `/` redirects to `/kiosk`; routes: `/kiosk`, `/kiosk/menu`,
  `/kiosk/review`, `/kiosk/payment`, `/kiosk/confirmation`.
- FR1.2 Welcome screen: placeholder logo, EN/FIL selector, "Start Order"/
  "Simulan ang Order", self-service instructions, full-screen landscape.
  Starting an order clears any previous completed session.
- FR1.3 Menu screen: ~72 px header at ≥1024 px; category navigation; search;
  flexible product grid; persistent cart panel ≈30% width at ≥1024 px; cart
  drawer below 1024 px; horizontally scrollable categories; visible checkout;
  no horizontal page overflow.
- FR1.4 Product cards show placeholder image, name, description, price,
  availability, and Add/Customize. Sold-out items stay visible but disabled
  and marked "Sold out"/"Ubos na".
- FR1.5 Customization: details, base price, valid add-ons only, required
  option groups, quantity 1–20, running line total, localized validation,
  add-to-cart. Identically configured lines merge; differently configured
  lines stay separate.
- FR1.6 Review: increase/decrease quantity, remove, clear with confirmation,
  return to menu, review add-ons and choices, line totals and final total;
  continue only when valid and non-empty. Preview totals are UI-side; the
  API is authoritative.
- FR1.7 Payment options (exactly two):
  1. **Cash** — explains payment at the counter; creates the order with
     `pending_cash`.
  2. **Demo e-wallet** — locally generated placeholder QR, prominent EN/FIL
     demo warnings, non-financial reference `DEMO-XXXXXXXX`, creates the
     order with `demo_confirmed`. Never implies a real transfer.
- FR1.8 Confirmation: large order number `SG-YYYYMMDD-NNN`, status, payment
  state/instruction, items/options/add-ons/quantities/totals, date/time, demo
  warning where applicable, print button (dedicated print stylesheet), Finish
  button, automatic reset after 20 seconds.

### FR2 Timeout and recovery

- FR2.1 Warn after 105 s of inactivity; 15 s to continue; reset at 120 s.
- FR2.2 Never reset while order creation is pending.
- FR2.3 Preserve an unsubmitted cart in `sessionStorage` across refresh.
- FR2.4 Clear kiosk storage after completion, cancellation, or timeout.
- FR2.5 No credentials or auth tokens in browser storage.
- FR2.6 Server unavailable: preserve cart, disable submission, bilingual
  retry message; never silently queue an order.
- FR2.7 Reusing a submission idempotency key returns the original order.

### FR3 Bilingual support

- FR3.1 Complete `en` and `fil` translation dictionaries (navigation,
  instructions, buttons, cart, validation, payment, statuses, admin labels,
  empty states, errors, receipts, offline/timeout).
- FR3.2 Product names unchanged; descriptions stored as
  `description_en`/`description_fil`.
- FR3.3 English default per kiosk session; changing language preserves the
  cart and screen.
- FR3.4 Automated test fails if a required key exists in only one language.

### FR4 Menu (seed)

- FR4.1 Categories: Pasta, Snacks, Bread, Drip Coffee, Espresso,
  Ice-Shaken Drinks, Non-Coffee Drinks — with the exact products and
  centavo prices listed in the specification (see packages/shared/src/seed-data.js).
- FR4.2 Add-ons: Drip Coffee Shot ₱10, Espresso Shot ₱35, Syrup/Sauce ₱15,
  Fruit Purée ₱15, with the provisional compatibility matrix (see
  MENU_VALIDATION.md — requires client confirmation).
- FR4.3 Crinkled Fries require exactly one no-cost option (Cheese/Keso or
  Sour Cream).

### FR5 Admin console

- FR5.1 Routes: `/admin/login`, `/admin`, `/admin/orders`, `/admin/orders/:id`,
  `/admin/menu`.
- FR5.2 Username/password login; bcrypt hashes; CLI account creation; no
  hardcoded default credentials; generic invalid-login response; session
  regeneration; server-side sessions; secure HTTP-only SameSite=Strict
  cookies in HTTPS mode; 30-minute inactivity + 8-hour absolute timeout;
  logout invalidation; 5 failed attempts per IP/username per 15 minutes;
  CSRF token required for authenticated mutations;
  `Cache-Control: no-store` on authenticated responses.
- FR5.3 Localhost dev: documented non-Secure cookie mode via environment.
  Production/pilot mode fails startup on inconsistent HTTPS/security config.
- FR5.4 Dashboard: today's total orders, pending cash, placed, preparing,
  ready, completed, cancelled, completed-sales total, connection/server
  status. Only completed orders with `cash_received` or `demo_confirmed`
  count toward completed sales; demo totals labeled simulated.
- FR5.5 Order queue: newest-first, order number, time, payment
  method/state, total, preparation status, elapsed indicator, date/status/
  payment filters, exact order-number search, bilingual empty/error states,
  server-sent events with 5-second polling fallback.
- FR5.6 Workflow transitions: `placed→preparing`, `preparing→ready`,
  `ready→completed`, `placed→cancelled`, `preparing→cancelled`,
  `ready→cancelled`. Completed cannot reopen; cancelled cannot restore; cash
  orders cannot complete until `cash_received`; demo stays visibly
  simulated; every mutation uses optimistic concurrency (record version);
  stale updates → HTTP 409 with the newest state.
- FR5.7 Payment workflow: cash `pending_cash→cash_received`; demo remains
  `demo_confirmed`; no refunds.
- FR5.8 Menu availability: search/filter products, mark available or sold
  out, see last-update time. No price/name/category/add-on editing in this
  version.

### FR6 Persistence, numbering, and audit

- FR6.1 Orders persist across browser refresh and server restart.
- FR6.2 Order numbers `SG-YYYYMMDD-NNN`; daily sequence and business date in
  `Asia/Manila`; allocated in one immediate transaction with the order.
- FR6.3 Audit log: admin login success/failure, logout, cash confirmation,
  status change, cancellation, availability change, backup, restore — with
  actor, action, target, previous/new state, timestamp, request ID, IP/UA.
  Never logs passwords, session IDs, CSRF tokens, or receipt tokens.

### FR7 API (see API.md)

- FR7.1 Public: `GET /api/v1/menu?locale=`, `POST /api/v1/orders`
  (Idempotency-Key header required; client prices ignored), `GET
/api/v1/orders/:orderNumber/receipt?token=`, `GET /api/v1/health`.
- FR7.2 Admin: session POST/GET/DELETE, orders list/detail, status PATCH,
  payment PATCH, products list, availability PATCH, summary, events (SSE).
- FR7.3 Consistent error envelope `{ error: { code, message, fieldErrors },
requestId }`; UI localizes by stable code.

### FR8 PWA

- FR8.1 Manifest, 192/512/maskable icons, offline shell, favicon.
- FR8.2 Cache: shell, CSS/JS, icons/placeholders, latest successful public
  menu response. Never cache admin/session/order/receipt/CSRF data.
- FR8.3 Offline menu display allowed; checkout disabled offline.

### FR9 Backup/restore (see BACKUP_RESTORE.md)

- FR9.1 Backup via SQLite's backup mechanism; timestamped; stored outside
  the live DB directory; newest 7 retained; opened/verified after creation;
  never a naive file copy of a live database.
- FR9.2 Restore requires explicit path + confirmation; refuses paths outside
  `backups/`; refuses while the app is writing; quarantines the current DB;
  runs integrity and migration checks.

## 4. Non-functional requirements

- NFR1 Local machine / LAN-equivalent performance: warm kiosk load <3 s;
  menu API <500 ms; order creation <1 s; admin sees a new order within 3 s;
  20 sequential orders without failure; 5 concurrent clients without lock
  errors; no duplicate order under repeated checkout input. (Measured results
  in TEST_RESULTS.md.)
- NFR2 Accessibility: 48 px touch targets; contrast ratios above; semantic
  HTML; visible keyboard focus; form labels; dialog semantics; text
  alternatives; no color-only information; no drag-only behavior;
  reduced-motion; 200% zoom; inline localized validation; screen-reader
  announcements for cart updates and order confirmation.
- NFR3 Security: Helmet/CSP, strict same-origin, request-size limit,
  rate limiting, CSRF, no-store, bcrypt, hashed receipt tokens, no secrets
  in repo.
- NFR4 The live SQLite file never lives on a network share.

## 5. Acceptance criteria (summary)

See UAT_CHECKLIST.md and TEST_RESULTS.md. Definition of done includes clean
install; migrations + seed; admin creation; end-to-end kiosk; EN/FIL; cash +
demo orders; persistence across refresh and restart; admin processing;
sold-out controls; invalid-transition rejection; idempotent duplicates;
verified backup/restore; PWA build; responsive no-overflow layouts; lint,
format, unit, integration, and Playwright tests passing; docs matching actual
behavior; no TODOs/fake handlers/hardcoded secrets; only visual placeholders
and explicitly excluded integrations remain.
