# VOKASI — Self-hosted PostgreSQL migration

## Status

The `feat/self-hosted-postgres` branch now routes the main login/session, school directory, exam-result, question-bank/draft, report, administrator-invitation, password-change, and private-image flows through the native PostgreSQL backend. The CI checks currently pass, including a contract test that prevents Supabase client imports in the migrated runtime paths.

**This is not yet a production cutover.** The cPanel test database has not been verified end-to-end from this branch, existing Supabase rows and image bytes have not been copied automatically, and the application must not be switched to the new backend until data counts and exam flows are verified. Keep the old backend and its data intact until that verification is complete. No cPanel changes are required while the code work continues on this branch.

The SQL schema is a bootstrap structure and contains no application records. Preserve existing user UUIDs when importing data so that roster, session, attempt, and audit references remain consistent.

## Required cPanel environment

Configure these values in the Node.js application's private environment, not in browser variables:

- `DATABASE_URL`: the PostgreSQL URL shown by cPanel, for example `postgresql://DB_USER:URL_ENCODED_PASSWORD@DB_HOST:DB_PORT/DB_NAME`. Use the exact host and port supplied by the hosting panel.
- `DATABASE_SSL`: use `require` for remote PostgreSQL with TLS; use `disable` only when the host documents a local/non-TLS connection.
- `DATABASE_POOL_MAX`: optional pool size; default is 5 and the code caps it at 10.
- `SESSION_SECRET`: cryptographically random secret of at least 32 bytes. Generate it on a trusted machine, e.g. `openssl rand -base64 48`. Do not commit the real value.
- `STORAGE_ROOT`: absolute writable directory outside `public_html`, e.g. `/home/CPANEL_USER/vokasi-private-storage`. Replace the example account path and ensure the Node.js process can write to it.
- `EMBED_ALLOWED_ORIGINS`: optional comma-separated trusted origins if VOKASI is embedded in another school website.

Supabase credentials are not required by the migrated runtime paths. Legacy Supabase migrations/functions remain in the repository as source/reference material for the one-time data migration; they are not the new runtime database.

## Apply and verify the test schema

Only do this after confirming the target is the **empty testing database**, not production.

1. Import `database/schema.sql` once using the PostgreSQL tool available in cPanel (or `psql` from a trusted terminal). It is a bootstrap script, not a repeatable migration.
2. Import `database/functions.sql` into the same database. It installs the server-validated exam and admin functions against the local `auth.uid()` compatibility bridge.
3. If the base schema was already installed before the invitation table was added, apply `database/002_admin_invites.sql`.
4. Run `database/verify_native_setup.sql`. The relation/function checks should resolve to real objects. Row counts are expected to be zero in a fresh test database until data is imported.
5. Confirm the bootstrap markers `20261029_self_hosted_postgres_bootstrap`, `20261029_self_hosted_compatibility`, and `20261029_self_hosted_native_functions` are present in `schema_migrations`.

Do not run the bootstrap schema a second time against a populated database. Do not expose the PostgreSQL port to the public internet; the app server should be the only runtime client.

## Initial Super Admin

After the schema is imported, configure `DATABASE_URL`, `DATABASE_SSL`, `SESSION_SECRET`, `INITIAL_SUPER_ADMIN_USERNAME`, and `INITIAL_SUPER_ADMIN_PASSWORD` in a trusted terminal or protected hosting environment, then run:

```bash
npm run db:seed-super-admin
```

For a deliberate first bootstrap only, also set `ALLOW_SUPER_ADMIN_BOOTSTRAP=yes` for that command. Use a unique password with at least 14 characters and no more than 72 UTF-8 bytes. Never put the password in source code or commit it. The seeding script refuses to overwrite an existing login or create a second Super Admin.

## Native API surface

- `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout`: database-backed sessions using an HttpOnly cookie; session tokens are random and hashed at rest.
- `POST /api/auth/change-password`: verifies the current password, hashes the new password, and revokes the account's other sessions.
- `POST /api/rpc`: executes only an explicit allowlist of database functions after checking the native session and setting the current user ID transaction-locally.
- `GET /api/school/data`: role-scoped school directory, verified attempt history, analytics, and student-owned attempt/XP reads.
- `GET /api/admin/question-bank` and `/api/admin/question-data`: administrator-only published bank, draft, and import-draft workflows.
- `POST /api/admin/invitations`, `GET /api/admin/invitations?token=...`, and `POST /api/admin/invitations/accept`: one-time administrator activation links. Links expire after 48 hours and are shown once for manual delivery; no email is sent automatically.
- `POST /api/storage/upload`, `GET /api/storage/file`, and `POST /api/storage/delete`: private local image storage. Uploads validate the role, path, MIME type, extension, and size; student question images are scoped to the student's own exam session.

## Data and file migration still required

The schema does not copy existing application records. Before the switch, compare counts and representative rows for users, students, classes, majors, drafts, published questions, sessions, attempts, and notifications. Preserve UUIDs wherever records reference each other. Existing Supabase password hashes should only be reused if they are compatible with the native bcrypt verifier; otherwise arrange a secure password reset/activation process.

Image bytes are stored under `STORAGE_ROOT`; `storage.objects` contains metadata only. Existing Supabase Storage objects are **not copied automatically**. Export the old question-image and avatar buckets, copy them into the private directory while preserving object paths, and insert matching metadata before running image-based exams. Keep the old storage intact until object counts, paths, and image rendering are verified.

## Final validation before merging or deploying

- Run the CI workflow and security-contract script on the latest branch commit.
- Verify `/api/health/database` from the deployed Node.js app.
- Confirm the setup SQL check resolves all expected tables and functions.
- Test login/logout, admin invitation/activation, password change, student roster, class management, question import/edit/publish, image uploads, a full exam, autosave, server grading, review history, report export, and leaderboard/analytics against the cPanel database.
- Confirm an ordinary student cannot read another student's attempts, answer key, or exam images.
- Compare migrated row/object counts against the source export and retain a backup before any production switch.
