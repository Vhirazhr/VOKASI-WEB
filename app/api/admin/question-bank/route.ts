import { NextRequest, NextResponse } from 'next/server';
import { getCurrentNativeUser } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function GET(request: NextRequest) {
  const user = await getCurrentNativeUser().catch(() => null);
  if (!user) return json({ error: 'Sesi login tidak valid atau sudah berakhir.' }, 401);
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return json({ error: 'Akses administrator diperlukan.' }, 403);
  }

  try {
    const db = getDatabase();
    const releases = await db`
      SELECT active, version
      FROM public.vokasi_web_bank_release
      WHERE id = 1
      LIMIT 1
    `;
    const release = releases[0];
    const active = Boolean(release?.active);
    const version = release?.version ? String(release.version) : null;
    if (request.nextUrl.searchParams.get('meta') === '1') {
      return json({ data: { active, version: active ? version : null } });
    }

    const questions = active
      ? await db`
          SELECT source_number, category, difficulty_code, question,
            question_image_path, options, correct_index, time_limit_seconds, explanation
          FROM public.vokasi_web_published_questions
          ORDER BY source_number ASC
        `
      : [];

    return json({ data: { active, version: active ? version : null, questions } });
  } catch {
    return json({ error: 'Bank soal lokal tidak dapat dimuat saat ini.' }, 500);
  }
}
