# Admin & Operator Manual — Sweet Gonz Bakeshop Café Kiosk

## 1. Roles and access

- The admin console is for **staff only**.
- Accounts are created with the command line (see §10); there are **no
  default credentials**.
- The console is protected by username/password, a server-side session
  (30-minute inactivity timeout, 8-hour absolute timeout), and CSRF
  protection. After 5 failed logins per username from one device, sign-in
  is blocked for 15 minutes.

## 2. Signing in

1. Open the admin URL (`/admin` on the kiosk server; dev:
   http://127.0.0.1:5173/admin).
2. Enter the username and password and tap **Sign in**.
3. Wrong credentials show a generic error (never reveals whether the
   username exists).
4. Use **Sign out** when done; the session is destroyed server-side.

## 3. Dashboard

The Operations and Sales dashboard supports Today, Yesterday, the last 7 days,
the last 30 days, or a custom business-date range. Business dates use
Asia/Manila.

- **Real cash sales**, completed orders, average order value, pending cash,
  and simulated demo-wallet totals are shown separately.
- Workflow mix shows **Placed / Preparing / Ready / Completed / Cancelled**.
- Daily activity, top products, service times, and active exceptions support
  the owner review.
- The live queue remains current even when the selected reporting period is
  historical.
- **Export operations (.xlsx)** downloads a workbook for the selected range.

If a period has no orders, use the latest-activity shortcut or choose a wider
range. The connection pill shows **Live**, **Polling**, or **Disconnected**.

## 4. Order queue

- Newest orders appear first with order number, time, payment state,
  total, status, and elapsed time.
- Filter by **status**, **payment**, **date**, or type an **exact order
  number** in the search box.
- The list refreshes automatically (live events, with 5-second polling as
  a fallback).

## 5. Processing an order

Open an order to see all items, add-ons, choices, and totals.

### Allowed transitions

- Placed → **Start preparing**
- Preparing → **Mark ready**
- Ready → **Complete** (only after payment is confirmed)
- Placed/Preparing/Ready → **Cancel order** (cannot be undone)

### Cash orders

- Cash orders arrive as **pending_cash**.
- When the customer pays at the counter, tap **Confirm cash received**.
- A cash order **cannot be completed** before cash is confirmed.

### Demo e-wallet orders

- Demo orders are always **demo_confirmed (simulated)** — no cash action
  is needed, and the badge clearly says DEMO.

### Conflicts

- If another screen changed the order first, the system shows a conflict
  message and the **newest state**; your action was not applied. Review
  the new state and retry.

## 6. Menu availability

- Open **Menu**, search or filter products.
- **Mark sold out / Ubos na** hides nothing — the item stays visible in
  the kiosk but disabled with a Sold out tag.
- **Mark available** re-enables it immediately.
- The **Updated** timestamp helps staff know when availability last
  changed.

## 7. Operations workbook

The dashboard export is a formatted workbook with these sheets:

- Overview and Statement of Account
- Daily Summary
- Orders and Order Items, including captured customizations
- Product Performance
- Service Times
- Menu Status
- Audit Log
- Data Dictionary

Real cash and simulated demo-wallet amounts are deliberately separated. The
workbook contains operational order data only and does not include passwords,
session data, customer names, or contact fields.

## 8. What staff CANNOT do in this version

- Edit prices, names, categories, or add-ons (by design — ask the
  operator).
- Issue refunds (no refunds exist in the pilot).
- See or cancel completed orders (completed cannot reopen; cancelled
  cannot restore).
- Access anything outside the local network.

## 9. Daily routine

1. Morning: open the dashboard; check the server pill is **Live**.
2. During service: watch the order queue; confirm cash when customers pay;
   mark preparing → ready → complete.
3. Sold out something? Toggle availability in **Menu**.
4. End of day: review **Completed sales** (note: demo amounts are
   simulated); run a backup (see below).

## 10. Operator tasks (PowerShell)

```powershell
cd <project-root>

# Create an admin account (interactive, hidden password):
npm run admin:create

# Health check:
npm run healthcheck

# Backup (timestamped, verified, keeps newest 7):
npm run backup

# Restore (server must be stopped; current DB is quarantined):
#   Stop the server first, then:
npm run restore -- kiosk-<timestamp>.db --confirm-restore
#   The script prints the latest order — verify it is the expected one.

# Reset the database (destructive; requires explicit flag):
npm run db:reset -- --confirm-reset
#   Then: npm run db:seed  and  npm run admin:create
```

### Starting/stopping the server

```powershell
npm run build        # one-time after updates
npm start            # production server on 127.0.0.1:4000 (needs .env)

# Clean stop:
#   Ctrl+C if in the foreground, or
netstat -ano | findstr ":4000"
taskkill /F /PID <pid>
#   A stale lock file (data\kiosk.db.lock) can be deleted manually after
#   confirming no server is running.
```

## 11. Troubleshooting (staff/operator)

| Symptom                                      | Action                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Console won't open / shows "Connection lost" | Run `npm run healthcheck`; restart the server if needed.                                     |
| "Session expired"                            | Sign in again (sessions end after 30 min idle / 8 h).                                        |
| Login blocked                                | Wait 15 minutes, or restart the server to clear the in-memory attempt counter.               |
| Order won't complete                         | Check payment state: cash orders need **Confirm cash received** first.                       |
| Conflict message on an order                 | Another action updated the order; the newest state is shown — retry.                         |
| Kiosk shows an item wrongly sold out         | Toggle availability back in **Menu**.                                                        |
| Restore says the app is running              | Stop the server; if it crashed, delete `data\kiosk.db.lock`.                                 |
| Receipt printer                              | Not supported in the pilot — use the on-screen receipt and the print button (browser print). |
