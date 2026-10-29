import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentNativeUser, hashPassword, isSameOriginRequest } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return json({ error: 'Permintaan tidak diizinkan.' }, 403);
  const admin = await getCurrentNativeUser().catch(() => null);
  if (!admin) return json({ error: 'Sesi login administrator diperlukan.' }, 401);
  if (admin.role !== 'admin' && admin.role !== 'super_admin') {
    return json({ error: 'Akses administrator diperlukan.' }, 403);
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 1000) {
    return json({ error: 'Permintaan terlalu besar.' }, 413);
  }

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return json({ error: 'Data siswa tidak valid.' }, 400); }
  const values = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const rosterId = typeof values.rosterId === 'string' ? values.rosterId : '';
  if (!UUID.test(rosterId)) return json({ error: 'ID siswa tidak valid.' }, 400);

  // Each student receives a unique random credential, never a shared default password.
  const temporaryPassword = randomBytes(24).toString('base64url');
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    const db = getDatabase();
    const activated = await db.begin(async tx => {
      const rows = await tx`
        SELECT r.id::text AS id, r.full_name, r.username, r.class_id::text AS class_id,
               r.auth_user_id, r.registration_status, c.class_name
        FROM public.student_roster AS r
        JOIN public.classes AS c ON c.id = r.class_id
        WHERE r.id = ${rosterId}::uuid
        FOR UPDATE OF r
      `;
      const roster = rows[0];
      if (!roster) throw new Error('ROSTER_MISSING');
      if (roster.registration_status !== 'pending' || roster.auth_user_id) {
        throw new Error('ALREADY_ACTIVE');
      }
      const username = typeof roster.username === 'string' && roster.username.trim()
        ? roster.username.trim().toLowerCase()
        : 'siswa.' + rosterId.replace(/-/g, '').slice(0, 16);

      const exists = await tx`
        SELECT 1 FROM public.app_users
        WHERE lower(btrim(username)) = ${username}
        LIMIT 1
      `;
      if (exists.length) throw new Error('USERNAME_TAKEN');

      const created = await tx`
        INSERT INTO public.app_users (username, display_name, password_hash, is_active)
        VALUES (${username}, ${roster.full_name}, ${passwordHash}, true)
        RETURNING id::text AS id
      `;
      const userId = created[0]?.id as string;
      await tx`
        UPDATE public.student_roster
        SET username = ${username}, auth_user_id = ${userId}::uuid,
            registration_status = 'registered', registered_at = now(), updated_at = now()
        WHERE id = ${rosterId}::uuid AND registration_status = 'pending'
      `;
      await tx`
        INSERT INTO public.student_profiles (user_id, roster_id)
        VALUES (${userId}::uuid, ${rosterId}::uuid)
      `;
      return {
        username,
        fullName: String(roster.full_name),
        className: String(roster.class_name),
      };
    });

    return json({ data: { ...activated, temporaryPassword } }, 201);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'ROSTER_MISSING') return json({ error: 'Data siswa tidak ditemukan.' }, 404);
    if (msg === 'ALREADY_ACTIVE') return json({ error: 'Akun siswa sudah aktif atau tidak dapat diaktifkan.' }, 409);
    if (msg === 'USERNAME_TAKEN' || code === '23505') {
      return json({ error: 'Username sudah digunakan. Perbaiki data siswa sebelum aktivasi.' }, 409);
    }
    return json({ error: 'Akun siswa tidak dapat diaktifkan saat ini.' }, 500);
  }
}
