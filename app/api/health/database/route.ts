import { NextResponse } from 'next/server';
import { getDatabase, isDatabaseConfigured } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store, max-age=0' };
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, service: 'database', status: 'not_configured' }, { status: 503, headers });
  }

  try {
    await getDatabase()`SELECT 1 AS ready`;
    return NextResponse.json({ ok: true, service: 'database', status: 'ready' }, { headers });
  } catch {
    // Deliberately do not return SQL errors, hostnames, or connection details to anonymous callers.
    return NextResponse.json({ ok: false, service: 'database', status: 'unavailable' }, { status: 503, headers });
  }
}
