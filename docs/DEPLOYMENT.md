# Deployment

## Deployment modes

| Mode            | Frontend | API     | Database            | Purpose                               |
| --------------- | -------- | ------- | ------------------- | ------------------------------------- |
| SQLite rollback | Vite     | Express | local SQLite        | offline recovery and regression tests |
| Local primary   | Vite     | Express | Supabase PostgreSQL | normal demo operation                 |
| Cloud fallback  | Vercel   | Render  | Supabase PostgreSQL | device failover                       |

The local primary and cloud fallback share data. This requires internet access
to Supabase even when the browser is using the local machine.

## Supabase setup

1. Create a free project named `sweetgonz-db`.
2. Use the Singapore region when available.
3. Apply the files under `apps/server/src/db/postgres-migrations` with the
   migration-owner connection, or run `npm run db:migrate` with
   `DATABASE_PROVIDER=postgres`.
4. Create a runtime database role with only the required access to the private
   `app` schema. Apply [deploy/supabase-runtime-grants.sql](../deploy/supabase-runtime-grants.sql)
   after replacing its placeholder role name. Keep its password in Render and
   local `.env` only.
5. Do not expose the `app` schema through the Supabase Data API. This project
   connects with `pg` from Express instead of using a browser Supabase client.

### Import current SQLite data

Stop the local server first, then set a private `.env`:

```dotenv
DATABASE_PROVIDER=postgres
DATABASE_URL=<private-supabase-connection-string>
PGSSL=true
DEPLOYMENT_ID=local-primary
```

Run:

```powershell
npm run db:import:postgres
```

The command checks SQLite integrity, creates a backup in the ignored
`backups/` directory, imports catalog/accounts/orders/items/audits, excludes
sessions, and reconciles row counts and completed totals. It refuses a populated
target unless `--replace` is explicitly added.

## Render API

1. Create the service from the repository's `render.yaml`.
2. Name the service `sweetgonz-api`.
3. Set `DATABASE_URL`, `MIGRATION_DATABASE_URL`, and a random `SESSION_SECRET`
   in the Render secret store. `DATABASE_URL` should use the least-privilege
   runtime role; `MIGRATION_DATABASE_URL` should use the separate migration
   owner.
4. Keep `COOKIE_SECURE=true`, `TRUST_PROXY=true`, `SERVE_WEB=false`, and
   `DEPLOYMENT_ID=cloud-fallback`.
5. Set `PUBLIC_ORIGINS` to the final Vercel production URL.
6. Confirm `/api/v1/health` is the health check and that the service reaches
   the Supabase database before inviting station devices.

The free plan does not provide Render's paid-only pre-deploy lifecycle, so the
Blueprint runs the idempotent `npm run db:migrate` command in its start command
before starting Express.

Render's free service can sleep after inactivity. This is why the hosted
frontend includes `/admin/standby`, which performs a lightweight health check
once per minute when left open on a spare device.

## Vercel frontend

1. Create a project named `sweetgonz` from the repository root.
2. Keep the root directory at the repository root so workspaces install
   correctly.
3. Use the settings in `vercel.json`.
4. Assign `sweetgonz.vercel.app` if available. Use
   `sweetgonz-kiosk.vercel.app` if Vercel has already claimed the shorter name.
5. If Render assigned a hostname suffix, update the external rewrite destination
   in `vercel.json` before the production deployment.

The Vercel frontend has no database environment variables. The rewrite keeps
the browser on one origin and forwards `/api/*` to Render.

## Local LAN access

Keep the API on the host machine and expose only Vite to the private LAN:

```powershell
# API terminal
npm run dev:server

# Vite terminal
npm run dev -w apps/web -- --host 0.0.0.0
```

Open `http://<host-lan-address>:5173/kiosk` on tablets and phones connected to
the same private network. Allow inbound TCP 5173 on the private Windows
firewall profile. Do not expose port 4000 and do not enable router port
forwarding.

For an HTTPS-installed PWA, use the existing Caddy example and local CA
instructions. Caddy is optional for the local HTTP demo.

## Cutover checklist

- [ ] SQLite backup exists and opens successfully.
- [ ] PostgreSQL migrations and grants are applied.
- [ ] Full-data import reconciliation passed.
- [ ] At least one account for each required role exists.
- [ ] Render health is green and logs contain no database connection errors.
- [ ] Vercel route and `/api` rewrite return 200 responses.
- [ ] Local and hosted logins work with fresh sessions.
- [ ] Kiosk-to-cashier-to-kitchen-to-serving workflow passes.
- [ ] SOA export and audit events include the expected orders.
- [ ] Desktop, tablet, and phone routes have no hidden actions or horizontal
      overflow.

## Failover checklist

1. Pause new orders on the local URL.
2. Confirm `/admin/standby` reports `API ready`.
3. Move every station device to the matching Vercel route.
4. Sign in again if the browser has no hosted session cookie.
5. Confirm the latest order queue from Supabase before continuing.
6. Keep one active mutation environment until the local server is repaired.
7. Export the SOA and inspect deployment IDs after the session.

## Rollback

The source SQLite file and verified backup are not deleted by the cutover. To
return to the rollback path, stop the Postgres-mode server, restore the verified
SQLite backup with the existing restore tool, set `DATABASE_PROVIDER=sqlite`,
and run the regression suite before reopening the local URL.
