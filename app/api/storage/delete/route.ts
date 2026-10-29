import { rm } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentNativeUser, isSameOriginRequest } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db';
import { normalizeStorageObjectPath, resolveStorageObjectPath } from '@/lib/server/storage';

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
  if (!user) return json({ error: 'Sesi login tidak valid atau sudah berakhir.' }, 401);
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return json({ error: 'Akses administrator diperlukan.' }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Data penghapusan tidak valid.' }, 400);
  }
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  if (payload.bucket !== 'vokasi-question-figures' || !Array.isArray(payload.paths) || payload.paths.length > 100) {
    return json({ error: 'Daftar berkas tidak valid.' }, 400);
  }

  const paths = [...new Set(payload.paths.filter((value): value is string => typeof value === 'string')
    .map(normalizeStorageObjectPath).filter((value): value is string => Boolean(value)))];
  if (paths.length !== payload.paths.length || paths.some(path => !path.startsWith(user.id + '/'))) {
    return json({ error: 'Hanya berkas milik sesi administrator ini yang dapat dihapus.' }, 403);
  }

  try {
    const db = getDatabase();
    const removed = await db.begin(async tx => {
      const deletable: string[] = [];
      for (const objectPath of paths) {
        const objects = await tx`
          SELECT owner_id::text AS owner_id
          FROM storage.objects
          WHERE bucket_id = 'vokasi-question-figures' AND name = ${objectPath}
          LIMIT 1
        `;
        if (!objects[0] || objects[0].owner_id !== user.id) continue;

        const references = await tx`
          SELECT EXISTS (
            SELECT 1 FROM public.vokasi_web_published_questions q
            WHERE q.question_image_path = ${objectPath}
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(q.options, '[]'::jsonb)) AS opt(value)
                WHERE opt.value->>'image_path' = ${objectPath}
              )
            UNION ALL
            SELECT 1 FROM public.vokasi_question_drafts d
            WHERE d.question_image_path = ${objectPath}
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(d.options, '[]'::jsonb)) AS opt(value)
                WHERE opt.value->>'image_path' = ${objectPath}
              )
            UNION ALL
            SELECT 1 FROM public.vokasi_web_import_drafts i
            WHERE position(${objectPath} in i.payload::text) > 0
          ) AS referenced
        `;
        if (references[0]?.referenced) continue;

        await tx`
          DELETE FROM storage.objects
          WHERE bucket_id = 'vokasi-question-figures'
            AND name = ${objectPath}
            AND owner_id = ${user.id}::uuid
        `;
        deletable.push(objectPath);
      }
      return deletable;
    });

    await Promise.all(removed.map(async objectPath => {
      try {
        await rm(resolveStorageObjectPath('vokasi-question-figures', objectPath), { force: true });
      } catch {
        // Metadata is already removed; an inaccessible orphan is not served by the API.
      }
    }));
    return json({ data: { deleted: removed.length } });
  } catch {
    return json({ error: 'Berkas tidak dapat dihapus saat ini.' }, 500);
  }
}
