import { NextRequest, NextResponse } from 'next/server';
import { createNativeSession, hashPassword, hashSessionToken, isSameOriginRequest } from '@/lib/server/auth';
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

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return json({ error: 'Permintaan tidak diizinkan.' }, 403);
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 4096) return json({ error: 'Permintaan terlalu besar.' }, 413);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'Data aktivasi tidak valid.' }, 400); }
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const token = typeof payload.token === 'string' ? payload.token : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!TOKEN_PATTERN.test(token)) return json({ error: 'Tautan aktivasi tidak valid atau kedaluwarsa.' }, 410);
  if (password.length < 10 || password.length > 128 || Buffer.byteLength(password, 'utf8') > 72) {
    return json({ error: 'Kata sandi harus minimal 10 karakter dan maksimal 72 byte UTF-8.' }, 400);
  }

  let passwordHash: string;
  try { passwordHash = await hashPassword(password); }
  catch { return json({ error: 'Kata sandi tidak memenuhi ketentuan keamanan.' }, 400); }

  try {
    const db = getDatabase();
    const userId = await db.begin(async tx => {
      const invites = await tx`
        SELECT id::text AS id, email, display_name
        FROM public.app_admin_invites
        WHERE token_hash = ${hashSessionToken(token)}
          AND accepted_at IS NULL
          AND expires_at > now()
        FOR UPDATE
      `;
      const invite = invites[0];
      if (!invite) throw new Error('INVITE_INVALID');

      const existing = await tx`
        SELECT id FROM public.app_users
        WHERE lower(btrim(email)) = lower(btrim(${invite.email}))
           OR lower(btrim(username)) = lower(btrim(${invite.email}))
        LIMIT 1
      `;
      if (existing.length) throw new Error('EMAIL_ALREADY_EXISTS');

      const users = await tx`
        INSERT INTO public.app_users
          (username, email, display_name, password_hash, email_verified_at, is_active)
        VALUES (
          ${invite.email}, ${invite.email}, ${invite.display_name},
          ${passwordHash}, now(), true
        )
        RETURNING id::text AS id
      `;
      const id = users[0].id as string;
      await tx`
        INSERT INTO public.school_admins (user_id, display_name, is_active, access_role)
        VALUES (${id}::uuid, ${invite.display_name}, true, 'admin')
      `;
      await tx`
        UPDATE public.app_admin_invites SET accepted_at = now()
        WHERE id = ${invite.id}::uuid AND accepted_at IS NULL
      `;
      return id;
    });

    await createNativeSession(userId, request);
    return json({ data: { ok: true } }, 201);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const message = error instanceof Error ? error.message : '';
    if (message === 'INVITE_INVALID') return json({ error: 'Tautan aktivasi tidak valid atau kedaluwarsa.' }, 410);
    if (message === 'EMAIL_ALREADY_EXISTS' || code === '23505') return json({ error: 'Email sudah terhubung dengan akun. Hubungi Super Admin.' }, 409);
    return json({ error: 'Aktivasi akun admin tidak berhasil.' }, 500);
  }
}
