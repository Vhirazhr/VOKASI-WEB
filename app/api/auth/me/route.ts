import { NextResponse } from 'next/server';
import { getCurrentNativeUser } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentNativeUser();
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }
    return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ error: 'Layanan autentikasi belum siap.' }, { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
