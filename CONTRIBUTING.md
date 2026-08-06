# Contributing

Sweet Gonz Kiosk is a supervised local-network pilot. Contributions should
preserve the privacy, security, accessibility, and operational boundaries in
the README and documentation.

## Before starting

- Describe substantial changes before implementation.
- Keep changes focused and explain user or operational impact.
- Do not include real customer data, credentials, payment information, private
  network details, local file paths, or private screenshots.
- Do not add real payment-provider integrations without security and product
  review.

## Development

```powershell
npm ci
Copy-Item .env.example .env
npm run db:migrate
npm run db:seed
```

Create local admin or staff accounts only on your own development database.
Never commit .env, SQLite files, backups, or generated reports.

## Workflow

1. Create a focused branch from the default branch.
2. Make the smallest complete change.
3. Add or update tests for behavior changes.
4. Run the relevant checks before opening a pull request.
5. Describe migration, security, UI, and deployment impacts.

Suggested branch names:

```text
feature/short-description
fix/short-description
docs/short-description
```

## Required checks

```powershell
npm test
npm run lint
npm run format:check
npm run build
```

Run npm run test:e2e for customer, admin, station, or responsive UI changes.

## Database changes

- Add a new numbered migration; never rewrite an applied migration.
- Preserve existing data and totals.
- Test a fresh database and an upgrade from the current migration.
- Do not commit a local SQLite database or backup.
- Document rollback and reconciliation considerations.

## UI and accessibility

- Preserve keyboard access, visible focus, readable contrast, and touch-sized
  controls.
- Test desktop, tablet, and phone widths for affected screens.
- Do not rely on color alone for status or urgency.
- Respect reduced-motion preferences.

## Security

Report suspected vulnerabilities privately to the repository owner rather than
publishing exploit details in an issue. Do not commit secrets, tokens, private
keys, credentials, or customer data. If a secret is accidentally committed,
rotate it immediately; deleting it in a later commit is not sufficient.
