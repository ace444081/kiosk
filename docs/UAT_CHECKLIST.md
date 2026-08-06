# UAT Checklist

Use this checklist for the supervised pilot acceptance test with the school
and the client. Mark each item Pass / Fail / N/A and note observations.

## A. Environment

- [ ] Node server starts (`npm run dev:server` or `npm start` after build).
- [ ] `npm run healthcheck` → HEALTHCHECK PASSED.
- [ ] Kiosk reachable at the planned URL (dev: http://127.0.0.1:5173/kiosk).
- [ ] Admin console reachable at `/admin`.
- [ ] Database is on a local disk (never a network share).

## B. Customer kiosk — setup

- [ ] `/` redirects to `/kiosk`.
- [ ] Welcome screen shows logo, language selector, Start Order /
      Simulan ang Order, and self-service instructions.
- [ ] English is the default; switching to Filipino translates the screen.
- [ ] Starting an order clears any previous completed session.

## C. Menu and customization

- [ ] All 7 categories and 41 products display with placeholder images,
      names, descriptions, and peso prices.
- [ ] Category navigation and search work; no horizontal page overflow at
      1024×600, 1280×800, 1366×768, and 768×1024.
- [ ] Cart panel visible at ≥1024 px (~30% width); drawer below 1024 px.
- [ ] Crinkled Fries cannot be added without choosing Cheese or Sour Cream.
- [ ] A drink can be customized with a valid add-on (e.g. Cafe Latte +
      Espresso Shot) and the line total is correct.
- [ ] Incompatible add-ons cannot be selected (menu shows only valid ones).
- [ ] Quantity can be set 1–20 only.
- [ ] Adding the same configuration twice merges into one line; different
      configurations stay separate.
- [ ] Sold-out items remain visible, disabled, and marked Sold out / Ubos na.

## D. Cart and review

- [ ] Quantity +/−, remove, and clear-with-confirmation work.
- [ ] Line totals and final total match the printed prices (server-priced).
- [ ] Checkout is disabled for an empty cart.

## E. Payment

- [ ] Cash flow: order created as pending cash; confirmation says to pay
      at the counter.
- [ ] Demo e-wallet flow: placeholder QR, DEMO reference, and prominent
      bilingual "DEMO ONLY — NOT A REAL PAYMENT" warnings appear; order
      created as demo_confirmed.
- [ ] No screen implies a real transfer occurred.

## F. Confirmation and receipt

- [ ] Order number format `SG-YYYYMMDD-NNN` displayed large.
- [ ] Receipt shows items, options, add-ons, quantities, totals, date/time,
      payment state, and demo notice where applicable.
- [ ] Print button prints only the receipt area.
- [ ] Finish returns to welcome; automatic reset happens after 20 seconds.

## G. Timeout, offline, and reliability

- [ ] 105 s inactivity → warning with countdown; continuing keeps the cart.
- [ ] 120 s inactivity → reset to welcome, storage cleared.
- [ ] Refresh mid-order restores the cart; resubmission does not duplicate.
- [ ] Server stopped → bilingual offline banner, cart preserved, checkout
      disabled; no silent queuing; retry works when the server returns.

## H. Admin console

- [ ] Login with the created admin account; wrong password shows a generic
      error; 5 failures lock the pair for 15 minutes.
- [ ] Dashboard shows today's totals and connection status; demo sales
      labeled simulated.
- [ ] Orders list updates live (SSE) or within ~5 s (polling).
- [ ] Status progression placed → preparing → ready → completed works with
      confirmations.
- [ ] A cash order cannot be completed before Confirm cash received.
- [ ] Cancel works from placed/preparing/ready; cancelled cannot reopen.
- [ ] Menu availability toggle reflects immediately in the kiosk.
- [ ] Two staff on different browsers: a stale update returns a conflict
      and the UI shows the newest state.

## I. Bilingual coverage

- [ ] Kiosk navigation, buttons, validation, payment, statuses, empty
      states, errors, receipts, offline, and timeout messages all translate.
- [ ] Admin console labels translate via the EN/FIL switch.
- [ ] Product names never change language; descriptions do.

## J. Backup / restore / operator

- [ ] `npm run backup` creates a verified, timestamped backup.
- [ ] `npm run restore -- <backup> --confirm-restore` restores and reports
      the latest order; current DB is quarantined first.
- [ ] Restore refuses while the server is running (lock file).
- [ ] `npm run db:reset -- --confirm-reset` refuses without the flag and
      quarantines rather than deletes.
- [ ] PWA installs (Add to Home Screen) on the target tablet; offline shell
      displays; checkout stays disabled offline.

## K. Security spot-checks

- [ ] No default credentials exist (admin created via CLI).
- [ ] Admin cookies are HTTP-only and SameSite=Strict (HTTPS mode Secure).
- [ ] Authenticated responses carry `Cache-Control: no-store`.
- [ ] Receipts require the opaque token (wrong token → not found).
- [ ] Audit log records admin login, cash confirmation, status changes,
      cancellations, availability changes (visible in the DB).

## L. Performance (LAN-equivalent)

- [ ] Warm kiosk load under 3 s (measure on the actual tablet).
- [ ] Menu loads under 500 ms; order creation under 1 s (dev machine
      benchmark already passes — TEST_RESULTS.md).
- [ ] Admin sees a new order within 3 s.

## Sign-off

- Date: __________
- Tested by: __________
- Result: Pass ☐ / Pass with notes ☐ / Fail ☐
- Notes:
