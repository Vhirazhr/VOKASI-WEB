import { supabase } from './supabase';
import { getStudent } from './school';
import type { StudentProfile, UserRole } from './types';
const DOMAIN='@students.vokasi.invalid';
const DUPLICATE_DIGEST='507d41cce5272b62c382c1a19141fb61cb68a7a65937ff93e44b75a38dc8d28b';
const norm=(value:string)=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
async function hash(value:string) { const bytes=new TextEncoder().encode(value); const digest=await crypto.subtle.digest('SHA-256',bytes); return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''); }
async function parseIdentity(input:string) {
  const parts=input.split('|'); if(parts.length>2) throw new Error('Format nama siswa tidak valid.');
  const name=parts[0].trim().replace(/\s+/g,' '); if(name.length<2) throw new Error('Isi nama lengkap atau username siswa.');
  const classHint=parts[1]?.trim().replace(/\s+/g,' ').toUpperCase() || '';
  if(parts.length===2 && !classHint) throw new Error('Tambahkan kelas setelah tanda |.');
  const legacy=/^[a-z\d._]+$/i.test(name) && name.includes('.') && !name.includes(' ');
  const fullName=legacy?'':norm(name);
  if(fullName && await hash(fullName)===DUPLICATE_DIGEST && !classHint) throw new Error('Ada siswa bernama sama. Gunakan format Nama Lengkap | Kelas.');
  const base=legacy?name.toLowerCase():name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'.').replace(/^\.+|\.+$/g,'').slice(0,26).replace(/\.+$/,'')||'siswa';
  const aliases=classHint?Array.from({length:10},(_,i)=>i===0?base:base.slice(0,30-String(i+1).length-1).replace(/\.+$/,'')+'.'+(i+1)):[base];
  return {fullName,classHint,aliases};
}
export async function signIn(emailOrName:string,password:string,role:UserRole):Promise<StudentProfile|null> {
  const db=supabase();
  if(!password) throw new Error('Password wajib diisi.');
  await db.auth.signOut();
  if(role==='admin') {
    const {error}=await db.auth.signInWithPassword({email:emailOrName.trim(),password});
    if(error) throw new Error('Email atau password admin tidak cocok.');
    const {data,error:roleErr}=await db.rpc('is_school_admin');
    if(roleErr || data!==true){await db.auth.signOut();throw new Error('Akun ini tidak memiliki izin admin sekolah.');}
    return null;
  }
  const {fullName,classHint,aliases}=await parseIdentity(emailOrName);
  for(const alias of aliases) {
    const {error}=await db.auth.signInWithPassword({email:alias+DOMAIN,password});
    if(error) continue;
    const {data:{user}}=await db.auth.getUser();
    if(!user){await db.auth.signOut();continue;}
    try{
      const profile=await getStudent(user.id);
      if(fullName && norm(profile.fullName)!==fullName) {await db.auth.signOut();continue;}
      if(classHint && profile.className.trim().replace(/\s+/g,' ').toUpperCase()!==classHint) {await db.auth.signOut();continue;}
      return profile;
    }catch {await db.auth.signOut();}
  }
  throw new Error('Nama, kelas, atau password siswa tidak cocok.');
}
export async function currentRole():Promise<{role:UserRole; profile:StudentProfile|null}|null> {
  const db=supabase(); const {data:{user},error}=await db.auth.getUser();
  if(error||!user) return null;
  const {data,error:roleErr}=await db.rpc('is_school_admin');
  if(!roleErr && data===true) return {role:'admin',profile:null};
  try{const profile=await getStudent(user.id);return {role:'student',profile};}catch {return null;}
}
export async function signOut(){await supabase().auth.signOut();}
