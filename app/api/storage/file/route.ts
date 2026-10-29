import { readFile, stat } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentNativeUser } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db';
import { isStorageBucket, normalizeStorageObjectPath, resolveStorageObjectPath } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function GET(request: NextRequest) {
  const user = await getCurrentNativeUser().catch(() => null);
  if (!user) return errorResponse('Sesi login tidak valid atau sudah berakhir.', 401);

  const bucketValue = request.nextUrl.searchParams.get('bucket') ?? '';
  const pathValue = request.nextUrl.searchParams.get('path') ?? '';
  if (!isStorageBucket(bucketValue)) return errorResponse('Berkas tidak ditemukan.', 404);
  const objectPath = normalizeStorageObjectPath(pathValue);
  if (!objectPath) return errorResponse('Berkas tidak ditemukan.', 404);

  try {
    const db = getDatabase();
    const rows = await db`
      SELECT bucket_id, name, owner_id::text AS owner_id, mimetype, size_bytes
      FROM storage.objects
      WHERE bucket_id = ${bucketValue} AND name = ${objectPath}
      LIMIT 1
    `;
    const object = rows[0];
    if (!object) return errorResponse('Berkas tidak ditemukan.', 404);

    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    if (!isAdmin && bucketValue === 'vokasi-question-figures') {
      const sessionId = request.nextUrl.searchParams.get('sessionId') ?? '';
      if (!UUID.test(sessionId)) return errorResponse('Akses berkas tidak diizinkan.', 403);

      const allowed = await db`
        SELECT EXISTS (
          SELECT 1
          FROM public.vokasi_web_exam_sessions AS s
          CROSS JOIN LATERAL jsonb_array_elements(s.questions) AS q(value)
          WHERE s.id = ${sessionId}::uuid
            AND s.auth_user_id = ${user.id}::uuid
            AND (
              q.value->>'image_path' = ${objectPath}
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements(COALESCE(q.value->'options', '[]'::jsonb)) AS option_row(value)
                WHERE option_row.value->>'image_path' = ${objectPath}
              )
            )
        ) AS allowed
      `;
      if (!allowed[0]?.allowed) return errorResponse('Akses berkas tidak diizinkan.', 403);
    } else if (!isAdmin && bucketValue === 'vokasi-avatars') {
      const parts = objectPath.split('/');
      if (parts.length !== 2 || parts[1] !== 'avatar.jpg') return errorResponse('Akses berkas tidak diizinkan.', 403);
      const allowed = await db`
        SELECT EXISTS (
          SELECT 1
          FROM public.student_roster AS r
          JOIN public.app_users AS u ON u.id = r.auth_user_id
          WHERE r.username = ${parts[0]}
            AND r.registration_status = 'registered'
            AND u.is_active = true
            AND ${objectPath} = r.username || '/avatar.jpg'
        ) AS allowed
      `;
      if (!allowed[0]?.allowed) return errorResponse('Akses berkas tidak diizinkan.', 403);
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(object.mimetype)) {
      return errorResponse('Tipe berkas tidak didukung.', 415);
    }
    const filePath = resolveStorageObjectPath(bucketValue, objectPath);
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat || !fileStat.isFile() || fileStat.size > 3 * 1024 * 1024) {
      return errorResponse('Berkas tidak ditemukan.', 404);
    }
    const bytes = await readFile(filePath);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': object.mimetype,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return errorResponse('Penyimpanan berkas tidak tersedia.', 503);
  }
}
