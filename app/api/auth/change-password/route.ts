import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getCurrentNativeUser,
  hashPassword,
  hashSessionToken,
  isSameOriginRequest,
  SESSION_COOKIE_NAME,
  verifyPassword,
} from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return json({ error: 'Permintaan tidak diizinkan.' }, 403);
  const user = await getCurrentNativeUser().catch(() => null);
  if (!user) return json({ error: 'Sesi akun tidak valid. Masuk kembali untuk mengganti kata sandi.' }, 401);

  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 4096) return json({ error: 'Permintaan terlalu besar.' }, 413);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'Data kata sandi tidak valid.' }, 400); }
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const currentPassword = typeof payload.currentPassword === 'string' ? payload.currentPassword : '';
  const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';
  if (!currentPassword || currentPassword.length > 1024) return json({ error: 'Masukkan kata sandi saat ini.' }, 400);
  if (newPassword.length < 8 || newPassword.length > 128 || Buffer.byteLength(newPassword, 'utf8') > 72) {
    return json({ error: 'Kata sandi baru minimal 8 karakter dan maksimal 72 byte UTF-8.' }, 400);
  }

  const db = getDatabase();
  const rows = await db`
    SELECT password_hash
    FROM public.app_users
    WHERE id = ${user.id}::uuid AND is_active = true
    LIMIT 1
  `;
  if (!rows.length || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
    return json({ error: 'Kata sandi saat ini tidak cocok.' }, 400);
  }

  let passwordHash: string;
  try { passwordHash = await hashPassword(newPassword); }
  catch { return json({ error: 'Kata sandi baru tidak memenuhi ketentuan keamanan.' }, 400); }

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token || token.length > 100) return json({ error: 'Sesi akun tidak valid. Masuk kembali.' }, 401);
  const tokenHash = hashSessionToken(token);

  try {
    await db.begin(async tx => {
      await tx`
        UPDATE public.app_users
        SET password_hash = ${passwordHash}, updated_at = now()
        WHERE id = ${user.id}::uuid AND is_active = true
      `;
      await tx`
        UPDATE public.app_sessions
        SET revoked_at = now()
        WHERE user_id = ${user.id}::uuid
          AND token_hash <> ${tokenHash}
          AND revoked_at IS NULL
      `;
    });
    return json({ data: { ok: true } });
  } catch {
    return json({ error: 'Kata sandi baru tidak berhasil disimpan.' }, 500);
  }
}
