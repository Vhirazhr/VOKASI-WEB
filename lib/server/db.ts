import 'server-only';
import postgres from 'postgres';

type DatabaseClient = ReturnType<typeof postgres>;

const globalForDatabase = globalThis as typeof globalThis & {
  __vokasiDatabase?: DatabaseClient;
};

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDatabase(): DatabaseClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured.');
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres:// or postgresql:// scheme.');
  }

  const sslMode = (process.env.DATABASE_SSL ?? 'disable').trim().toLowerCase();
  if (sslMode !== 'disable' && sslMode !== 'require') {
    throw new Error('DATABASE_SSL must be either "disable" or "require".');
  }

  if (!globalForDatabase.__vokasiDatabase) {
    const requestedPoolSize = Number.parseInt(process.env.DATABASE_POOL_MAX ?? '5', 10);
    const max = Number.isFinite(requestedPoolSize)
      ? Math.min(10, Math.max(1, requestedPoolSize))
      : 5;

    globalForDatabase.__vokasiDatabase = postgres(connectionString, {
      max,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: sslMode === 'require' ? 'require' : false,
    });
  }

  return globalForDatabase.__vokasiDatabase;
}
