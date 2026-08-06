# Known Limitations

This is a **supervised school/client pilot**, not an unrestricted
production POS. The following are intentional limitations of this version.

## Excluded by scope (see SRS §1.2)

- **Real payments**: no GCash, Maya, card, bank, or payment-provider
  integration; no real merchant QR codes; no real transfer confirmation.
  Demo e-wallet payments are simulated and labeled as such everywhere.
- **VAT, senior/PWD discounts, promotions, coupons** — none.
- **Inventory/ingredient deduction** — none.
- **Customer accounts / personal-data collection** — none; the kiosk never
  asks for personal information.
- **Delivery / table service** — counter pickup only.
- **Cloud hosting / cloud synchronization** — local network only.
- **Receipt-printer drivers / cash drawers** — receipts are on-screen and
  printed via the browser print dialog.
- **Multi-branch support** — single branch.
- **Public internet exposure** — HTTPS is local (Caddy internal CA).
- **Dark mode** — light theme only.

## Product limitations of this version

1. **Menu editing** — admins can toggle availability only. Prices, names,
   categories, descriptions, and add-ons require a code change + reseed
   (documented in MENU_VALIDATION.md).
2. **Add-on compatibility matrix is provisional** and requires client
   confirmation before the pilot menu is finalized.
3. **No refunds** — once completed or cancelled, orders are final.
4. **Order queue capped** at the newest 200 rows per query; older rows
   remain in the database and are reachable via search/filters.
5. **Single admin account store** — multiple admins are supported, but
   there is no role hierarchy (all admins have the same rights).
6. **Login rate limiter is in-memory** — a server restart clears failed-
   attempt counters (acceptable for a single supervised site).
7. **SSE events are in-process** — if the server restarts, connected admin
   pages fall back to 5-second polling automatically.
8. **Placeholder brand assets** — logo, product images, category art, and
   the demo QR are locally generated placeholders under
   `apps/web/public/placeholders/` and `apps/web/public/icons/`; replace
   them in place with client assets (no logic changes needed).
9. **Kiosk preview totals are UI-computed** — the API remains
   authoritative; server prices always win (verified by tests).
10. **No physical-device verification was performed** — Android/iPadOS
    PWA install, certificate trust, screen pinning, Guided Access, and
    printing were implemented/documented but not executed on hardware by
    the development machine; see DEPLOYMENT.md and UAT_CHECKLIST.md.
11. **Caddy is an external prerequisite** — the project ships a
    `Caddyfile.example` and full instructions but does not install Caddy
    or its CA.
12. **Performance targets measured on the dev machine** — the LAN-equivalent
    benchmark passes (TEST_RESULTS.md); tablet-side warm-load timing still
    needs on-device UAT.

## Security posture notes

- No default credentials; admin accounts are created via `npm run
admin:create`.
- The dev `.env` uses a sample secret; production requires a strong
  `SESSION_SECRET` and secure-cookie/trust-proxy settings or the server
  refuses to start.
- The internal Caddy CA must be removed after the pilot (DEPLOYMENT.md §10).
