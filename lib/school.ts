import { nativeRpc } from '@/lib/native-rpc';
import { supabase } from './supabase';
import type { Attempt, AttemptSummary, SchoolStudent, StudentProfile, LeaderboardEntry } from './types';

async function requestSchoolData<T>(params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch('/api/school/data?' + query, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: unknown };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Data sekolah tidak dapat dimuat.');
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'data')) {
    throw new Error('Respons server tidak valid.');
  }
  return payload.data as T;
}

export async function getStudent(authId: string): Promise<StudentProfile> {
  const response = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({})) as {
    user?: { id?: string; profile?: StudentProfile | null };
    error?: unknown;
  };
  if (!response.ok || payload.user?.id !== authId || !payload.user.profile) {
    throw new Error('Akun siswa tidak ditemukan atau sesi tidak valid.');
  }
  return payload.user.profile;
}

export async function getSchoolStudents(): Promise<SchoolStudent[]> {
  return requestSchoolData<SchoolStudent[]>({ kind: 'students' });
}

export type SchoolClassRow = {
  id: string;
  class_name: string;
  major_id: string;
  grade_level: number;
  school_year: string;
  is_active: boolean;
};

export async function getSchoolClasses(): Promise<SchoolClassRow[]> {
  return requestSchoolData<SchoolClassRow[]>({ kind: 'classes' });
}

export async function getActiveSchoolClasses(): Promise<SchoolClassRow[]> {
  return requestSchoolData<SchoolClassRow[]>({ kind: 'active-classes' });
}

export async function getActiveMajors(): Promise<{ id: string; name: string; code: string | null }[]> {
  return requestSchoolData<{ id: string; name: string; code: string | null }[]>({ kind: 'majors' });
}

export function wibDate(timestamp=Date.now()):string {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(timestamp);
  const obj=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${obj.year}-${obj.month}-${obj.day}`;
}
export function wibRange(date:string): [number,number] {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Tanggal tidak valid.');
  const start=Date.parse(date+'T00:00:00+07:00');
  if(!Number.isFinite(start) || wibDate(start)!==date) throw new Error('Tanggal tidak valid.');
  return [start,start+86400000];
}
export async function getAdminAttempts(date:string):Promise<Attempt[]> {
  wibRange(date);
  return requestSchoolData<Attempt[]>({kind:'admin-attempts',date});
}
/** Minimal columns for school analytics: only compulsory sessions, no answer keys or review payload. */
export async function getAdminAnalyticsAttempts(endDate:string,days:number):Promise<AttemptSummary[]> {
  if(!Number.isInteger(days)||days<1||days>31)throw new Error('Periode analitik harus 1 hingga 31 hari.');
  wibRange(endDate);
  return requestSchoolData<AttemptSummary[]>({kind:'admin-analytics-attempts',endDate,days:String(days)});
}
export async function getOwnAttempts(authId:string): Promise<Attempt[]> {
  if(!authId)throw new Error('Sesi siswa tidak valid.');
  // The server derives the student ID from the HttpOnly session; it never trusts a client-supplied user ID.
  return requestSchoolData<Attempt[]>({kind:'own-attempts'});
}
/**
 * Official mandatory score is the FIRST server-verified completion of each WIB day.
 * Repeats remain accessible in History but must not change dashboard averages.
 * The database leaderboard applies the same first-per-day rule.
 */
export function officialMandatoryAttempts(attempts:Attempt[]):Attempt[]{
  const firstByDay=new Map<string,Attempt>();
  const eligible=attempts
    .filter(a=>a.practice_category===null&&a.question_count===100&&
      a.signature.startsWith('WEB-SERVER-v1:'))
    .sort((a,b)=>a.completed_at_ms-b.completed_at_ms||
      a.session_key.localeCompare(b.session_key));
  for(const attempt of eligible){
    const day=wibDate(attempt.completed_at_ms);
    if(!firstByDay.has(day))firstByDay.set(day,attempt);
  }
  return [...firstByDay.values()].sort((a,b)=>b.completed_at_ms-a.completed_at_ms);
}

export async function getLeaderboard():Promise<LeaderboardEntry[]> {
  const {data,error}=await nativeRpc('vokasi_school_leaderboard');
  if(error) throw error;
  // Urutan RPC bisa berbasis XP. Peringkat akademik web wajib berbasis nilai.
  // Tanpa hasil wajib terverifikasi, siswa tidak diberi posisi peringkat.
  return ((data || []) as LeaderboardEntry[])
    .filter(row => row.mandatory_days > 0 && typeof row.mandatory_average === 'number' && Number.isFinite(row.mandatory_average))
    .sort((a,b) => (b.mandatory_average ?? 0) - (a.mandatory_average ?? 0)
      || b.mandatory_days - a.mandatory_days
      || a.display_name.localeCompare(b.display_name, 'id'));
}
// Past compulsory sessions predate web-server score verification.
// Never mix this provisional archive with the verified official leaderboard.
export async function getHistoricalLeaderboard():Promise<LeaderboardEntry[]> {
  const {data,error}=await nativeRpc('vokasi_school_legacy_leaderboard');
  if(error)throw error;
  return ((data||[]) as Pick<LeaderboardEntry,'username'|'display_name'|'major'|'classroom'|'mandatory_average'|'mandatory_days'>[])
    .filter(row=>row.mandatory_days>0&&typeof row.mandatory_average==='number'&&Number.isFinite(row.mandatory_average))
    .map(row=>({...row,season_xp:0,lifetime_xp:0,streak:0}))
    .sort((a,b)=>(b.mandatory_average??0)-(a.mandatory_average??0)
      || b.mandatory_days-a.mandatory_days
      || a.display_name.localeCompare(b.display_name,'id'));
}

export function latestGrades(attempts:Attempt[], students:SchoolStudent[]): Map<string,Attempt> {
  const map=new Map<string,Attempt>();
  const userByAlias=new Map(students.filter(s=>s.username).map(s=>[s.username.trim().toLowerCase(),s.authId]));
  // For a date-scoped admin report, the earliest verified attempt is the official grade.
  for(const attempt of [...attempts].sort((a,b)=>a.completed_at_ms-b.completed_at_ms||
    a.session_key.localeCompare(b.session_key))) {
    const key=attempt.auth_user_id || userByAlias.get(attempt.username.trim().toLowerCase());
    if(key && !map.has(key)) map.set(key,attempt);
  }
  return map;
}

/** Shared, retry-safe directory for the school-data management page. */
export async function getAdminSchoolCatalog(): Promise<{
  majors: {id:string; name:string; code:string|null}[];
  classes: {id:string; class_name:string; major_id:string; grade_level:number; school_year:string}[];
}> {
  return requestSchoolData({
    kind: 'catalog',
  });
}
