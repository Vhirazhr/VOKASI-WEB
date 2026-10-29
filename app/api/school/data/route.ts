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

function isAdmin(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

function wibRange(date: string): [number, number] {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) {
    throw new Error('Tanggal tidak valid.');
  }

  const start = Date.parse(date + 'T00:00:00+07:00');
  if (!Number.isFinite(start)) throw new Error('Tanggal tidak valid.');

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(start);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  if (`${values.year}-${values.month}-${values.day}` !== date) {
    throw new Error('Tanggal tidak valid.');
  }

  return [start, start + 86_400_000];
}

function normalizeAttempt(row: Record<string, unknown>) {
  return { ...row, completed_at_ms: Number(row.completed_at_ms) };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentNativeUser();
    if (!user) return json({ error: 'Sesi login tidak valid atau sudah berakhir.' }, 401);

    const kind = request.nextUrl.searchParams.get('kind') ?? '';
    const db = getDatabase();

    if (kind === 'own-attempts') {
      if (user.role !== 'student' || !user.profile) {
        return json({ error: 'Data ini hanya tersedia untuk akun siswa yang sedang masuk.' }, 403);
      }

      const rows = await db`
        SELECT *
        FROM public.student_attempts
        WHERE auth_user_id = ${user.id}::uuid
        ORDER BY completed_at_ms DESC, id DESC
      `;
      return json({ data: rows.map(row => normalizeAttempt(row as Record<string, unknown>)) });
    }

    if (!isAdmin(user.role)) {
      return json({ error: 'Akses administrator diperlukan.' }, 403);
    }

    if (kind === 'students') {
      const rows = await db`
        SELECT
          r.id::text AS id,
          r.auth_user_id::text AS auth_user_id,
          r.username,
          r.full_name,
          r.class_id::text AS class_id,
          COALESCE(r.major_id, c.major_id)::text AS major_id,
          r.registration_status,
          c.class_name,
          m.name AS major_name
        FROM public.student_roster AS r
        LEFT JOIN public.classes AS c ON c.id = r.class_id
        LEFT JOIN public.majors AS m ON m.id = COALESCE(r.major_id, c.major_id)
        ORDER BY r.full_name, r.id
      `;
      const data = rows.map(row => ({
        id: row.id,
        authId: row.auth_user_id ?? '',
        username: row.username ?? '',
        fullName: row.full_name,
        classId: row.class_id,
        className: row.class_name ?? 'Belum dipetakan',
        majorId: row.major_id ?? '',
        majorName: row.major_name ?? 'Belum dipetakan',
        registered: row.registration_status === 'registered' && Boolean(row.auth_user_id),
      }));
      return json({ data });
    }

    if (kind === 'classes' || kind === 'active-classes') {
      const rows = kind === 'active-classes'
        ? await db`
            SELECT id::text AS id, class_name, major_id::text AS major_id,
              grade_level, school_year, is_active
            FROM public.classes
            WHERE is_active = true
            ORDER BY class_name, grade_level, school_year
          `
        : await db`
            SELECT id::text AS id, class_name, major_id::text AS major_id,
              grade_level, school_year, is_active
            FROM public.classes
            ORDER BY class_name, grade_level, school_year
          `;
      return json({ data: rows });
    }

    if (kind === 'majors') {
      const rows = await db`
        SELECT id::text AS id, name, code
        FROM public.majors
        WHERE is_active = true
        ORDER BY name
      `;
      return json({ data: rows });
    }

    if (kind === 'catalog') {
      const [majors, classes] = await Promise.all([
        db`
          SELECT id::text AS id, name, code
          FROM public.majors
          WHERE is_active = true
          ORDER BY name
        `,
        db`
          SELECT id::text AS id, class_name, major_id::text AS major_id,
            grade_level, school_year
          FROM public.classes
          WHERE is_active = true
          ORDER BY class_name, grade_level, school_year
        `,
      ]);
      return json({ data: { majors, classes } });
    }

    if (kind === 'admin-attempts' || kind === 'admin-analytics-attempts') {
      const date = request.nextUrl.searchParams.get(kind === 'admin-attempts' ? 'date' : 'endDate') ?? '';
      const [start, end] = wibRange(date);

      if (kind === 'admin-attempts') {
        const rows = await db`
          SELECT *
          FROM public.vokasi_verified_attempts
          WHERE completed_at_ms >= ${start}
            AND completed_at_ms < ${end}
            AND practice_category IS NULL
          ORDER BY completed_at_ms DESC, id DESC
        `;
        return json({ data: rows.map(row => normalizeAttempt(row as Record<string, unknown>)) });
      }

      const daysRaw = request.nextUrl.searchParams.get('days') ?? '';
      const days = Number(daysRaw);
      if (!Number.isInteger(days) || days < 1 || days > 31) {
        return json({ error: 'Periode analitik harus 1 hingga 31 hari.' }, 400);
      }
      const lower = end - days * 86_400_000;
      const rows = await db`
        SELECT id::text AS id, auth_user_id::text AS auth_user_id, completed_at_ms, score
        FROM public.vokasi_verified_attempts
        WHERE completed_at_ms >= ${lower}
          AND completed_at_ms < ${end}
          AND practice_category IS NULL
        ORDER BY completed_at_ms DESC, id DESC
      `;
      return json({ data: rows.map(row => normalizeAttempt(row as Record<string, unknown>)) });
    }

    return json({ error: 'Jenis data tidak dikenali.' }, 400);
  } catch {
    return json({ error: 'Data sekolah tidak dapat dimuat saat ini.' }, 500);
  }
}
