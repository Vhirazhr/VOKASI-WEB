import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const schema = readFileSync(new URL('../database/self-hosted-schema.sql', import.meta.url), 'utf8');
const migrationDoc = readFileSync(new URL('../docs/SELF-HOSTED-MIGRATION.md', import.meta.url), 'utf8');
const sql = schema.replace(/^--.*$/gm, '');

assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.app_users/i, 'self-hosted app_users table is required');
assert.match(sql, /BEGIN;[\s\S]*COMMIT;/i, 'schema must be transaction-wrapped');
assert.doesNotMatch(sql, /REFERENCES\s+auth\./i, 'schema must not reference Supabase auth schema');
assert.doesNotMatch(sql, /\bauth\.uid\s*\(/i, 'schema must not depend on Supabase auth.uid()');
assert.doesNotMatch(sql, /public\."null"/i, 'schema must not contain unresolved foreign-key targets');
assert.doesNotMatch(sql, /NEXT_PUBLIC_SUPABASE|SERVICE_ROLE_KEY/i, 'schema must never contain credentials');
for (const table of [
  'classes', 'majors', 'school_admins', 'school_import_batches', 'student_attempts',
  'student_email_challenges', 'student_profiles', 'student_roster',
  'vokasi_admin_change_log', 'vokasi_admin_notification_reads', 'vokasi_question_drafts',
  'vokasi_visual_asset_blocks', 'vokasi_web_bank_release', 'vokasi_web_exam_activity_events',
  'vokasi_web_exam_sessions', 'vokasi_web_import_drafts', 'vokasi_web_published_questions',
  'vokasi_web_verified_results'
]) {
  assert.match(sql, new RegExp('CREATE TABLE IF NOT EXISTS public\\."' + table + '"', 'i'), 'missing table: ' + table);
}
assert.match(migrationDoc, /not yet been converted to the self-hosted API/i, 'migration status must be explicit');
console.log('Self-hosted PostgreSQL schema contract passed (static checks only; not a live database test).');
