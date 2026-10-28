'use client';
import { nativeRpc } from '@/lib/native-rpc';
import {useEffect,useMemo,useState} from 'react';
import {BookOpen,CheckCircle2,ChevronLeft,ChevronRight,RefreshCw,X,XCircle,TrendingUp,Target,Clock3} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import type {Attempt} from '@/lib/types';

type Answer={id:number;text:string;category:string;image_path:string|null;options:{text:string;image_path:string|null}[];
 correct_index:number;selected_index:number|null;status:string;response_seconds:number;explanation?:string};
const PAGE=10;
export default function AdminAnswerReview({student,attempt,onClose}:{student:string;attempt:Attempt;onClose:()=>void}){
 const [review,setReview]=useState<Answer[]>([]);
 const [urls,setUrls]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(true),[error,setError]=useState('');
 const [onlyWrong,setOnlyWrong]=useState(false),[page,setPage]=useState(0);
 useEffect(()=>{
  let active=true;
  async function load(){
   try{
    const {data,error}=await nativeRpc('vokasi_admin_completed_review',{p_session:attempt.session_key});
    if(error)throw error;
    if(!Array.isArray(data))throw new Error('Rincian jawaban tidak tersedia.');
    const items=data as Answer[];
    const paths=[...new Set(items.flatMap(x=>[
      ...(x.image_path?[x.image_path]:[]),...x.options.flatMap(o=>o.image_path?[o.image_path]:[])
    ]))];
    const urlMap:Record<string,string>={};
    if(paths.length){
     const {data:images,error:e}=await supabase().storage.from('vokasi-question-figures').createSignedUrls(paths,3600);
     if(e)throw e;
     images?.forEach((image,index)=>{if(image.signedUrl)urlMap[paths[index]]=image.signedUrl;});
    }
    if(active){setReview(items);setUrls(urlMap);setError('');}
   }catch(e){if(active)setError(e instanceof Error?e.message:'Gagal mengambil pembahasan.');}
   finally{if(active)setBusy(false);}
  }
  void load();
  return()=>{active=false;};
 },[attempt.session_key]);
 useEffect(()=>{const listener=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener)},[onClose]);
 const filtered=useMemo(()=>review.map((r,index)=>({...r,index})).filter(r=>!onlyWrong||r.status!=='BENAR'),[review,onlyWrong]);
 const stats=useMemo(()=>{
  const isUnanswered=(item:Answer)=>{
   const status=item.status.trim().toUpperCase();
   return item.selected_index===null||status.includes('TIMEOUT')||status.includes('TIDAK DIJAWAB')||status.includes('KOSONG');
  };
  const correct=review.filter(item=>item.status.trim().toUpperCase()==='BENAR').length;
  const unanswered=review.filter(isUnanswered).length;
  const wrong=Math.max(0,review.length-correct-unanswered);
  const grouped=new Map<string,{category:string;total:number;correct:number;wrong:number;unanswered:number;seconds:number}>();
  for(const item of review){
   const category=item.category?.trim()||'Lainnya';
   const current=grouped.get(category)||{category,total:0,correct:0,wrong:0,unanswered:0,seconds:0};
   current.total++;
   current.seconds+=Math.max(0,item.response_seconds||0);
   if(item.status.trim().toUpperCase()==='BENAR')current.correct++;
   else if(isUnanswered(item))current.unanswered++;
   else current.wrong++;
   grouped.set(category,current);
  }
  const categories=[...grouped.values()].map(item=>({...item,accuracy:item.total?Math.round(item.correct/item.total*100):0,
    averageSeconds:item.total?Math.round(item.seconds/item.total):0}))
   .sort((a,b)=>a.accuracy-b.accuracy||b.total-a.total||a.category.localeCompare(b.category,'id'));
  const needsPractice=categories.filter(item=>item.accuracy<70).slice(0,3);
  const strengths=[...categories].filter(item=>item.accuracy>=70)
   .sort((a,b)=>b.accuracy-a.accuracy||b.total-a.total||a.category.localeCompare(b.category,'id')).slice(0,3);
  return {total:review.length,correct,wrong,unanswered,accuracy:review.length?Math.round(correct/review.length*100):0,
    answered:review.length-unanswered,averageSeconds:review.length?Math.round(review.reduce((sum,item)=>sum+Math.max(0,item.response_seconds||0),0)/review.length):0,
    categories,needsPractice,strengths};
 },[review]);
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE));
 const visible=filtered.slice(page*PAGE,(page+1)*PAGE);
 function choose(i:number|null,options:Answer['options']){return i===null||i<0||i>=options.length?'Tidak dijawab':String.fromCharCode(65+i)+'. '+(options[i]?.text||'[opsi gambar]');}
 return <div className="admin-answer-overlay">
  <button type="button" className="admin-answer-backdrop" onClick={onClose} aria-label="Tutup pembahasan"/>
  <section className="admin-answer-modal" role="dialog" aria-modal="true" aria-label={'Pembahasan jawaban '+student}>
   <header className="admin-answer-head"><span className="admin-answer-head-icon"><BookOpen size={22}/></span><div><span>MONITORING HASIL WAJIB</span><h2>Pembahasan jawaban siswa</h2><p>{student} · Nilai {attempt.score}/100 · {attempt.correct}/{attempt.question_count} benar</p></div><button type="button" onClick={onClose} aria-label="Tutup"><X size={20}/></button></header>
   {busy?<div className="admin-answer-empty"><RefreshCw size={22}/> Mengambil pembahasan terverifikasi...</div>:
    error?<div className="admin-answer-empty" role="alert"><XCircle size={22}/>{error}</div>:
    <><div className="admin-answer-toolbar">
       <div className="admin-answer-tabs"><button type="button" className={!onlyWrong?'active':''} onClick={()=>{setOnlyWrong(false);setPage(0);}}>Semua ({review.length})</button><button type="button" className={onlyWrong?'active':''} onClick={()=>{setOnlyWrong(true);setPage(0);}}>Perlu ditinjau ({review.filter(x=>x.status!=='BENAR').length})</button></div>
       <span>{filtered.length} soal ditemukan</span>
      </div>
      <div className="admin-answer-list">
       <section className="admin-answer-insights" aria-label="Statistik hasil siswa">
        <div className="admin-answer-insights-head"><div><span>RINGKASAN PERFORMA</span><h3>Statistik hasil latihan</h3><p>Analisis dari jawaban pada sesi ini, bukan perkiraan.</p></div><div className="admin-answer-accuracy"><strong>{stats.accuracy}%</strong><small>akurasi keseluruhan</small></div></div>
        <div className="admin-answer-metric-grid">
         <div className="correct"><CheckCircle2 size={17}/><span>Benar</span><strong>{stats.correct}</strong></div>
         <div className="incorrect"><XCircle size={17}/><span>Salah</span><strong>{stats.wrong}</strong></div>
         <div className="unanswered"><Clock3 size={17}/><span>Kosong / waktu habis</span><strong>{stats.unanswered}</strong></div>
         <div className="time"><Clock3 size={17}/><span>Rata-rata waktu</span><strong>{stats.averageSeconds} dtk</strong></div>
        </div>
        <div className="admin-answer-category-grid">
         <section className="admin-answer-category-card">
          <h4><TrendingUp size={16}/> Sudah lumayan</h4>
          {stats.strengths.length?stats.strengths.map(item=><div className="admin-answer-category-row" key={'strong-'+item.category}><div><b>{item.category}</b><span>{item.correct}/{item.total} benar · {item.total} soal{item.total===1?' (sampel kecil)':''}</span></div><strong>{item.accuracy}%</strong><div className="admin-answer-progress"><span style={{width:item.accuracy+'%'}}/></div></div>):<p className="admin-answer-insight-empty">Belum ada kategori dengan akurasi 70% atau lebih. Lihat prioritas latihan di samping.</p>}
         </section>
         <section className="admin-answer-category-card needs">
          <h4><Target size={16}/> Perlu diperkuat</h4>
          {stats.needsPractice.length?stats.needsPractice.map(item=><div className="admin-answer-category-row" key={'practice-'+item.category}><div><b>{item.category}</b><span>{item.correct}/{item.total} benar · {item.wrong} salah · {item.unanswered} kosong</span></div><strong>{item.accuracy}%</strong><div className="admin-answer-progress"><span style={{width:item.accuracy+'%'}}/></div></div>):<p className="admin-answer-insight-empty">Belum terlihat kategori di bawah 70%. Tetap tinjau jawaban yang salah.</p>}
         </section>
        </div>
       </section>
       {visible.map(q=><article key={q.index} className="admin-answer-item">
       <div className="admin-answer-item-top"><strong>Soal {q.index+1} · {q.category}</strong><span className={q.status==='BENAR'?'right':q.status==='TIMEOUT'?'timed':'wrong'}>{q.status==='BENAR'?<CheckCircle2 size={13}/>:<XCircle size={13}/>} {q.status}</span></div>
       <p>{q.text}</p>
       {q.image_path&&urls[q.image_path]&&<img src={urls[q.image_path]} alt={'Gambar soal '+(q.index+1)} />}
       <div className="admin-answer-choices">
        {q.options.map((option,j)=><div key={j} className={(q.correct_index===j?'is-answer ':'')+(q.selected_index===j?'is-student':'')}>
          <b>{String.fromCharCode(65+j)}</b><span>{option.text||'[gambar]'}</span>
          {option.image_path&&urls[option.image_path]&&<img src={urls[option.image_path]} alt={'Pilihan '+String.fromCharCode(65+j)}/>}
         </div>)}
       </div>
       <div className="admin-answer-conclusion"><span>Jawaban siswa: <strong>{choose(q.selected_index,q.options)}</strong></span><span>Kunci: <strong>{choose(q.correct_index,q.options)}</strong></span><span>Waktu: {q.response_seconds} detik</span></div>
       {q.explanation&&<p className="admin-answer-explanation"><b>Pembahasan:</b> {q.explanation}</p>}
      </article>)}
      </div>
      <footer className="admin-answer-pages"><button type="button" disabled={page===0} onClick={()=>setPage(x=>x-1)}><ChevronLeft size={16}/> Sebelumnya</button><span>Halaman {page+1} / {pages}</span><button type="button" disabled={page+1>=pages} onClick={()=>setPage(x=>x+1)}>Berikutnya <ChevronRight size={16}/></button></footer></>}
  </section>
 </div>;
}
