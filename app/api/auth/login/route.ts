import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/server/db';
import {
  createNativeSession,
  hashPassword,
  hashRateLimitKey,
  isSameOriginRequest,
  passwordHashNeedsUpgrade,
  requireSessionSecret,
  verifyPassword,
} from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RequestedRole = 'student' | 'admin';
type LoginRow = {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  is_active: boolean;
  display_name: string;
  role: 'student' | 'admin' | 'super_admin' | null;
  roster_username: string | null;
  full_name: string | null;
  class_id: string | null;
  class_name: string | null;
  major_id: string | null;
  major_name: string | null;
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...extraHeaders },
  });
}

function parseStudentIdentity(raw: string): { name: string; classHint: string } | null {
  const parts = raw.split('|');
  if (parts.length > 2) return null;
  const name = parts[0].trim().replace(/\s+/g, ' ');
  const classHint = parts[1]?.trim().replace(/\s+/g, ' ').toUpperCase() ?? '';
  if (name.length < 2 || (parts.length === 2 && !classHint)) return null;
  return { name, classHint };
}

function studentProfile(row: LoginRow) {
  if (!row.class_id || !row.class_name || !row.major_id || !row.major_name) return null;
  return {
    authId: row.id,
    username: row.roster_username || row.username,
    fullName: row.full_name || row.display_name,
    classId: row.class_id,
    className: row.class_name,
    majorId: row.major_id,
    majorName: row.major_name,
  };
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return json({ error: 'Permintaan tidak diizinkan.' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return json({ error: 'Gunakan format JSON.' }, 415);
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return json({ error: 'Permintaan terlalu besar.' }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Data login tidak valid.' }, 400);
  }

  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const identifier = typeof payload.identifier === 'string'
    ? payload.identifier.trim()
    : typeof payload.username === 'string' ? payload.username.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const requestedRole: RequestedRole | null = payload.role === 'admin' || payload.role === 'student' ? payload.role : null;

  if (!requestedRole || !identifier || identifier.length > 254 || !password || password.length > 1024) {
    return json({ error: 'Masukkan jenis akun, username/email, dan password yang valid.' }, 400);
  }

  const studentIdentity = requestedRole === 'student' ? parseStudentIdentity(identifier) : null;
  if (requestedRole === 'student' && !studentIdentity) {
    return json({ error: 'Format nama siswa tidak valid. Jika nama sama, gunakan Nama Lengkap | Kelas.' }, 400);
  }

  try {
    requireSessionSecret();
    const db = getDatabase();
    const normalized = identifier.toLowerCase();
    const identifierHash = hashRateLimitKey(`identifier:${normalized}`);
    const ip = request.headers.get('x-real-ip')?.trim()
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || null;
    const ipHash = ip ? hashRateLimitKey(`ip:${ip.slice(0, 100)}`) : null;

    // Serialize concurrent attempts so parallel requests cannot race past rate limits.
    const outcome = await db.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`identifier:${identifierHash}`}, 0))`;
      if (ipHash) await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`ip:${ipHash}`}, 0))`;

      await tx`DELETE FROM public.app_login_attempts WHERE attempted_at < now() - interval '7 days'`;
      const limits = ipHash
        ? await tx`
            SELECT
              count(*) FILTER (WHERE identifier_hash = ${identifierHash})::int AS identifier_failures,
              count(*) FILTER (WHERE ip_hash = ${ipHash})::int AS ip_failures
            FROM public.app_login_attempts
            WHERE succeeded = false
              AND attempted_at > now() - interval '15 minutes'
              AND (identifier_hash = ${identifierHash} OR ip_hash = ${ipHash})
          `
        : await tx`
            SELECT count(*)::int AS identifier_failures, 0::int AS ip_failures
            FROM public.app_login_attempts
            WHERE identifier_hash = ${identifierHash}
              AND succeeded = false
              AND attempted_at > now() - interval '15 minutes'
          `;

      const identifierFailures = Number(limits[0]?.identifier_failures ?? 0);
      const ipFailures = Number(limits[0]?.ip_failures ?? 0);
      if (identifierFailures >= 8 || (ipHash && ipFailures >= 100)) return { kind: 'rate-limited' as const };

      const fields = `
        u.id::text AS id,
        u.username,
        u.email,
        u.password_hash,
        u.is_active,
        COALESCE(NULLIF(u.display_name, ''), r.full_name, sa.display_name, u.username) AS display_name,
        CASE
          WHEN sa.access_role = 'super_admin' THEN 'super_admin'
          WHEN sa.user_id IS NOT NULL THEN 'admin'
          WHEN r.auth_user_id IS NOT NULL THEN 'student'
          ELSE NULL
        END AS role,
        r.username AS roster_username,
        r.full_name,
        r.class_id::text AS class_id,
        c.class_name,
        COALESCE(r.major_id, c.major_id)::text AS major_id,
        m.name AS major_name
      `;

      let found: LoginRow[] = [];
      if (requestedRole === 'admin') {
        found = await tx.unsafe(`
          SELECT ${fields}
          FROM public.app_users AS u
          JOIN public.school_admins AS sa ON sa.user_id = u.id AND sa.is_active = true
          LEFT JOIN public.student_roster AS r ON r.auth_user_id = u.id AND r.registration_status = 'registered'
          LEFT JOIN public.classes AS c ON c.id = r.class_id
          LEFT JOIN public.majors AS m ON m.id = COALESCE(r.major_id, c.major_id)
          WHERE lower(btrim(u.username)) = $1 OR lower(btrim(COALESCE(u.email, ''))) = $1
          LIMIT 2
        `, [normalized]) as LoginRow[];
      } else {
        found = await tx.unsafe(`
          SELECT ${fields}
          FROM public.app_users AS u
          JOIN public.student_roster AS r ON r.auth_user_id = u.id AND r.registration_status = 'registered'
          JOIN public.classes AS c ON c.id = r.class_id
          LEFT JOIN public.school_admins AS sa ON sa.user_id = u.id AND sa.is_active = true
          LEFT JOIN public.majors AS m ON m.id = COALESCE(r.major_id, c.major_id)
          WHERE (lower(btrim(u.username)) = $1 OR lower(btrim(COALESCE(u.email, ''))) = $1)
            AND sa.user_id IS NULL
          LIMIT 2
        `, [normalized]) as LoginRow[];

        if (found.length === 0 && studentIdentity) {
          const fullName = studentIdentity.name.toLowerCase();
          const classHint = studentIdentity.classHint;
          found = await tx.unsafe(`
            SELECT ${fields}
            FROM public.student_roster AS r
            JOIN public.app_users AS u ON u.id = r.auth_user_id AND u.is_active = true
            JOIN public.classes AS c ON c.id = r.class_id
            LEFT JOIN public.school_admins AS sa ON sa.user_id = u.id AND sa.is_active = true
            LEFT JOIN public.majors AS m ON m.id = COALESCE(r.major_id, c.major_id)
            WHERE r.registration_status = 'registered'
              AND sa.user_id IS NULL
              AND lower(regexp_replace(btrim(r.full_name), '[[:space:]]+', ' ', 'g')) = $1
              AND ($2 = '' OR upper(btrim(c.class_name)) = $2)
            LIMIT 2
          `, [fullName, classHint]) as LoginRow[];
        }
      }

      // Ambiguous usernames/emails or duplicate full names fail closed.
      const user = found.length === 1 ? found[0] : undefined;
      const validPassword = await verifyPassword(password, user?.password_hash);
      const allowed = Boolean(user && user.is_active && user.role && validPassword
        && (requestedRole === 'admin' ? user.role === 'admin' || user.role === 'super_admin' : user.role === 'student'));

      await tx`
        INSERT INTO public.app_login_attempts (identifier_hash, ip_hash, succeeded)
        VALUES (${identifierHash}, ${ipHash}, ${allowed})
      `;

      if (!allowed || !user) return { kind: 'denied' as const };

      if (passwordHashNeedsUpgrade(user.password_hash)) {
        const upgradedHash = await hashPassword(password);
        await tx`UPDATE public.app_users SET password_hash = ${upgradedHash}, updated_at = now() WHERE id = ${user.id}::uuid`;
      }
      await tx`UPDATE public.app_users SET last_login_at = now() WHERE id = ${user.id}::uuid`;
      return {
        kind: 'ok' as const,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.display_name,
          role: user.role as 'student' | 'admin' | 'super_admin',
          profile: user.role === 'student' ? studentProfile(user) : null,
        },
      };
    });

    if (outcome.kind === 'rate-limited') {
      return json({ error: 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.' }, 429, { 'Retry-After': '900' });
    }
    if (outcome.kind === 'denied') return json({ error: 'Nama/username, kelas, atau password tidak cocok.' }, 401);

    await createNativeSession(outcome.user.id, request);
    return json({ ok: true, user: outcome.user });
  } catch {
    return json({ error: 'Layanan login belum siap. Periksa konfigurasi server.' }, 503);
  }
}
