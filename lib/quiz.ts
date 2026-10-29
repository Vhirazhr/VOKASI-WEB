import type { Attempt, BankQuestion, SessionQuestion, StudentProfile } from './types';
import { wibDate } from './school';
import { storageUrl } from './storage-client';
import { APPROVED_BLUEPRINT, APPROVED_GROUPS } from './new-bank-blueprint';

export const QUOTAS: Record<string,number>=Object.fromEntries(
  APPROVED_GROUPS.map(group=>[group,APPROVED_BLUEPRINT.groups[group].quota])
);
export const PRACTICE_CATEGORIES=[
 'Perkalian','Pembagian','Numerasi Campuran','Fisika Dasar','Logika dan Penalaran','Pola Gambar'
] as const;
const shuffle=<T,>(list:T[])=>{
 const out=[...list];
 for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
 return out;
};

type ActiveChoice={text:string;image_path:string|null};
type PublishedRow={
 source_number:number;category:string;difficulty_code:string;question:string;
 question_image_path:string|null;options:ActiveChoice[];correct_index:number;
 time_limit_seconds:number;explanation:string;
};
type PublishedBankPayload = { active: boolean; version: string | null; questions: PublishedRow[] };
async function readPublishedBank(metaOnly = false): Promise<PublishedBankPayload> {
 const url = '/api/admin/question-bank' + (metaOnly ? '?meta=1' : '');
 const response = await fetch(url, {
   method: 'GET',
   credentials: 'same-origin',
   cache: 'no-store',
   headers: { Accept: 'application/json' },
 });
 const payload = await response.json().catch(() => ({})) as {
   data?: Partial<PublishedBankPayload>;
   error?: unknown;
 };
 if (!response.ok) {
   throw new Error(typeof payload.error === 'string' ? payload.error : 'Bank soal lokal tidak dapat dimuat.');
 }
 return {
   active: Boolean(payload.data?.active),
   version: typeof payload.data?.version === 'string' ? payload.data.version : null,
   questions: Array.isArray(payload.data?.questions) ? payload.data.questions : [],
 };
}

export async function getPublishedBankVersion():Promise<string|null>{
 try {
   const payload = await readPublishedBank(true);
   return payload.active ? payload.version : null;
 } catch {
   return null;
 }
}

