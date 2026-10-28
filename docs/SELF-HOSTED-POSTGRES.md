# VOKASI standalone PostgreSQL migration

## Status: NOT YET A FULL CUTOVER

This branch adds the native PostgreSQL schema, server-only database pool, database readiness route, and a database-backed session/login foundation. The existing student/admin UI still contains Supabase client calls. **Do not treat this branch as a complete standalone deployment yet, and do not remove the existing backend.** Student, exam, admin, bank import/export, image storage, analytics, notifications, and history flows must be migrated to native API routes before the application can operate without Supabase.

The schema is derived from the current VOKASI table/constraint/index metadata and contains no application records. Hosted-auth foreign keys have been mapped to `public.app_users`. Preserve user UUIDs when importing data.

## cPanel environment variables

Configure these only for the self-hosted migration branch:

- `DATABASE_URL`: PostgreSQL URL provided by the hosting panel, for example `postgresql://USER:URL_ENCODED_PASSWORD@HOST:PORT/DATABASE`. Use the exact host/port from cPanel; do not assume `localhost` if the panel documents another value.
- `DATABASE_SSL`: `require` for a remote database with TLS; `disable` only when the provider documents a local/non-TLS database connection.
- `DATABASE_POOL_MAX`: optional small pool size (default 5; capped at 10).
- `SESSION_SECRET`: random secret of at least 32 bytes. Generate on a trusted machine with `openssl rand -base64 48`; enter it only in the hosting environment, never GitHub or browser variables.

Never prefix database credentials or session secrets with `NEXT_PUBLIC_`.

Until the old frontend is migrated, the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may still be required by the current UI. They are **legacy transition variables**, not part of the final self-hosted design. Do not delete them from a currently working deployment before the UI cutover is complete.

## Apply schema to the empty cPanel test database

1. Confirm the target database is the empty testing database, not the current production database.
2. Use the hosting's PostgreSQL import tool (for example phpPgAdmin if provided) or `psql` from a trusted terminal.
3. Import `database/schema.sql` once into the empty database. It is a bootstrap script, not a repeatable migration; it intentionally wraps changes in a transaction.
4. Import `database/functions.sql` next, using the same database role. It installs the existing server-validated VOKASI business functions against the local `auth.uid()` bridge and local object metadata table.
5. Confirm `schema_migrations` contains `20261029_self_hosted_postgres_bootstrap`, `20261029_self_hosted_compatibility`, and `20261029_self_hosted_native_functions`.
6. Confirm the new tables/functions exist and no existing production data has been changed.

The schema retains the current exam-verification view and important data-integrity triggers. `database/functions.sql` ports the current business RPC functions; the explicit `/api/rpc` allowlist executes them only after the native server session is checked and the authenticated user ID is set transaction-locally. Direct frontend table queries and local file storage are still being migrated, so this is not yet the complete cutover.

## Create the initial Super Admin

After importing the schema, configure `DATABASE_URL`, `DATABASE_SSL`, `INITIAL_SUPER_ADMIN_USERNAME`, and `INITIAL_SUPER_ADMIN_PASSWORD` in a trusted terminal/session, then run:

```bash
npm run db:seed-super-admin
```

For a deliberate production bootstrap only, also set `ALLOW_SUPER_ADMIN_BOOTSTRAP=yes` for that one command. Use a unique password with at least 14 characters and no more than 72 UTF-8 bytes. Do not put the password in source code or command history; prefer environment injection by the hosting panel or a protected shell. The script refuses to overwrite an existing login or create a second Super Admin.

## Native API endpoints

- `GET /api/health/database`: minimal readiness status; never returns database errors or credentials.
- `POST /api/auth/login`: username/email and password JSON; supports bcrypt hashes so existing bcrypt hashes can be imported without plaintext passwords.
- `GET /api/auth/me`: current session and derived role.
- `POST /api/auth/logout`: revokes the server-side session.

Session cookies are HttpOnly, SameSite=Lax, Secure in production, random, database-backed, hashed at rest, and expire after eight hours. Login failures are rate-limited by a keyed hash of the identifier and optionally the request IP.

These endpoints are a foundation and are not yet wired into the existing login UI. Do not expose the PostgreSQL port to the public internet; the application server should be the only runtime client.
