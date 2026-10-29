import { nativeRpc } from '@/lib/native-rpc';
import {supabase} from './supabase';

export type WeakTopicRow={category:string;answered:number;correct:number;wrong:number;timeout:number};
export type TopicInsight=WeakTopicRow&{
 accuracy:number|null;needsPractice:boolean;status:'weak'|'improve'|'good'|'insufficient'|'untried'|'timeout';
 label:string;
};

export const STUDENT_TOPICS=[
 'Perkalian','Pembagian','Numerasi Campuran','Fisika Dasar',
 'Logika dan Penalaran','Pola Gambar'
] as const;

/** Based on actual responses, not the overall grade or a model-generated guess. */
export function topicInsight(category:string,row?:WeakTopicRow):TopicInsight{
 const answered=Math.max(0,Number(row?.answered||0));
 const correct=Math.max(0,Number(row?.correct||0));
 const wrong=Math.max(0,Number(row?.wrong||0));
 const timeout=Math.max(0,Number(row?.timeout||0));
 const accuracy=answered>0?Math.round(correct/answered*100):null;
 let status:TopicInsight['status']='untried';
 let label='Belum ada hasil latihan';
 if(answered>=5&&accuracy!==null){
   if(accuracy<70){status='weak';label='Disarankan latihan ulang';}
   else if(accuracy<85){status='improve';label='Masih bisa ditingkatkan';}
   else {status='good';label='Hasil sudah bagus';}
 }else if(answered>0){status='insufficient';label='Butuh lebih banyak jawaban';}
 else if(timeout>0){status='timeout';label='Soal habis waktu · coba lagi';}
 return {category,answered,correct,wrong,timeout,accuracy,needsPractice:status==='weak',status,label};
}

export async function getWeakTopicInsights():Promise<TopicInsight[]>{
 const {data,error}=await nativeRpc('vokasi_school_weak_topics');
 if(error)throw error;
 const rows=(data||[]) as WeakTopicRow[];
 const byCategory=new Map(rows.map(row=>[row.category.toLocaleLowerCase('id-ID'),row]));
 return STUDENT_TOPICS.map(category=>topicInsight(category,byCategory.get(category.toLocaleLowerCase('id-ID'))));
}

export function rankRecommendedTopics(rows:TopicInsight[]):TopicInsight[]{
 const priority={weak:0,improve:1,timeout:2,insufficient:3,untried:4,good:5};
 return [...rows].sort((a,b)=>
  priority[a.status]-priority[b.status]||
  (a.accuracy??101)-(b.accuracy??101)||
  b.wrong-a.wrong||
  a.category.localeCompare(b.category,'id'));
}
