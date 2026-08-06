# Menu Validation — Provisional Add-On Compatibility Matrix

## Status: PROVISIONAL — REQUIRES CLIENT CONFIRMATION

The compatibility matrix below was derived from the supplied Sweet Gonz
concept and implemented in the seed (`packages/shared/src/seed-data.js`,
`ADDON_RULES`). **It must be confirmed by the client before the pilot menu
is finalized.** Adjusting the matrix requires updating `ADDON_RULES` (or the
`product_addons` table) and re-running the seed — no other code changes.

## The matrix

| Add-on           | Price | Applies to                                                | Rule                                                                           |
| ---------------- | ----- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Drip Coffee Shot | ₱10   | Drip Coffee products                                      | category `drip-coffee`                                                         |
| Espresso Shot    | ₱35   | Espresso **and** coffee-based products                    | categories `espresso` + `drip-coffee`                                          |
| Syrup/Sauce      | ₱15   | Drip Coffee, Espresso, and non-coffee latte/milk products | categories `drip-coffee`, `espresso`, `non-coffee`                             |
| Fruit Purée      | ₱15   | Ice-Shaken Drinks and fruit-milk products                 | category `ice-shaken` + SKUs `strawberry-milk`, `blueberry-milk`, `mango-milk` |
| _(none)_         | —     | Food (Pasta, Snacks, Bread)                               | no add-ons                                                                     |

Notes:

- "Coffee-based" is interpreted as all Drip Coffee and Espresso products
  (including Coffee Matcha, which contains coffee).
- "Non-coffee latte/milk products" = the entire Non-Coffee Drinks category
  (Ube Latte, Matcha Latte, Dark Choco, Oreo Milk, Strawberry Milk,
  Blueberry Milk, Mango Milk).
- "Fruit-milk products" = Strawberry Milk, Blueberry Milk, Mango Milk.

## Verified by tests

- Drip `americano` accepts Drip Coffee Shot + Espresso Shot + Syrup/Sauce
  (69 compatibility links seeded in total).
- `cafe-latte` (drip) accepts espresso-shot (tested end-to-end in E2E).
- Food (`baked-macaroni`) rejects `addon-espresso-shot` →
  `ADDON_INCOMPATIBLE` (API test).
- Unknown add-ons → `ADDON_NOT_FOUND` (API test).

## How to change the matrix

1. Edit `ADDON_RULES` in `packages/shared/src/seed-data.js`.
2. Re-seed (idempotent — existing availability toggles are preserved):
   ```powershell
   npm run db:seed
   ```
3. Re-run the menu/API tests:
   ```powershell
   npm run test:integration -w apps/server
   ```
4. If tests referenced the old matrix, update them to match the confirmed
   matrix.

## Client sign-off

- [ ] Drip Coffee Shot applies to: Drip Coffee only — confirmed?
- [ ] Espresso Shot applies to: Espresso + Drip Coffee — confirmed?
- [ ] Syrup/Sauce applies to: Drip, Espresso, Non-Coffee — confirmed?
- [ ] Fruit Purée applies to: Ice-Shaken + fruit milks — confirmed?
- [ ] No add-ons for food — confirmed?
- Date / signatory: ____________________
