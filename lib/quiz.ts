import type { Attempt, BankQuestion, SessionQuestion, StudentProfile } from './types';
import { wibDate } from './school';

export const QUOTAS:Record<string,number>={ K1:6,K2:6,K3:6,K4:6,K5:6,P1:6,P2:6,P3:6,P4:6,P5:6,J:20,S1:15,S2:5 };
const shuffle=<T,>(list:T[])=>{const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;};
export function buildQuiz(bank:BankQuestion[], category:string|null):SessionQuestion[] {
  if(category && !['Perkalian','Pembagian','Penjumlahan','Konversi Satuan'].includes(category)) throw new Error('Kategori latihan tidak dikenal.');
  const source=category ? shuffle(bank.filter(q=>q.category===category)).slice(0,10)
    : Object.entries(QUOTAS).flatMap(([code,count])=>{
      const available=bank.filter(q=>q.difficultyCode===code);
      if(available.length<count) throw new Error(`Bank soal ${code} belum lengkap.`);
      return shuffle(available).slice(0,count);
    });
  if(source.length!==(category?10:100)) throw new Error('Jumlah soal tidak sesuai blueprint.');
  return shuffle(source).map(q=>{
    const correctIndex=q.correctOption.charCodeAt(0)-65;
    if(!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>=q.options.length
      ||q.options.length<2||q.options.length>6)throw new Error(`Pilihan atau kunci soal nomor ${q.id} tidak valid.`);
    // Shuffle text and its paired diagram together, never separately.
    const pairs=shuffle(q.options.map((text,i)=>({text,imageUrl:q.optionImageUrls?.[i]??null,wasCorrect:i===correctIndex})));
    return {...q,options:pairs.map(p=>p.text),optionImageUrls:pairs.map(p=>p.imageUrl),
      answerIndex:pairs.findIndex(p=>p.wasCorrect)};
  });
}
/** Never fall back to the old bank. New exercises may start only after an approved bank is published. */
export async function fetchBank():Promise<BankQuestion[]> {
  const response=await fetch('/data/vokasi_bank_active.json',{cache:'no-store'});
  if(!response.ok) throw new Error('Bank soal lama sudah dihapus. Bank 500 soal baru belum diaktifkan; latihan sementara tidak tersedia.');
  const bank:unknown=await response.json();
  if(!Array.isArray(bank)||bank.length!==500) throw new Error('Bank soal baru belum divalidasi sebagai 500 soal; latihan ditangguhkan.');
  return bank as BankQuestion[];
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
