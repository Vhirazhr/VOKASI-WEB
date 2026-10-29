# Self-hosted PostgreSQL migration status

## Goal
Move VOKASI off Supabase onto the school's own Node.js + PostgreSQL hosting, retaining the 3D landing page and all student/admin features.

## Current state (2026-10-29)
- cPanel test database created: `u9hhs5n1_vokasi_test`.
- cPanel database user created and assigned: `u9hhs5n1_vokasi_app`.
- The application on `main` still uses `@supabase/supabase-js` for auth, PostgREST table access, RPCs, and Supabase Storage. Do not deploy it as self-hosted by setting only a database URL.
- `database/self-hosted-schema.sql` is a baseline snapshot of 18 current public base tables plus a proposed `app_users` table. References to `auth.users` have been redirected to `app_users`; defaults that require Supabase's `auth.uid()` were removed. This does not yet port RPC logic, row-level access checks, Storage, or data.

## Migration phases
1. **Schema baseline** — review and apply the DDL only to the empty cPanel test database; verify all constraints and indexes against the cPanel PostgreSQL version. Never run against the current Supabase project.
2. **Server database adapter** — add a PostgreSQL driver and server-only pool; validate SSL/connection settings, pool limits, timeouts, and graceful shutdown.
3. **Authentication** — implement server-side password hashing (Argon2id or bcrypt), secure HttpOnly/Secure/SameSite cookies, CSRF protection, login throttling, account lockout policy, and admin/super-admin authorization. Never trust a client-supplied role.
4. **Student/admin API** — port every table operation and RPC to server endpoints with authorization and ownership checks. Keep answer keys and grading on the server; preserve autosave semantics and idempotent finalization.
5. **Assets** — replace Supabase Storage with local/private object storage or an equivalent hosting-supported private storage adapter; validate MIME, size, paths, and authorization.
6. **Data migration** — export only approved data, map former auth UUIDs to `app_users.id`, copy in FK order, verify row counts and checksums, and create/reset user credentials. Do not migrate Supabase password hashes directly.
7. **Regression/security tests** — test student A cannot access student B, admin vs super-admin boundaries, quiz timer/autosave/timeout, score integrity, import/export, image access, rate limits, and session expiration.
8. **Cutover** — take a final backup, freeze writes, migrate deltas, smoke-test the school host, then change DNS only after explicit approval. Keep a rollback path.

## Current blocker
The application has not yet been converted to the self-hosted API. This branch must not be merged or deployed as a completed migration. The DDL is a starting point for review and testing, not a production-ready replacement for Supabase.

## cPanel connection
Use the database host and port shown by the hosting provider (often `localhost`, but confirm with support), database `u9hhs5n1_vokasi_test`, and user `u9hhs5n1_vokasi_app`. Store the password only in the cPanel Node.js environment. Do not put it in GitHub, browser variables, screenshots, or chat. Do not expose PostgreSQL to remote access unless the host explicitly requires it.
