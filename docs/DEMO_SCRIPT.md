# Demo Script — Sweet Gonz Kiosk Pilot

Use this script for the school/client demonstration. ~15 minutes.
All steps are verifiable; the demo e-wallet is simulated and labeled as such.

## Preparation (before the audience arrives)

```powershell
cd <project-root>
npm run db:reset -- --confirm-reset   # optional: start clean (quarantines)
npm run db:migrate
npm run db:seed
npm run admin:create                  # e.g. demo-admin
npm run dev                           # or: npm run build && npm start
npm run healthcheck                   # expect HEALTHCHECK PASSED
```

Open two browser windows:

- Kiosk: http://127.0.0.1:5173/kiosk (or the LAN HTTPS URL if deployed)
- Admin: http://127.0.0.1:5173/admin (sign in before the demo)

## Part 1 — Welcome and language (2 min)

1. Show the welcome screen: logo, language selector, instructions.
2. Switch to Filipino; point out **Simulan ang Order**.
3. Switch back to English and tap **Start Order**.

## Part 2 — Menu and customization (3 min)

1. Browse categories; use search for "latte".
2. Open **Crinkled Fries**: show that **Add to cart is disabled** until a
   flavor (Cheese/Sour Cream) is chosen — required-choice validation.
3. Choose Cheese, set quantity, add to cart.
4. Open **Cafe Latte** (drip, ₱55): add **Espresso Shot** (+₱35); the line
   total updates live; quantity 2 → total ₱180.00; add to cart.
5. Open **Hashbrown** and add it.

## Part 3 — Cart and review (2 min)

1. Show the cart panel (or drawer below 1024 px).
2. Increase the hashbrown quantity; remove the fries line; totals update.
3. Re-add fries with Sour Cream — note it stays a **separate line**
   (different configuration).
4. Open Review: item details, add-ons, choices, totals.

## Part 4 — Cash payment (2 min)

1. Choose **Cash**, place the order.
2. Confirmation: large order number `SG-YYYYMMDD-NNN`, "pay at the
   counter" instruction, receipt with items and totals.
3. Click **Print** (show that only the receipt prints).
4. Note the 20-second auto-reset back to the welcome screen.

## Part 5 — Demo e-wallet (simulated) (2 min)

1. Start a new order, add an **Americano**, go to payment.
2. Choose **Demo E-Wallet**: show the demo QR, the `DEMO-XXXXXXXX`
   reference, and read the **DEMO ONLY — NOT A REAL PAYMENT** warning.
3. Confirm; show the receipt's simulated-payment notice.
4. State clearly: _"No real money moves in this pilot."_

## Part 6 — Admin processing (3 min)

1. In the admin window, show the dashboard counts updating live.
2. Open the demo order: mark **Start preparing → Mark ready**; show the
   cash order still blocked from completion (pending cash).
3. **Confirm cash received** on the cash order, then **Complete**.
4. Show **Completed sales** on the dashboard and the simulated label next
   to demo amounts.
5. **Menu → search "Americano" → Mark sold out**; in the kiosk window,
   show the item now disabled with **Sold out / Ubos na**; mark it
   available again.

## Part 7 — Reliability (2 min)

1. **Double-tap**: at the payment screen, quickly tap pay twice — show
   that exactly **one** order is created (idempotency).
2. **Timeout**: wait 105 s (or set the screen aside) — show the
   "Are you still there?" warning; tap **I'm still here**.
3. **Offline**: stop the server (Ctrl+C), show the bilingual connection
   banner, cart preserved, checkout disabled; restart the server, retry,
   order succeeds.

## Part 8 — Backup/restore (2 min, optional)

1. `npm run backup` — show the verified timestamped file.
2. Stop the server, `npm run restore -- <file> --confirm-restore` — show
   quarantine + integrity + "latest order" output; restart and confirm the
   orders are back.

## Closing points

- English/Filipino complete; parity enforced by an automated test.
- 114 automated tests + 33 browser tests pass; benchmark passes
  (TEST_RESULTS.md).
- Everything runs on the local network; HTTPS via Caddy internal CA;
  no public exposure; demo payments are simulated.
- Placeholder artwork will be replaced with client assets before the
  full pilot.
