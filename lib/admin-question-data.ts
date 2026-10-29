export type QuestionDraftRow = {
  id: string;
  source_number: number | null;
  category: string;
  difficulty_code: string | null;
  question: string;
  question_image_path: string | null;
  options: { text: string; image_path: string | null }[];
  correct_index: number;
  time_limit_seconds: number;
  explanation: string;
  created_at: string;
};

export type ImportDraftRow<T = unknown> = {
  id: string;
  file_name: string;
  mode: 'append' | 'replace';
  payload: T;
  created_at: string;
};

export type ZipDraftRow = {
  source_number: number;
  question: string;
  time_limit_seconds: number;
  difficulty_code: string | null;
};

async function readData<T>(kind: string): Promise<T> {
  const response = await fetch('/api/admin/question-data?kind=' + encodeURIComponent(kind), {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: unknown };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Data bank soal tidak dapat dimuat.');
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'data')) throw new Error('Respons server tidak valid.');
  return payload.data as T;
}

async function writeData<T>(action: string, values: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/admin/question-data', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ action, ...values }),
  });
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: unknown };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Perubahan bank soal tidak berhasil disimpan.');
  }
  return payload.data as T;
}

export function getQuestionDrafts(): Promise<QuestionDraftRow[]> {
  return readData<QuestionDraftRow[]>('question-drafts');
}

export function getImportDrafts<T = unknown>(): Promise<ImportDraftRow<T>[]> {
  return readData<ImportDraftRow<T>[]>('import-drafts');
}

export function getPublishedQuestionCount(): Promise<number> {
  return readData<number>('published-count');
}

export function getZipDrafts(): Promise<ZipDraftRow[]> {
  return readData<ZipDraftRow[]>('zip-drafts');
}

export async function saveQuestionDraft<T extends object>(id: string | null, values: T): Promise<string> {
  const result = await writeData<{ id: string }>('save-question-draft', { id, values });
  return result.id;
}

export async function deleteQuestionDraft(id: string): Promise<void> {
  await writeData<{ deleted: boolean }>('delete-question-draft', { id });
}

export async function insertQuestionDraftBatch(rows: unknown[]): Promise<number> {
  const result = await writeData<{ inserted: number }>('bulk-insert-question-drafts', { rows });
  return result.inserted;
}

export async function updateDraftTimers(group: string, numbers: number[], seconds: number): Promise<number> {
  const result = await writeData<{ updated: number }>('update-draft-timers', { group, numbers, seconds });
  return result.updated;
}

export async function saveImportDraft<T extends object>(id: string | null, values: T): Promise<string> {
  const result = await writeData<{ id: string }>('save-import-draft', { id, values });
  return result.id;
}

export async function deleteImportDraft(id: string): Promise<void> {
  await writeData<{ deleted: boolean }>('delete-import-draft', { id });
}
