import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
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

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...extraHeaders },
  });
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

  if (!identifier || identifier.length > 254 || !password || password.length > 1024) {
    return json({ error: 'Masukkan username/email dan password yang valid.' }, 400);
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

    const limits = ipHash
      ? await db`
          SELECT
            count(*) FILTER (WHERE identifier_hash = ${identifierHash})::int AS identifier_failures,
            count(*) FILTER (WHERE ip_hash = ${ipHash})::int AS ip_failures
          FROM public.app_login_attempts
          WHERE succeeded = false
            AND attempted_at > now() - interval '15 minutes'
            AND (identifier_hash = ${identifierHash} OR ip_hash = ${ipHash})
        `
      : await db`
          SELECT count(*)::int AS identifier_failures, 0::int AS ip_failures
          FROM public.app_login_attempts
          WHERE identifier_hash = ${identifierHash}
            AND succeeded = false
            AND attempted_at > now() - interval '15 minutes'
        `;
    const identifierFailures = Number(limits[0]?.identifier_failures ?? 0);
    const ipFailures = Number(limits[0]?.ip_failures ?? 0);
    if (identifierFailures >= 8 || (ipHash && ipFailures >= 100)) {
      return json({ error: 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.' }, 429, { 'Retry-After': '900' });
    }

    const found = await db`
      SELECT
        u.id::text AS id,
        u.username,
        u.password_hash,
        u.is_active,
        COALESCE(NULLIF(u.display_name, ''), r.full_name, sa.display_name, u.username) AS display_name,
        CASE
          WHEN sa.access_role = 'super_admin' THEN 'super_admin'
          WHEN sa.user_id IS NOT NULL THEN 'admin'
          WHEN r.auth_user_id IS NOT NULL THEN 'student'
          ELSE NULL
        END AS role
      FROM public.app_users AS u
      LEFT JOIN public.school_admins AS sa ON sa.user_id = u.id AND sa.is_active = true
      LEFT JOIN public.student_roster AS r
        ON r.auth_user_id = u.id AND r.registration_status = 'registered'
      WHERE lower(btrim(u.username)) = ${normalized}
         OR lower(btrim(COALESCE(u.email, ''))) = ${normalized}
      LIMIT 2
    `;

    // Fail closed if legacy data has ambiguous login identifiers across accounts.
    const user = found.length === 1 ? found[0] as {
      id: string;
      username: string;
      password_hash: string;
      is_active: boolean;
      display_name: string;
      role: 'student' | 'admin' | 'super_admin' | null;
    } : undefined;

    const validPassword = await verifyPassword(password, user?.password_hash);
    const allowed = Boolean(user && user.is_active && user.role && validPassword);
    await db`
      INSERT INTO public.app_login_attempts (identifier_hash, ip_hash, succeeded)
      VALUES (${identifierHash}, ${ipHash}, ${allowed})
    `;

    if (!allowed || !user) return json({ error: 'Username/email atau password salah.' }, 401);

    if (passwordHashNeedsUpgrade(user.password_hash)) {
      const upgradedHash = await hashPassword(password);
      await db`UPDATE public.app_users SET password_hash = ${upgradedHash}, updated_at = now() WHERE id = ${user.id}::uuid`;
    }
    await db`UPDATE public.app_users SET last_login_at = now() WHERE id = ${user.id}::uuid`;
    await createNativeSession(user.id, request);

    return json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    });
  } catch {
    return json({ error: 'Layanan login belum siap. Periksa konfigurasi server.' }, 503);
  }
}
