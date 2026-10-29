import { NextRequest, NextResponse } from 'next/server';
import { getCurrentNativeUser, isSameOriginRequest } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUPS = new Set(['HITUNG_DASAR','HITUNG_MENENGAH','HITUNG_LANJUT','NUMERASI_CAMPURAN','FISIKA_DASAR','LOGIKA','POLA_GAMBAR']);
const GROUP_SECONDS: Record<string, number> = {
  HITUNG_DASAR: 15, HITUNG_MENENGAH: 18, HITUNG_LANJUT: 25,
  NUMERASI_CAMPURAN: 20, FISIKA_DASAR: 20, LOGIKA: 20, POLA_GAMBAR: 25,
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

function adminRole(role: string) {
  return role === 'admin' || role === 'super_admin';
}

function draftValues(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Data draft tidak valid.');
  const value = input as Record<string, unknown>;
  const sourceNumber = value.source_number == null ? null : Number(value.source_number);
  const category = typeof value.category === 'string' ? value.category.trim() : '';
  const difficultyCode = typeof value.difficulty_code === 'string' && value.difficulty_code.trim()
    ? value.difficulty_code.trim() : null;
  const question = typeof value.question === 'string' ? value.question.trim() : '';
  const questionImagePath = value.question_image_path == null || value.question_image_path === ''
    ? null : String(value.question_image_path);
  const options = value.options;
  const correctIndex = Number(value.correct_index);
  const seconds = Number(value.time_limit_seconds);
  const explanation = typeof value.explanation === 'string' ? value.explanation : '';

  if (sourceNumber !== null && (!Number.isInteger(sourceNumber) || sourceNumber < 1)) throw new Error('Nomor soal tidak valid.');
  if (!category || category.length > 120) throw new Error('Kategori soal tidak valid.');
  if (difficultyCode !== null && !GROUPS.has(difficultyCode)) throw new Error('Kelompok kesulitan tidak valid.');
  if (question.length > 12000 || explanation.length > 12000) throw new Error('Teks soal atau pembahasan terlalu panjang.');
  if (questionImagePath !== null && (questionImagePath.length > 512 || questionImagePath.startsWith('/') || questionImagePath.includes('..'))) {
    throw new Error('Path gambar soal tidak valid.');
  }
  if (!Array.isArray(options) || options.length < 2 || options.length > 6) throw new Error('Soal harus memiliki 2–6 pilihan.');
  const cleanOptions = options.map((option) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) throw new Error('Format pilihan soal tidak valid.');
    const row = option as Record<string, unknown>;
    const text = typeof row.text === 'string' ? row.text : '';
    const imagePath = row.image_path == null || row.image_path === '' ? null : String(row.image_path);
    if (text.length > 4000 || (imagePath !== null && (imagePath.length > 512 || imagePath.startsWith('/') || imagePath.includes('..')))) {
      throw new Error('Teks atau gambar pilihan tidak valid.');
    }
    return { text, image_path: imagePath };
  });
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= cleanOptions.length) {
    throw new Error('Kunci jawaban tidak valid.');
  }
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 300) throw new Error('Timer soal tidak valid.');
  return {
    source_number: sourceNumber,
    category,
    difficulty_code: difficultyCode,
    question,
    question_image_path: questionImagePath,
    options: cleanOptions,
    correct_index: correctIndex,
    time_limit_seconds: seconds,
    explanation,
  };
}

