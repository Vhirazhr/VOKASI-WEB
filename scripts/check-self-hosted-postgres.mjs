import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const schema = read('database/schema.sql');
const db = read('lib/server/db.ts');
const auth = read('lib/server/auth.ts');
const login = read('app/api/auth/login/route.ts');
const me = read('app/api/auth/me/route.ts');
const logout = read('app/api/auth/logout/route.ts');
const health = read('app/api/health/database/route.ts');
const seed = read('scripts/seed-super-admin.mjs');
const docs = read('docs/SELF-HOSTED-POSTGRES.md');

assert.match(schema, /CREATE TABLE public\.app_users/);
assert.match(schema, /CREATE TABLE public\.app_sessions/);
assert.match(schema, /CREATE TABLE public\.app_login_attempts/);
assert.match(schema, /CREATE TABLE public\.vokasi_web_exam_sessions/);
assert.match(schema, /CREATE TABLE public\.vokasi_web_verified_results/);
assert.match(schema, /CREATE VIEW public\.vokasi_verified_attempts/);
assert.match(schema, /vokasi_limit_daily_compulsory_xp_before_insert/);
assert.match(schema, /vokasi_web_stop_broken_visual_release/);
assert.doesNotMatch(schema.replace(/^--.*$/gm, ''), /auth\.users|auth\.uid\s*\(/i, 'Standalone schema must not depend on hosted Auth.');
assert.doesNotMatch(schema, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);

assert.match(db, /import 'server-only'/);
assert.match(db, /process\.env\.DATABASE_URL/);
assert.doesNotMatch(db, /NEXT_PUBLIC_DATABASE_URL|NEXT_PUBLIC.*PASSWORD/i);

assert.match(auth, /httpOnly: true/);
assert.match(auth, /sameSite: 'lax'/);
assert.match(auth, /randomBytes\(32\)/);
assert.match(auth, /hashSessionToken/);
assert.match(auth, /revoked_at IS NULL/);
assert.match(auth, /expires_at > now\(\)/);
assert.match(auth, /school_admins AS sa/);
assert.match(auth, /registration_status = 'registered'/);

assert.match(login, /count\(\*\).*identifier_hash/s);
assert.match(login, /Terlalu banyak percobaan login/);
assert.match(login, /LIMIT 2/);
assert.match(login, /Username\/email atau password salah/);
assert.match(login, /isSameOriginRequest/);
assert.doesNotMatch(login, /console\.(log|error)\(.*password/i);

assert.match(me, /getCurrentNativeUser/);
assert.match(logout, /revokeCurrentNativeSession/);
assert.match(health, /SELECT 1 AS ready/);
assert.doesNotMatch(health, /error\.message|DATABASE_URL/);

assert.match(seed, /ALLOW_SUPER_ADMIN_BOOTSTRAP/);
assert.match(seed, /refusing to overwrite/i);
assert.match(seed, /bcrypt\.hash\(password, 12\)/);
assert.match(docs, /NOT YET A FULL CUTOVER/);
assert.match(docs, /do not remove the existing backend/i);

console.log('OK: self-hosted PostgreSQL foundation and native-auth security contracts passed.');
