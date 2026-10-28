import { NextRequest, NextResponse } from 'next/server';
import { getCurrentNativeUser, isSameOriginRequest } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ArgType = 'uuid' | 'text' | 'integer' | 'smallint' | 'jsonb' | 'uuid[]';
type RpcArg = { name: string; type: ArgType };
type RpcDefinition = { args: RpcArg[]; result: 'scalar' | 'rows'; anonymous?: boolean };

const RPC_DEFINITIONS: Record<string, RpcDefinition> = {
  is_school_admin: { args: [], result: 'scalar' },
  vokasi_is_super_admin: { args: [], result: 'scalar' },
  vokasi_admin_add_pending_students: { args: [{ name: 'p_rows', type: 'jsonb' }], result: 'scalar' },
  vokasi_admin_completed_review: { args: [{ name: 'p_session', type: 'uuid' }], result: 'scalar' },
  vokasi_admin_create_class: { args: [
    { name: 'p_major_id', type: 'uuid' }, { name: 'p_name', type: 'text' },
    { name: 'p_grade', type: 'smallint' }, { name: 'p_year', type: 'text' },
  ], result: 'scalar' },
  vokasi_admin_create_major: { args: [
    { name: 'p_name', type: 'text' }, { name: 'p_code', type: 'text' },
  ], result: 'scalar' },
  vokasi_admin_delete_empty_class: { args: [{ name: 'p_class_id', type: 'uuid' }], result: 'scalar' },
  vokasi_admin_edit_published_question: { args: [
    { name: 'p_source_number', type: 'integer' }, { name: 'p_expected', type: 'jsonb' },
    { name: 'p_change', type: 'jsonb' },
  ], result: 'scalar' },
  vokasi_admin_exam_activity: { args: [
    { name: 'p_days', type: 'integer' }, { name: 'p_limit', type: 'integer' },
    { name: 'p_offset', type: 'integer' }, { name: 'p_student', type: 'uuid' },
  ], result: 'scalar' },
  vokasi_admin_get_edit_question: { args: [{ name: 'p_source_number', type: 'integer' }], result: 'scalar' },
  vokasi_admin_get_notifications: { args: [{ name: 'p_limit', type: 'integer' }], result: 'scalar' },
  vokasi_admin_import_questions: { args: [
    { name: 'p_questions', type: 'jsonb' }, { name: 'p_mode', type: 'text' },
  ], result: 'scalar' },
  vokasi_admin_list_administrators: { args: [], result: 'rows' },
  vokasi_admin_mark_notifications_read: { args: [{ name: 'p_attempt_ids', type: 'uuid[]' }], result: 'scalar' },
  vokasi_admin_monitor_activity: { args: [
    { name: 'p_kind', type: 'text' }, { name: 'p_days', type: 'integer' },
    { name: 'p_limit', type: 'integer' }, { name: 'p_offset', type: 'integer' },
  ], result: 'scalar' },
  vokasi_admin_move_student: { args: [
    { name: 'p_roster_id', type: 'uuid' }, { name: 'p_new_class_id', type: 'uuid' },
  ], result: 'scalar' },
  vokasi_admin_question_health: { args: [], result: 'scalar' },
  vokasi_admin_student_history: { args: [
    { name: 'p_student', type: 'uuid' }, { name: 'p_limit', type: 'integer' },
  ], result: 'scalar' },
  vokasi_admin_update_class: { args: [
    { name: 'p_class_id', type: 'uuid' }, { name: 'p_major_id', type: 'uuid' },
    { name: 'p_name', type: 'text' }, { name: 'p_grade', type: 'smallint' },
    { name: 'p_year', type: 'text' },
  ], result: 'scalar' },
  vokasi_public_leaderboard: { args: [], result: 'rows', anonymous: true },
  vokasi_school_avatar_index: { args: [], result: 'rows' },
  vokasi_school_leaderboard: { args: [], result: 'rows' },
  vokasi_school_legacy_leaderboard: { args: [], result: 'rows' },
  vokasi_school_weak_topics: { args: [], result: 'rows' },
  vokasi_super_admin_manage_account: { args: [
    { name: 'p_target', type: 'uuid' }, { name: 'p_action', type: 'text' },
    { name: 'p_display_name', type: 'text' },
  ], result: 'scalar' },
  vokasi_web_begin_session: { args: [{ name: 'p_session', type: 'uuid' }], result: 'scalar' },
  vokasi_web_cancel_session: { args: [{ name: 'p_session', type: 'uuid' }], result: 'scalar' },
  vokasi_web_completed_review: { args: [{ name: 'p_session', type: 'uuid' }], result: 'scalar' },
  vokasi_web_get_quiz_state: { args: [{ name: 'p_session', type: 'uuid' }], result: 'scalar' },
  vokasi_web_pause_bank: { args: [], result: 'scalar' },
  vokasi_web_prepare_session: { args: [{ name: 'p_category', type: 'text' }], result: 'scalar' },
  vokasi_web_publish_new_bank: { args: [], result: 'scalar' },
  vokasi_web_quiz_progress: { args: [{ name: 'p_session', type: 'uuid' }], result: 'scalar' },
  vokasi_web_record_exam_activity: { args: [
    { name: 'p_session', type: 'uuid' }, { name: 'p_event_type', type: 'text' },
    { name: 'p_question_index', type: 'integer' }, { name: 'p_target_label', type: 'text' },
    { name: 'p_target_kind', type: 'text' }, { name: 'p_detail', type: 'text' },
  ], result: 'scalar' },
  vokasi_web_select_answer: { args: [
    { name: 'p_session', type: 'uuid' }, { name: 'p_question_index', type: 'integer' },
    { name: 'p_choice', type: 'integer' },
  ], result: 'scalar' },
  vokasi_web_submit_answer: { args: [
    { name: 'p_session', type: 'uuid' }, { name: 'p_question_index', type: 'integer' },
    { name: 'p_choice', type: 'integer' },
  ], result: 'scalar' },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function response(data: unknown, error: { message: string; code?: string } | null, status = 200) {
  return NextResponse.json({ data, error }, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

function validateValue(type: ArgType, value: unknown): { ok: true; value: unknown } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  switch (type) {
    case 'uuid':
      return typeof value === 'string' && UUID_RE.test(value) ? { ok: true, value } : { ok: false };
    case 'text':
      return typeof value === 'string' && value.length <= 20000 ? { ok: true, value } : { ok: false };
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
        ? { ok: true, value } : { ok: false };
    case 'smallint':
      return typeof value === 'number' && Number.isInteger(value) && value >= -32768 && value <= 32767
        ? { ok: true, value } : { ok: false };
    case 'jsonb':
      if (typeof value !== 'object') return { ok: false };
      return { ok: true, value: JSON.stringify(value) };
    case 'uuid[]':
      return Array.isArray(value) && value.length <= 500 && value.every(item => typeof item === 'string' && UUID_RE.test(item))
        ? { ok: true, value } : { ok: false };
  }
}

function sqlCast(type: ArgType): string {
  switch (type) {
    case 'uuid': return 'uuid';
    case 'text': return 'text';
    case 'integer': return 'integer';
    case 'smallint': return 'smallint';
    case 'jsonb': return 'jsonb';
    case 'uuid[]': return 'uuid[]';
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return response(null, { message: 'Permintaan tidak diizinkan.' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return response(null, { message: 'Gunakan format JSON.' }, 415);
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 8_000_000) {
    return response(null, { message: 'Data terlalu besar untuk diproses.' }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(null, { message: 'Data permintaan tidak valid.' }, 400);
  }
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  if (typeof payload.name !== 'string' || !Object.hasOwn(RPC_DEFINITIONS, payload.name)) {
    return response(null, { message: 'Operasi tidak tersedia.' }, 404);
  }
  const definition = RPC_DEFINITIONS[payload.name];
  const args = payload.args && typeof payload.args === 'object' && !Array.isArray(payload.args)
    ? payload.args as Record<string, unknown> : {};
  const allowedArgs = new Set(definition.args.map(arg => arg.name));
  if (Object.keys(args).some(key => !allowedArgs.has(key))) {
    return response(null, { message: 'Parameter permintaan tidak dikenal.' }, 400);
  }
  const values: (string | number | null | string[])[] = [];
  const placeholders: string[] = [];
  for (let i = 0; i < definition.args.length; i += 1) {
    const arg = definition.args[i];
    const checked = validateValue(arg.type, args[arg.name]);
    if (!checked.ok) return response(null, { message: `Parameter ${arg.name} tidak valid.` }, 400);
    const value = checked.value;
    values.push(value as string | number | null | string[]);
    placeholders.push(`$${i + 1}::${sqlCast(arg.type)}`);
  }

  try {
    const user = await getCurrentNativeUser();
    if (!user && !definition.anonymous) {
      return response(null, { message: 'Sesi login diperlukan.' }, 401);
    }
    const db = getDatabase();
    const functionName = `public.${payload.name}`; // Name is from the fixed allowlist above.
    const call = `${functionName}(${placeholders.join(', ')})`;
    const query = definition.result === 'rows'
      ? `SELECT * FROM ${call}`
      : `SELECT ${call} AS data`;

    const result = await db.begin(async tx => {
      await tx`SELECT set_config('app.user_id', ${user?.id ?? ''}, true)`;
      return tx.unsafe(query, values);
    });

    const data = definition.result === 'rows' ? result : (result[0] as { data?: unknown } | undefined)?.data ?? null;
    return response(data, null);
  } catch (error) {
    const pgError = error as { code?: string; message?: string };
    if (pgError.code === 'P0001' || pgError.code === '42501') {
      return response(null, { message: (pgError.message ?? 'Operasi ditolak.').slice(0, 400), code: pgError.code }, 400);
    }
    return response(null, { message: 'Operasi database gagal. Periksa konfigurasi server.' }, 503);
  }
}