async function readBody(request: NextRequest) {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 12 * 1024 * 1024) throw new Error('Ukuran data melebihi batas.');
  return await request.json() as Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentNativeUser().catch(() => null);
  if (!user) return json({ error: 'Sesi login tidak valid atau sudah berakhir.' }, 401);
  if (!adminRole(user.role)) return json({ error: 'Akses administrator diperlukan.' }, 403);

  try {
    const db = getDatabase();
    const kind = request.nextUrl.searchParams.get('kind') ?? '';
    if (kind === 'question-drafts') {
      const rows = await db`
        SELECT id::text AS id, source_number, category, difficulty_code, question,
          question_image_path, options, correct_index, time_limit_seconds, explanation, created_at
        FROM public.vokasi_question_drafts
        ORDER BY created_at DESC
        LIMIT 1000
      `;
      return json({ data: rows });
    }
    if (kind === 'import-drafts') {
      const rows = await db`
        SELECT id::text AS id, file_name, mode, payload, created_at
        FROM public.vokasi_web_import_drafts
        WHERE owner_id = ${user.id}::uuid
        ORDER BY created_at DESC
        LIMIT 30
      `;
      return json({ data: rows });
    }
    if (kind === 'published-count') {
      const rows = await db`SELECT count(*)::int AS count FROM public.vokasi_web_published_questions`;
      return json({ data: Number(rows[0]?.count ?? 0) });
    }
    if (kind === 'zip-drafts') {
      const rows = await db`
        SELECT source_number, question, time_limit_seconds, difficulty_code
        FROM public.vokasi_question_drafts
        WHERE source_number IS NOT NULL
        ORDER BY source_number
        LIMIT 5000
      `;
      return json({ data: rows });
    }
    return json({ error: 'Jenis data draft tidak dikenali.' }, 400);
  } catch {
    return json({ error: 'Data bank soal tidak dapat dimuat saat ini.' }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return json({ error: 'Permintaan tidak diizinkan.' }, 403);
  const user = await getCurrentNativeUser().catch(() => null);
  if (!user) return json({ error: 'Sesi login tidak valid atau sudah berakhir.' }, 401);
  if (!adminRole(user.role)) return json({ error: 'Akses administrator diperlukan.' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Data permintaan tidak valid.' }, 400);
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const db = getDatabase();
  try {
    if (action === 'save-question-draft') {
      const values = draftValues(body.values);
      const id = body.id == null || body.id === '' ? null : String(body.id);
      if (id && !UUID.test(id)) return json({ error: 'ID draft tidak valid.' }, 400);
      if (id) {
        const rows = await db`
          UPDATE public.vokasi_question_drafts SET
            source_number = ${values.source_number},
            category = ${values.category},
            difficulty_code = ${values.difficulty_code},
            question = ${values.question},
            question_image_path = ${values.question_image_path},
            options = ${JSON.stringify(values.options)}::jsonb,
            correct_index = ${values.correct_index},
            time_limit_seconds = ${values.time_limit_seconds},
            explanation = ${values.explanation},
            updated_at = now()
          WHERE id = ${id}::uuid
          RETURNING id::text AS id
        `;
        if (!rows.length) return json({ error: 'Draft soal tidak ditemukan.' }, 404);
        return json({ data: { id: rows[0].id } });
      }
      const rows = await db`
        INSERT INTO public.vokasi_question_drafts
          (source_number, category, difficulty_code, question, question_image_path, options,
           correct_index, time_limit_seconds, explanation, created_by)
        VALUES (
          ${values.source_number}, ${values.category}, ${values.difficulty_code},
          ${values.question}, ${values.question_image_path}, ${JSON.stringify(values.options)}::jsonb,
          ${values.correct_index}, ${values.time_limit_seconds}, ${values.explanation}, ${user.id}::uuid
        )
        RETURNING id::text AS id
      `;
      return json({ data: { id: rows[0].id } }, 201);
    }

    if (action === 'delete-question-draft') {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!UUID.test(id)) return json({ error: 'ID draft tidak valid.' }, 400);
      const rows = await db`DELETE FROM public.vokasi_question_drafts WHERE id = ${id}::uuid RETURNING id`;
      if (!rows.length) return json({ error: 'Draft soal tidak ditemukan.' }, 404);
      return json({ data: { deleted: true } });
    }

    if (action === 'bulk-insert-question-drafts') {
      if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 200) {
        return json({ error: 'Batch impor harus berisi 1–200 soal.' }, 400);
      }
      const values = body.rows.map(draftValues);
      await db.begin(async tx => {
        for (const row of values) {
          await tx`
            INSERT INTO public.vokasi_question_drafts
              (source_number, category, difficulty_code, question, question_image_path, options,
               correct_index, time_limit_seconds, explanation, created_by)
            VALUES (
              ${row.source_number}, ${row.category}, ${row.difficulty_code}, ${row.question},
              ${row.question_image_path}, ${JSON.stringify(row.options)}::jsonb,
              ${row.correct_index}, ${row.time_limit_seconds}, ${row.explanation}, ${user.id}::uuid
            )
          `;
        }
      });
      return json({ data: { inserted: values.length } }, 201);
    }

    if (action === 'update-draft-timers') {
      const group = typeof body.group === 'string' ? body.group : '';
      const numbers = Array.isArray(body.numbers) ? body.numbers.map(Number) : [];
      const seconds = Number(body.seconds);
      if (!GROUPS.has(group) || GROUP_SECONDS[group] !== seconds
          || !numbers.length || numbers.length > 5000
          || numbers.some(number => !Number.isInteger(number) || number < 1)) {
        return json({ error: 'Kelompok, timer, atau nomor soal tidak valid.' }, 400);
      }
      await db.begin(async tx => {
        for (const sourceNumber of [...new Set(numbers)]) {
          await tx`
            UPDATE public.vokasi_question_drafts
            SET difficulty_code = ${group}, time_limit_seconds = ${seconds}, updated_at = now()
            WHERE source_number = ${sourceNumber}
          `;
        }
      });
      return json({ data: { updated: numbers.length } });
    }

    if (action === 'save-import-draft') {
      const values = body.values && typeof body.values === 'object' && !Array.isArray(body.values)
        ? body.values as Record<string, unknown> : {};
      const fileName = typeof values.file_name === 'string' ? values.file_name.trim().slice(0, 255) : '';
      const mode = values.mode;
      const payload = values.payload;
      if (!fileName || (mode !== 'append' && mode !== 'replace')
          || !Array.isArray(payload) || payload.length > 2000) {
        return json({ error: 'Draft impor tidak valid.' }, 400);
      }
      const id = body.id == null || body.id === '' ? null : String(body.id);
      if (id && !UUID.test(id)) return json({ error: 'ID draft impor tidak valid.' }, 400);
      if (id) {
        const rows = await db`
          UPDATE public.vokasi_web_import_drafts
          SET file_name = ${fileName}, mode = ${mode}, payload = ${JSON.stringify(payload)}::jsonb
          WHERE id = ${id}::uuid AND owner_id = ${user.id}::uuid
          RETURNING id::text AS id
        `;
        if (!rows.length) return json({ error: 'Draft impor tidak ditemukan atau bukan milik akun ini.' }, 404);
        return json({ data: { id: rows[0].id } });
      }
      const rows = await db`
        INSERT INTO public.vokasi_web_import_drafts (owner_id, file_name, mode, payload)
        VALUES (${user.id}::uuid, ${fileName}, ${mode}, ${JSON.stringify(payload)}::jsonb)
        RETURNING id::text AS id
      `;
      return json({ data: { id: rows[0].id } }, 201);
    }

    if (action === 'delete-import-draft') {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!UUID.test(id)) return json({ error: 'ID draft impor tidak valid.' }, 400);
      const rows = await db`
        DELETE FROM public.vokasi_web_import_drafts
        WHERE id = ${id}::uuid AND owner_id = ${user.id}::uuid
        RETURNING id
      `;
      if (!rows.length) return json({ error: 'Draft impor tidak ditemukan atau bukan milik akun ini.' }, 404);
      return json({ data: { deleted: true } });
    }

    return json({ error: 'Aksi draft tidak dikenali.' }, 400);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return json({ error: 'Nomor soal atau draft dengan data tersebut sudah ada.' }, 409);
    }
    return json({ error: 'Perubahan bank soal tidak berhasil disimpan.' }, 500);
  }
}
