import 'server-only';
import { isAbsolute, resolve, sep } from 'node:path';

export type StorageBucket = 'vokasi-question-figures' | 'vokasi-avatars';

export function isStorageBucket(value: string): value is StorageBucket {
  return value === 'vokasi-question-figures' || value === 'vokasi-avatars';
}

export function hasSupportedImageSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  }
  if (mime === 'image/webp') {
    return bytes.length >= 12
      && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return false;
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
