# Sweet Gonz Bakeshop Cafe Kiosk

Sweet Gonz is a local-network self-service ordering kiosk and restaurant
operations pilot. It includes a customer kiosk, admin console, cashier queue,
kitchen display, serving counter, public order board, reports, and audit logs.

This repository is intended for supervised demonstrations and school/client
pilot work. E-wallet payments are simulated only. It does not connect to
GCash, Maya, cards, banks, merchant QR codes, or any real payment provider.

## Included

- English/Filipino customer ordering, customization, cart, checkout, and receipts
- Cash and simulated e-wallet payment paths
- Admin dashboard, menu availability, reports, SOA export, and audit activity
- Role-based cashier, kitchen, and serving workflows
- Preparation timers with item-count-adjusted urgency states
- Anonymous customer order board
- SQLite persistence with migrations, backups, and integrity checks
- Responsive tablet, desktop, and phone layouts
- Optional local HTTPS through Caddy

## Requirements

- Node.js 20 or newer
- npm 9 or newer
- Git
- Caddy only when HTTPS/PWA installation on LAN devices is required

## Local setup

From the repository root:

```powershell
npm ci
Copy-Item .env.example .env
npm run db:migrate
npm run db:seed
npm run admin:create
```

Use cp .env.example .env instead of Copy-Item in Bash or WSL. Never commit
.env. Use a long, unique SESSION_SECRET for a shared pilot environment.
Credentials are created locally and are not seeded into source control.

## Run locally

```powershell
npm run dev
```

Local routes:

| Surface              | URL                                 |
| -------------------- | ----------------------------------- |
| Customer kiosk       | http://127.0.0.1:5173/kiosk         |
| Admin console        | http://127.0.0.1:5173/admin         |
| Staff login          | http://127.0.0.1:5173/staff/login   |
| Cashier              | http://127.0.0.1:5173/staff/cashier |
| Kitchen              | http://127.0.0.1:5173/staff/kitchen |
| Serving counter      | http://127.0.0.1:5173/staff/serving |
| Customer order board | http://127.0.0.1:5173/order-board   |

For a private-LAN demo, run the API and web server in separate terminals:

```powershell
# Terminal 1, repository root
npm run dev:server
```

```powershell
# Terminal 2, apps/web directory
npm run dev -- --host 0.0.0.0
```

Open http://HOST-LAN-IP:5173/kiosk on a device on the same private LAN.
Keep SQLite on the host computer, never on a network share. Do not configure
router port forwarding. For the recommended HTTPS/PWA setup, see
docs/DEPLOYMENT.md.

## Restaurant workflow

```text
Kiosk -> Cashier payment -> Kitchen preparation -> Serving counter -> Completed
```

Cash orders wait for payment confirmation. Simulated e-wallet orders bypass the
cashier queue. The preparation timer starts when an eligible order enters
preparing and stops when the order is completed.

## Tests and quality

```powershell
npm test
npm run test:e2e
npm run lint
npm run format:check
npm run build
```

Playwright may require a one-time browser installation:

```powershell
cd apps/web
npx playwright install chromium
cd ../..
```

## Data and security boundaries

- Development and pilot data is local to the host computer.
- .env, SQLite databases, backups, logs, certificates, test reports, and local
  screenshots are ignored by Git.
- Never put credentials, payment information, private network details, or
  customer data in source files, commits, issues, or screenshots.
- Real payment processing, public internet deployment, cloud synchronization,
  SMS, printers, and multi-branch routing are outside this pilot.

## Documentation

- Architecture: docs/ARCHITECTURE.md
- Deployment: docs/DEPLOYMENT.md
- Admin and operator manual: docs/ADMIN_OPERATOR_MANUAL.md
- API reference: docs/API.md
- Database dictionary: docs/DATABASE_DICTIONARY.md
- Backup and restore: docs/BACKUP_RESTORE.md
- Test plan: docs/TEST_PLAN.md
- Known limitations: docs/KNOWN_LIMITATIONS.md

## Contributing and license

See CONTRIBUTING.md for development and review guidance. This project is
licensed under the MIT License; see LICENSE.
