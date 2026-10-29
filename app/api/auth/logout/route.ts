import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest, revokeCurrentNativeSession } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
  try {
    await revokeCurrentNativeSession();
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ error: 'Sesi tidak dapat dicabut dari database.' }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