export async function fetchBank(options:{allowIncomplete?:boolean}={}):Promise<BankQuestion[]>{
 const payload = await readPublishedBank();
 const version = payload.active ? payload.version : null;
 if(!version||!version.startsWith('VOKASI-NEW-'))
    throw new Error('Bank soal baru masih menunggu aktivasi admin. Latihan belum tersedia.');
 const collected:PublishedRow[] = payload.questions;
 if(!options.allowIncomplete&&collected.length<APPROVED_BLUEPRINT.bankCount)
   throw new Error('Bank soal resmi harus memiliki setidaknya 500 soal untuk blueprint. Hubungi admin sekolah.');
 const rows=collected;
 const filePaths=[...new Set(rows.flatMap(r=>[
    ...(r.question_image_path?[r.question_image_path]:[]),
    ...r.options.flatMap(o=>o.image_path?[o.image_path]:[])
 ]))];
 const signed=new Map<string,string>();
 for(const path of filePaths) signed.set(path,storageUrl('vokasi-question-figures',path));
 const bank:BankQuestion[]=rows.map(r=>{
   if(!Array.isArray(r.options)||r.options.length<2||r.options.length>6
      ||!Number.isInteger(r.correct_index)||r.correct_index<0||r.correct_index>=r.options.length)
      throw new Error('Format pilihan soal #'+r.source_number+' tidak valid.');
   return {
     id:r.source_number,category:r.category,question:r.question,
     options:r.options.map(o=>o.text||''),
     correctAnswer:r.options[r.correct_index].text||'',
     correctOption:String.fromCharCode(65+r.correct_index),
     difficultyCode:r.difficulty_code,timeLimitSeconds:r.time_limit_seconds,
     explanation:r.explanation||'',
     questionImageUrl:r.question_image_path?signed.get(r.question_image_path):null,
     optionImageUrls:r.options.map(o=>o.image_path?signed.get(o.image_path)||null:null)
   };
 });
 if(!options.allowIncomplete)for(const group of APPROVED_GROUPS){
   const rule=APPROVED_BLUEPRINT.groups[group];
   const rowsForGroup=bank.filter(q=>q.difficultyCode===group);
   if(rowsForGroup.length<rule.quota||rowsForGroup.some(q=>q.timeLimitSeconds!==rule.seconds))
     throw new Error('Blueprint '+rule.label+' tidak sesuai kuota/timer.');
 }
 if(!options.allowIncomplete&&bank.filter(q=>q.difficultyCode==='POLA_GAMBAR').some(q=>!q.questionImageUrl))
   throw new Error('Gambar soal penalaran visual belum lengkap.');
 return bank;
}
export function buildQuiz(bank:BankQuestion[],category:string|null):SessionQuestion[]{
 if(category&&!PRACTICE_CATEGORIES.some(c=>c===category))throw new Error('Kategori latihan tidak dikenal.');
 const source=category?shuffle(bank.filter(q=>q.category===category)).slice(0,10):
  APPROVED_GROUPS.flatMap(group=>{
    const rule=APPROVED_BLUEPRINT.groups[group];
    const options=bank.filter(q=>q.difficultyCode===group);
    if(options.length<rule.quota)throw new Error('Bank '+rule.label+' kurang lengkap.');
    return shuffle(options).slice(0,rule.quota);
  });
 if(source.length!==(category?10:APPROVED_BLUEPRINT.sessionCount)
   ||new Set(source.map(q=>q.id)).size!==source.length)
   throw new Error('Jumlah soal atau nomor tidak valid.');
 if(!category&&source.reduce((n,q)=>n+q.timeLimitSeconds,0)!==APPROVED_BLUEPRINT.sessionSeconds)
   throw new Error('Waktu total wajib bukan 30 menit.');
 return shuffle(source).map(q=>{
   const index=q.correctOption.charCodeAt(0)-65;
   if(!Number.isInteger(index)||index<0||index>=q.options.length)
     throw new Error('Kunci soal #'+q.id+' tidak valid.');
   const options=shuffle(q.options.map((text,i)=>({
     text,imageUrl:q.optionImageUrls?.[i]||null,correct:index===i
   })));
   return {...q,options:options.map(o=>o.text),optionImageUrls:options.map(o=>o.imageUrl),
     answerIndex:options.findIndex(o=>o.correct)};
 });
}

export function earnedXp(ownHistory:Attempt[],now:number,practiceCategory:string|null,correct:number):number {
  const today=ownHistory.filter(a=>wibDate(a.completed_at_ms)===wibDate(now));
  const spent=today.reduce((sum,a)=>sum+a.earned_xp,0);
  const remaining=Math.max(0,10000-spent);
  if(practiceCategory===null) return today.some(a=>a.practice_category===null)?0:Math.min(50,remaining);
  if(correct<=0||today.some(a=>a.practice_category===practiceCategory && a.earned_xp>0)) return 0;
  return Math.min(5,remaining);
}
export function makeAttempt(profile:StudentProfile,questions:SessionQuestion[],answers:Record<number,number|null>,startedAt:number,category:string|null,history:Attempt[],sessionKey?:string,responseSeconds:Record<number,number>={}):Attempt {
  const now=Date.now();const count=questions.length;
  const correct=questions.filter(q=>answers[q.id]===q.answerIndex).length;
  const elapsed=Math.min(7200,Math.round((now-startedAt)/1000));
  return {auth_user_id:profile.authId,username:profile.username,session_key:sessionKey||crypto.randomUUID(),completed_at_ms:now,
    signature:questions.map(q=>q.id).sort((a,b)=>a-b).join('-'),correct,answered:questions.filter(q=>answers[q.id]!==undefined&&answers[q.id]!==null).length,
    question_count:count,score:Math.floor(correct*100/count),earned_xp:earnedXp(history,now,category,correct),
    seconds_spent:Math.max(0,elapsed),practice_category:category,name_snapshot:profile.fullName,
    class_snapshot:profile.className,major_snapshot:profile.majorName,
    review_summary:questions.map(q=>({question_id:q.id,selected_index:answers[q.id]??null,
      status:answers[q.id]===undefined||answers[q.id]===null?'TIMEOUT':answers[q.id]===q.answerIndex?'BENAR':'SALAH',
      response_seconds:responseSeconds[q.id]??0}))};
}
