import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentNativeUser, hashSessionToken, isSameOriginRequest } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,60}$/;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (!TOKEN_PATTERN.test(token)) return json({ error: 'Tautan aktivasi tidak valid atau kedaluwarsa.' }, 400);
  try {
    const rows = await getDatabase()`
      SELECT email, display_name, expires_at
      FROM public.app_admin_invites
      WHERE token_hash = ${hashSessionToken(token)}
        AND accepted_at IS NULL
        AND expires_at > now()
      LIMIT 1
    `;
    if (!rows.length) return json({ error: 'Tautan aktivasi tidak valid atau kedaluwarsa.' }, 410);
    return json({ data: {
      email: rows[0].email,
      displayName: rows[0].display_name,
      expiresAt: rows[0].expires_at,
    } });
  } catch {
    return json({ error: 'Undangan tidak dapat diverifikasi saat ini.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return json({ error: 'Permintaan tidak diizinkan.' }, 403);
  const user = await getCurrentNativeUser().catch(() => null);
  if (!user) return json({ error: 'Sesi login tidak valid atau sudah berakhir.' }, 401);
  if (user.role !== 'super_admin') return json({ error: 'Hanya Super Admin yang dapat membuat undangan.' }, 403);

  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 4096) return json({ error: 'Permintaan terlalu besar.' }, 413);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'Data undangan tidak valid.' }, 400); }
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim().replace(/\s+/g, ' ') : '';
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (displayName.length < 3 || displayName.length > 100) return json({ error: 'Nama lengkap harus 3–100 karakter.' }, 400);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Alamat email tidak valid.' }, 400);

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  try {
    const db = getDatabase();
    const created = await db.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${'admin-invite:' + email}, 0))`;
      await tx`
        DELETE FROM public.app_admin_invites
        WHERE lower(btrim(email)) = ${email}
          AND accepted_at IS NULL
          AND expires_at <= now()
      `;
      const existingUsers = await tx`
        SELECT id FROM public.app_users
        WHERE lower(btrim(email)) = ${email}
           OR lower(btrim(username)) = ${email}
        LIMIT 1
      `;
      if (existingUsers.length) throw new Error('EMAIL_ALREADY_EXISTS');
      const pending = await tx`
        SELECT id FROM public.app_admin_invites
        WHERE lower(btrim(email)) = ${email}
          AND accepted_at IS NULL
          AND expires_at > now()
        LIMIT 1
      `;
      if (pending.length) throw new Error('INVITE_ALREADY_PENDING');
      const rows = await tx`
        INSERT INTO public.app_admin_invites
          (email, display_name, token_hash, created_by, expires_at)
        VALUES (
          ${email}, ${displayName}, ${tokenHash}, ${user.id}::uuid,
          now() + interval '48 hours'
        )
        RETURNING expires_at
      `;
      return rows[0]?.expires_at;
    });

    const origin = new URL(request.nextUrl.origin);
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    if (forwardedHost) origin.host = forwardedHost;
    if (process.env.NODE_ENV === 'production' || forwardedProto === 'https') origin.protocol = 'https:';
    const activation = new URL('/admin/aktivasi', origin.origin);
    activation.searchParams.set('token', token);
    return json({ data: {
      ok: true,
      activationUrl: activation.toString(),
      expiresAt: created,
    } }, 201);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const message = error instanceof Error ? error.message : '';
    if (message === 'EMAIL_ALREADY_EXISTS') return json({ error: 'Email tersebut sudah digunakan oleh akun yang ada.' }, 409);
    if (message === 'INVITE_ALREADY_PENDING' || code === '23505') return json({ error: 'Undangan aktif untuk email tersebut sudah ada.' }, 409);
    return json({ error: 'Undangan admin tidak berhasil dibuat.' }, 500);
  }
}
