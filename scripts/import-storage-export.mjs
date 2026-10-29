import { constants } from 'node:fs';
import { copyFile, link, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const BUCKETS = new Set(['vokasi-question-figures', 'vokasi-avatars']);
const MIME_BY_EXTENSION = new Map([
  ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'],
]);
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const sourceArg = args.find(arg => !arg.startsWith('--'));
if (!sourceArg) {
  console.error('Usage: node scripts/import-storage-export.mjs <export-root> [--apply]');
  console.error('Default mode is dry-run. Add --apply only after reviewing the dry-run report.');
  process.exit(2);
}

const sourceRoot = resolve(sourceArg);
const storageValue = process.env.STORAGE_ROOT?.trim() ?? '';
const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
if (!storageValue || !isAbsolute(storageValue)) throw new Error('STORAGE_ROOT must be an absolute private directory.');
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const storageRoot = resolve(storageValue);
const sourceInfo = await stat(sourceRoot).catch(() => null);
if (!sourceInfo?.isDirectory()) throw new Error('Export root directory does not exist.');
if (sourceRoot === storageRoot || sourceRoot.startsWith(storageRoot + sep)) {
  throw new Error('The export directory must be outside STORAGE_ROOT.');
}

function normalizeObjectPath(value) {
  if (!value || value.length > 512 || value.startsWith('/') || value.includes('\\') || value.includes('\0')) return null;
  const parts = value.split('/');
  if (parts.length < 2 || parts.some(part => !part || part === '.' || part === '..' || !/^[A-Za-z0-9._-]{1,128}$/.test(part))) return null;
  return parts.join('/');
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in the export: ' + absolute);
    if (entry.isDirectory()) found.push(...await walk(absolute));
    else if (entry.isFile()) found.push(absolute);
  }
  return found;
}

function mimeFor(filePath) {
  const extension = basename(filePath).split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION.get(extension) ?? null;
}

const sslMode = (process.env.DATABASE_SSL ?? 'disable').toLowerCase();
const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ssl: sslMode === 'require' ? 'require' : false,
  connect_timeout: 10,
});

try {
  const plan = [];
  for (const bucket of BUCKETS) {
    const bucketRoot = resolve(sourceRoot, bucket);
    let files = [];
    try { files = await walk(bucketRoot); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
    for (const sourcePath of files) {
      const objectPath = normalizeObjectPath(relative(bucketRoot, sourcePath).split(sep).join('/'));
      if (!objectPath) throw new Error('Unsafe object path in export: ' + sourcePath);
      const mime = mimeFor(sourcePath);
      if (!mime) throw new Error('Unsupported image type: ' + sourcePath);
      const info = await stat(sourcePath);
      const maxBytes = bucket === 'vokasi-avatars' ? 1024 * 1024 : 3 * 1024 * 1024;
      if (info.size < 1 || info.size > maxBytes) throw new Error('File size outside allowed limit: ' + sourcePath);
      if (bucket === 'vokasi-avatars' && (objectPath.split('/').length !== 2 || objectPath.split('/')[1] !== 'avatar.jpg' || mime !== 'image/jpeg')) {
        throw new Error('Avatar export path must be username/avatar.jpg: ' + sourcePath);
      }
      plan.push({ bucket, objectPath, sourcePath, mime, size: info.size });
    }
  }

  if (!plan.length) throw new Error('No supported image files found in the export root.');
  const report = { mode: apply ? 'apply' : 'dry-run', discovered: plan.length, imported: 0, skipped: 0, objects: [] };
  for (const item of plan) {
    const existing = await sql`
      SELECT id FROM storage.objects
      WHERE bucket_id = ${item.bucket} AND name = ${item.objectPath}
      LIMIT 1
    `;
    const destination = resolve(storageRoot, item.bucket, ...item.objectPath.split('/'));
    const destinationExists = await stat(destination).then(() => true).catch(() => false);
    if (existing.length || destinationExists) {
      report.skipped += 1;
      report.objects.push({ bucket: item.bucket, path: item.objectPath, status: 'skipped-existing' });
      continue;
    }

    if (!apply) {
      report.objects.push({ bucket: item.bucket, path: item.objectPath, size: item.size, status: 'would-import' });
      continue;
    }

    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const temporary = destination + '.tmp-' + randomUUID();
    try {
      await copyFile(item.sourcePath, temporary, constants.COPYFILE_EXCL);
      await link(temporary, destination);
      await rm(temporary, { force: true });
      try {
        await sql`
          INSERT INTO storage.objects
            (bucket_id, name, owner_id, metadata, mimetype, size_bytes, updated_at)
          VALUES (
            ${item.bucket}, ${item.objectPath}, NULL,
            jsonb_build_object('migrated_from', 'local-supabase-export'),
            ${item.mime}, ${item.size}, now()
          )
        `;
      } catch (error) {
        await rm(destination, { force: true }).catch(() => undefined);
        throw error;
      }
      report.imported += 1;
      report.objects.push({ bucket: item.bucket, path: item.objectPath, size: item.size, status: 'imported' });
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (!apply) console.log('\nDry run only. Re-run with --apply after checking the report and backing up the target.');
} finally {
  await sql.end({ timeout: 5 });
}
