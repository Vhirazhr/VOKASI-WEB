'use client';
import { nativeRpc } from '@/lib/native-rpc';
import {useState} from 'react';
import {supabase} from '@/lib/supabase';

type Choice={text:string;image_path:string|null};
type Review={id:number;text:string;category:string;image_path:string|null;options:Choice[];
 correct_index:number;selected_index:number|null;status:string;response_seconds:number;explanation?:string};
const BUCKET='vokasi-question-figures';
export default function ReviewHistory({sessionId}:{sessionId:string}){
 const [reviews,setReviews]=useState<Review[]|null>(null);
 const [urls,setUrls]=useState<Map<string,string>>(new Map());
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const [shown,setShown]=useState(false);
 const [page,setPage]=useState(0);
 async function open(){
  if(reviews){setShown(v=>!v);return;}
  setLoading(true);setError('');
  try{
   const {data,error:e}=await nativeRpc('vokasi_web_completed_review',{p_session:sessionId});
   if(e)throw e;
   if(!Array.isArray(data))throw new Error('Pembahasan tidak tersedia.');
   const items=data as Review[];
   const paths=[...new Set(items.flatMap(x=>[
     ...(x.image_path?[x.image_path]:[]),...x.options.flatMap(o=>o.image_path?[o.image_path]:[])
   ]))];
   const m=new Map<string,string>();
   if(paths.length){
    const {data:files,error:err}=await supabase().storage.from(BUCKET).createSignedUrls(paths,3600);
    if(err||!files)throw new Error('Gambar pembahasan belum bisa dibuka.');
    files.forEach((f,i)=>{if(f.signedUrl)m.set(paths[i],f.signedUrl);});
   }
   setReviews(items);setUrls(m);setShown(true);
  }catch(e){setError(e instanceof Error?e.message:'Gagal mengambil pembahasan.');}
  finally{setLoading(false);}
 }
 const filtered=reviews||[];const count=Math.max(1,Math.ceil(filtered.length/10));
 return <div className="student-history-review">
  <button type="button" className="btn secondary small" disabled={loading} onClick={()=>void open()}>
   {loading?'Mengambil pembahasan...':shown?'Tutup pembahasan':'Lihat pembahasan lengkap'}
  </button>
  {error&&<p role="alert" className="student-history-review-error">{error}</p>}
  {shown&&reviews&&<div className="student-history-review-list">
   <p><b>Pembahasan dari sesi tersimpan di server.</b> Bisa dibuka lagi setelah login dari perangkat lain.</p>
   {filtered.slice(page*10,(page+1)*10).map((q,i)=><article key={page*10+i} className="student-history-review-item">
    <strong>Soal {page*10+i+1} — {q.status}</strong>
    <p>{q.text}</p>
    {q.image_path&&urls.get(q.image_path)&&<img src={urls.get(q.image_path)} alt={'Gambar soal '+q.id}/>}
    <div className="student-history-review-options">{q.options.map((o,j)=><div key={j}>
     <b>{String.fromCharCode(65+j)}.</b> {o.text}
     {o.image_path&&urls.get(o.image_path)&&<img src={urls.get(o.image_path)} alt={'Gambar pilihan '+String.fromCharCode(65+j)}/>}
    </div>)}</div>
    <p>Jawabanmu: <b>{q.selected_index===null?'Tidak dijawab':String.fromCharCode(65+q.selected_index)}</b>
    {' · '}Kunci: <b>{String.fromCharCode(65+q.correct_index)}</b>
    {' · '}Waktu: {q.response_seconds} detik</p>
    {q.explanation&&<p>Penjelasan: {q.explanation}</p>}
   </article>)}
   <div className="student-history-review-pages">
    <button type="button" className="btn secondary small" disabled={page===0} onClick={()=>setPage(v=>v-1)}>Sebelumnya</button>
    <span>{page+1}/{count}</span>
    <button type="button" className="btn secondary small" disabled={page+1>=count} onClick={()=>setPage(v=>v+1)}>Berikutnya</button>
   </div>
  </div>}
 </div>;
}
