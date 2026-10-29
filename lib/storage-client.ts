export type StorageBucket = 'vokasi-question-figures' | 'vokasi-avatars';

export function storageUrl(bucket: StorageBucket, objectPath: string, sessionId?: string): string {
  const query = new URLSearchParams({ bucket, path: objectPath });
  if (sessionId) query.set('sessionId', sessionId);
  return '/api/storage/file?' + query.toString();
}

export async function uploadStorageFile(
  bucket: StorageBucket,
  objectPath: string,
  file: File,
): Promise<{ bucket: StorageBucket; path: string; url: string }> {
  const form = new FormData();
  form.set('bucket', bucket);
  form.set('path', objectPath);
  form.set('file', file, file.name);

  const response = await fetch('/api/storage/upload', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    body: form,
  });
  const payload = await response.json().catch(() => ({})) as {
    data?: { bucket: StorageBucket; path: string; url: string };
    error?: unknown;
  };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Berkas tidak berhasil diunggah.');
  }
  if (!payload.data?.url) throw new Error('Respons unggahan tidak valid.');
  return payload.data;
}

export async function deleteStorageFiles(bucket: StorageBucket, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const response = await fetch('/api/storage/delete', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket, paths }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Berkas sementara tidak dapat dibersihkan.');
  }
}
