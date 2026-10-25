import { supabase } from './supabase';
import type { Attempt, RosterRow, SchoolStudent, StudentProfile, LeaderboardEntry } from './types';

const BATCH = 500;
type RowQuery = {
  equals?: { column: string; value: string };
  lowerBound?: { column: string; value: number };
  upperBound?: { column: string; value: number };
  nullColumn?: string;
  order?: { column: string; ascending?: boolean }[];
};
async function allRows<T>(table: string, select: string, options: RowQuery = {}): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += BATCH) {
    let q = supabase().from(table).select(select);
    if (options.equals) q = q.eq(options.equals.column, options.equals.value);
    if (options.lowerBound) q = q.gte(options.lowerBound.column, options.lowerBound.value);
    if (options.upperBound) q = q.lt(options.upperBound.column, options.upperBound.value);
    if (options.nullColumn) q = q.is(options.nullColumn, null);
    for (const order of options.order || [{column:'id',ascending:true}]) {
      q = q.order(order.column, {ascending:order.ascending!==false});
    }
    const {data,error} = await q.range(from, from + BATCH - 1);
    if (error) throw error;
    const batch = (data || []) as T[];
    rows.push(...batch);
    if (batch.length < BATCH) break;
  }
  return rows;
}
export async function getStudent(authId: string): Promise<StudentProfile> {
  const db = supabase();
  const {data:row,error} = await db.from('student_roster')
    .select('auth_user_id,username,full_name,class_id,major_id,registration_status')
    .eq('auth_user_id', authId).eq('registration_status','registered').single();
  if (error || !row) throw new Error('Akun siswa tidak ditemukan di daftar sekolah.');
  const {data:classRow,error:classErr} = await db.from('classes').select('class_name,major_id').eq('id',row.class_id).single();
  if (classErr || !classRow) throw new Error('Data kelas siswa tidak ditemukan.');
  const {data:major,error:majorErr} = await db.from('majors').select('name').eq('id',row.major_id || classRow.major_id).single();
  if (majorErr || !major) throw new Error('Data jurusan siswa tidak ditemukan.');
  return {authId,username:row.username,fullName:row.full_name,classId:row.class_id,className:classRow.class_name,
    majorId:row.major_id||classRow.major_id,majorName:major.name};
}
export async function getSchoolStudents(): Promise<SchoolStudent[]> {
  const [roster, classes, majors] = await Promise.all([
    allRows<RosterRow>('student_roster','id,auth_user_id,username,full_name,class_id,major_id,registration_status'),
    allRows<{id:string;class_name:string;major_id:string}>('classes','id,class_name,major_id'),
    allRows<{id:string;name:string}>('majors','id,name')
  ]);
  const classMap = new Map(classes.map(r=>[r.id,r])); const majorMap = new Map(majors.map(r=>[r.id,r.name]));
  return roster.map(row=>{
    const c=classMap.get(row.class_id); const m=row.major_id || c?.major_id || '';
    return {id:row.id,authId:row.auth_user_id || '',username:row.username || '',fullName:row.full_name,
      classId:row.class_id,className:c?.class_name || 'Belum dipetakan', majorId:m,majorName:majorMap.get(m)||'Belum dipetakan',
      registered:row.registration_status==='registered' && !!row.auth_user_id};
  });
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
  const [start,end]=wibRange(date);
  return allRows<Attempt>('student_attempts','*',{lowerBound:{column:'completed_at_ms',value:start},upperBound:{column:'completed_at_ms',value:end},nullColumn:'practice_category',order:[{column:'completed_at_ms',ascending:false},{column:'id',ascending:false}]});
}
export async function getOwnAttempts(authId:string): Promise<Attempt[]> {
  return allRows<Attempt>('student_attempts','*',{equals:{column:'auth_user_id',value:authId},order:[{column:'completed_at_ms',ascending:false},{column:'id',ascending:false}]});
}
export async function getLeaderboard():Promise<LeaderboardEntry[]> {
  const {data,error}=await supabase().rpc('vokasi_school_leaderboard');
  if(error) throw error;
  // Urutan RPC bisa berbasis XP. Peringkat akademik web wajib berbasis nilai.
  // Tanpa hasil wajib terverifikasi, siswa tidak diberi posisi peringkat.
  return ((data || []) as LeaderboardEntry[])
    .filter(row => row.mandatory_days > 0 && typeof row.mandatory_average === 'number' && Number.isFinite(row.mandatory_average))
    .sort((a,b) => (b.mandatory_average ?? 0) - (a.mandatory_average ?? 0)
      || b.mandatory_days - a.mandatory_days
      || a.display_name.localeCompare(b.display_name, 'id'));
}
export function latestGrades(attempts:Attempt[], students:SchoolStudent[]): Map<string,Attempt> {
  const map=new Map<string,Attempt>();
  const userByAlias=new Map(students.filter(s=>s.username).map(s=>[s.username.trim().toLowerCase(),s.authId]));
  for(const attempt of [...attempts].sort((a,b)=>b.completed_at_ms-a.completed_at_ms)) {
    const key=attempt.auth_user_id || userByAlias.get(attempt.username.trim().toLowerCase());
    if(key && !map.has(key)) map.set(key,attempt);
  }
  return map;
}
