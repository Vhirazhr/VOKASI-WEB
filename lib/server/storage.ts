import 'server-only';
import { isAbsolute, resolve, sep } from 'node:path';

export type StorageBucket = 'vokasi-question-figures' | 'vokasi-avatars';

export function isStorageBucket(value: string): value is StorageBucket {
  return value === 'vokasi-question-figures' || value === 'vokasi-avatars';
}

export function normalizeStorageObjectPath(value: string): string | null {
  if (!value || value.length > 512 || value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    return null;
  }
  const segments = value.split('/');
  if (segments.length < 2 || segments.some(segment =>
    !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]{1,128}$/.test(segment)
  )) return null;
  return segments.join('/');
}

export function resolveStorageObjectPath(bucket: StorageBucket, objectPath: string): string {
  const configuredRoot = process.env.STORAGE_ROOT?.trim() ?? '';
  if (!configuredRoot || !isAbsolute(configuredRoot)) {
    throw new Error('STORAGE_ROOT must be configured as an absolute private directory.');
  }

  const root = resolve(configuredRoot);
  const target = resolve(root, bucket, ...objectPath.split('/'));
  if (!target.startsWith(root + sep)) {
    throw new Error('Storage path is outside the configured root.');
  }
  return target;
}
