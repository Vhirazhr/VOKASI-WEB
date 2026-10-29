import { randomUUID } from 'node:crypto';
import { link, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentNativeUser, isSameOriginRequest } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/db';
import { hasSupportedImageSignature, isStorageBucket, normalizeStorageObjectPath, resolveStorageObjectPath } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

const extensionMime: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return json({ error: 'Permintaan tidak diizinkan.' }, 403);

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 3_500_000) {
    return json({ error: 'Ukuran unggahan melebihi batas.' }, 413);
  }

  const user = await getCurrentNativeUser().catch(() => null);
  if (!user) return json({ error: 'Sesi login tidak valid atau sudah berakhir.' }, 401);
  if (!process.env.STORAGE_ROOT?.trim()) {
    return json({ error: 'Penyimpanan berkas lokal belum dikonfigurasi oleh administrator hosting.' }, 503);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Format unggahan tidak valid.' }, 400);
  }

  const bucketValue = form.get('bucket');
  const pathValue = form.get('path');
  const fileValue = form.get('file');
  if (typeof bucketValue !== 'string' || !isStorageBucket(bucketValue)
      || typeof pathValue !== 'string' || !(fileValue instanceof File)) {
    return json({ error: 'Bucket, path, atau file tidak valid.' }, 400);
  }

  const objectPath = normalizeStorageObjectPath(pathValue);
  if (!objectPath) return json({ error: 'Path berkas tidak valid.' }, 400);

  const bucket = bucketValue;
  if (bucket === 'vokasi-question-figures') {
    if ((user.role !== 'admin' && user.role !== 'super_admin') || !objectPath.startsWith(user.id + '/')) {
      return json({ error: 'Hanya administrator yang dapat mengunggah gambar soal ke ruang miliknya.' }, 403);
    }
  } else {
    if (user.role !== 'student' || !user.profile || objectPath !== user.profile.username + '/avatar.jpg') {
      return json({ error: 'Siswa hanya dapat memperbarui foto profilnya sendiri.' }, 403);
    }
  }

  const mime = fileValue.type.toLowerCase();
  const extension = objectPath.split('.').pop()?.toLowerCase() ?? '';
  if (!extensionMime[extension] || extensionMime[extension] !== mime) {
    return json({ error: 'Ekstensi berkas tidak sesuai dengan tipe gambar.' }, 415);
  }
  if (bucket === 'vokasi-avatars' && mime !== 'image/jpeg') {
    return json({ error: 'Foto profil harus JPG atau JPEG.' }, 415);
  }

  const maxBytes = bucket === 'vokasi-avatars' ? 1024 * 1024 : 3 * 1024 * 1024;
  if (fileValue.size < 1 || fileValue.size > maxBytes) {
    return json({ error: bucket === 'vokasi-avatars' ? 'Ukuran foto maksimal 1 MB.' : 'Ukuran gambar soal maksimal 3 MB.' }, 413);
  }

  const db = getDatabase();
  const existing = await db`
    SELECT owner_id::text AS owner_id
    FROM storage.objects
    WHERE bucket_id = ${bucket} AND name = ${objectPath}
    LIMIT 1
  `;
  if (bucket === 'vokasi-question-figures' && existing.length) {
    return json({ error: 'Gambar soal dengan nama tersebut sudah ada. Gunakan nama baru.' }, 409);
  }
  if (existing[0]?.owner_id && existing[0].owner_id !== user.id) {
    return json({ error: 'Berkas dengan path tersebut dimiliki akun lain.' }, 403);
  }

  let finalPath: string;
  try {
    finalPath = resolveStorageObjectPath(bucket, objectPath);
  } catch {
    return json({ error: 'Direktori penyimpanan belum dikonfigurasi dengan benar.' }, 503);
  }

  const tempPath = finalPath + '.tmp-' + randomUUID();
  let createdFigure = false;
  try {
    const bytes = Buffer.from(await fileValue.arrayBuffer());
    if (bytes.length !== fileValue.size || !hasSupportedImageSignature(bytes, mime)) {
      return json({ error: 'Isi file tidak sesuai dengan format gambar yang dipilih.' }, 415);
    }
    await mkdir(dirname(finalPath), { recursive: true, mode: 0o700 });
    await writeFile(tempPath, bytes, { flag: 'wx', mode: 0o600 });
    if (bucket === 'vokasi-question-figures') {
      await link(tempPath, finalPath);
      createdFigure = true;
      await rm(tempPath, { force: true });
    } else {
      await rename(tempPath, finalPath);
    }

    await db.begin(async tx => {
      const saved = await tx`
        INSERT INTO storage.objects
          (bucket_id, name, owner_id, metadata, mimetype, size_bytes, updated_at)
        VALUES (
          ${bucket}, ${objectPath}, ${user.id}::uuid,
          jsonb_build_object('original_name', ${fileValue.name.slice(0, 120)}),
          ${mime}, ${fileValue.size}, now()
        )
        ON CONFLICT (bucket_id, name) DO UPDATE SET
          owner_id = EXCLUDED.owner_id,
          metadata = EXCLUDED.metadata,
          mimetype = EXCLUDED.mimetype,
          size_bytes = EXCLUDED.size_bytes,
          updated_at = now()
        WHERE ${bucket} = 'vokasi-avatars'
          AND (storage.objects.owner_id IS NULL OR storage.objects.owner_id = EXCLUDED.owner_id)
        RETURNING id
      `;
      if (!saved.length) throw new Error('STORAGE_COLLISION');

      if (bucket === 'vokasi-avatars') {
        await tx`
          INSERT INTO public.student_profiles (user_id, avatar_path, updated_at)
          VALUES (${user.id}::uuid, ${objectPath}, now())
          ON CONFLICT (user_id) DO UPDATE SET
            avatar_path = EXCLUDED.avatar_path,
            updated_at = now()
        `;
      }
    });

    const query = new URLSearchParams({ bucket, path: objectPath });
    return json({ data: { bucket, path: objectPath, url: '/api/storage/file?' + query.toString() } });
  } catch (error) {
    if (createdFigure) await rm(finalPath, { force: true }).catch(() => undefined);
    await rm(tempPath, { force: true }).catch(() => undefined);
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'EEXIST' || code === '23505' || (error instanceof Error && error.message === 'STORAGE_COLLISION')) {
      return json({ error: 'Berkas dengan nama tersebut sudah ada. Gunakan nama baru.' }, 409);
    }
    return json({ error: 'Berkas tidak berhasil disimpan.' }, 500);
  }
}
