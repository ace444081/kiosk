# Translation Validation

## 1. Coverage

The kiosk and admin console ship complete `en` and `fil` dictionaries in
`apps/web/src/i18n/en.json` and `fil.json`, covering:

- Navigation, instructions, buttons
- Cart labels and cart announcements
- Validation messages
- Payment text (including the bilingual demo-e-wallet warnings)
- Order statuses and payment states
- Admin labels, empty states, errors, receipts
- Offline and timeout messages

Product **names** are intentionally never translated (single-language
`products.name`); product **descriptions** are stored bilingually
(`description_en` / `description_fil`) and served per locale by
`GET /api/v1/menu?locale=`. Category, add-on, and option names are also
bilingual (`name_en` / `name_fil`).

## 2. Behavior rules (implemented)

- English is the default for every new kiosk session (not persisted).
- Changing the language preserves the current cart and screen.
- The admin console persists its own language choice separately
  (`localStorage`, `sgkiosk.admin.locale.v1`).
- The UI localizes API errors by stable code
  (`errors.<CODE>` with a `GENERIC` fallback; unknown codes fall back to
  English via i18next `fallbackLng`).

## 3. Automated parity test

`apps/web/src/test/translations.test.js` (runs with `npm run test:unit`):

1. **Parity en → fil**: every key in `en` exists in `fil`.
2. **Parity fil → en**: every key in `fil` exists in `en`.
3. **Real translation check**: values longer than 3 characters are not
   identical between languages (catches copied dictionaries; a small
   allowlist of brand strings is tolerated).
4. **Locale fallback**: unknown keys resolve without crashing and fall
   back to English.
5. **Error-code coverage**: all stable API error codes exist in `en` and
   `fil` (`errors.*`).

The parity test fails if a required key exists in only one language — it is
part of the standard `npm test` run.

## 4. Manual validation checklist

- [ ] Switch EN → FIL on the welcome screen: everything changes.
- [ ] Add an item, switch language, review the cart: items and totals
      unchanged.
- [ ] Place a Filipino cash order: confirmation + receipt in Filipino.
- [ ] Demo e-wallet warnings appear in both languages.
- [ ] Admin console: EN/FIL toggle covers dashboard, orders, detail,
      menu, dialogs, and empty states.
- [ ] Offline banner + timeout dialog are bilingual.
- [ ] Sold-out tag shows "Sold out" / "Ubos na" per locale.
- [ ] Validation messages (fries flavor, quantity) are inline and
      localized.

## 5. Adding a new string

1. Add the key to **both** `en.json` and `fil.json` (the parity test
   enforces this).
2. Use `t('section.key')` in components.
3. Run `npm run test:unit -w apps/web` — the parity test must pass.
