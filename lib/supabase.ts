import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let singleton: SupabaseClient | null = null;
export function configured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  return /^https:\/\/.+\.supabase\.co$/.test(url) && key.length > 20 && !key.includes('YOUR_');
}
export function supabase(): SupabaseClient {
  if (!configured()) throw new Error('Koneksi Supabase belum dikonfigurasi. Isi .env.local terlebih dahulu.');
  if (!singleton) singleton = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return singleton;
}
