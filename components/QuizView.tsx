'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,Clock3,RefreshCw,XCircle} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import type {Attempt,StudentProfile} from '@/lib/types';
import '@/app/quiz-playful.css';

type Option={text:string;image_path:string|null};
type Question={id:number;category:string;text:string;image_path:string|null;options:Option[];seconds:number};
type State={
 session_id:string;status:'prepared'|'active'|'complete';category:string|null;index?:number;total:number;
 question?:Question;question_deadline_ms?:number;overall_deadline_ms?:number;server_now_ms:number;
 score?:number;correct?:number;
 feedback?:{correct:boolean;selected_index:number};feedback_wait_ms?:number;late?:boolean;
};
type Review={
 id:number;category:string;text:string;image_path:string|null;options:Option[];correct_index:number;
 selected_index:number|null;status:string;response_seconds:number;explanation?:string;
};
const key=(id:string)=>'vokasi-secure-quiz-'+id;
const textClock=(seconds:number)=>String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
const errText=(e:unknown)=>e instanceof Error?e.message:String(e);
async function rpc<T>(functionName:string,params:Record<string,unknown>):Promise<T>{
 const {data,error}=await supabase().rpc(functionName,params);
 if(error)throw new Error(error.message);
 return data as T;
}
async function signedImages(paths:string[]):Promise<Map<string,string>>{
 const unique=[...new Set(paths.filter(Boolean))];
 const urls=new Map<string,string>();
 if(!unique.length)return urls;
 const {data,error}=await supabase().storage.from('vokasi-question-figures').createSignedUrls(unique,7200);
 if(error||!data)throw new Error('Gambar soal tidak bisa dimuat: '+(error?.message||'Storage tidak siap'));
 data.forEach((entry,i)=>{
   if(entry.error||!entry.signedUrl)throw new Error('Gambar tidak tersedia di Storage: '+unique[i]);
   urls.set(unique[i],entry.signedUrl);
 });
 return urls;
}
function visualPaths(q?:Question):string[]{
 return q?[q.image_path,...q.options.map(x=>x.image_path)].filter((x):x is string=>!!x):[];
}
async function preloadImages(map:Map<string,string>){
 await Promise.all([...map.values()].map(url=>new Promise<void>((resolve,reject)=>{
   const img=new window.Image();
   img.onload=()=>resolve();
   img.onerror=()=>reject(new Error('Gambar soal gagal dimuat. Periksa internet lalu coba lagi.'));
   img.src=url;
 })));
}

export default function QuizView({profile,category,onDone,onQuit}:{
 profile:StudentProfile;category:string|null;history:Attempt[];onDone:()=>void;onQuit:()=>void;
}){
 const [state,setState]=useState<State|null>(null);
 const [imageUrls,setImageUrls]=useState<Map<string,string>>(new Map());
 const [review,setReview]=useState<Review[]|null>(null);
 const [reviewShown,setReviewShown]=useState(false);
 const [reviewPage,setReviewPage]=useState(0);
 const [reviewFilter,setReviewFilter]=useState('Semua');
 const [selected,setSelected]=useState<number|null>(null);
 const [feedback,setFeedback]=useState<{correct:boolean;selected_index:number}|null>(null);
 const [feedbackQuestion,setFeedbackQuestion]=useState<Question|null>(null);
 const [busy,setBusy]=useState(true);
 const [sending,setSending]=useState(false);
 const [error,setError]=useState('');
 const [now,setNow]=useState(0);
 const [clockBase,setClockBase]=useState(0);
 const [xp,setXp]=useState<number|null>(null);
 const live=useRef(true);
 const inFlight=useRef(false);
 const feedbackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

 const accept=useCallback((next:State)=>{
   setState(next);setNow(Date.now());setClockBase(Date.now()-next.server_now_ms);
   if(next.status==='active')setSelected(null);
 },[]);

 useEffect(()=>{
   live.current=true;
   let active=true;
   async function prepare(){
     setBusy(true);setError('');
     try{
       const stored=sessionStorage.getItem(key(profile.authId));
       if(stored){
         try{
           const saved=JSON.parse(stored) as {session_id:string;category:string|null};
           if(saved.category===category&&saved.session_id){
             const recovered=await rpc<State>('vokasi_web_get_quiz_state',{p_session:saved.session_id});
             if(!active)return;
             if(recovered.status==='active'||recovered.status==='complete'){
               accept(recovered);
               if(recovered.question){
                 const urls=await signedImages(visualPaths(recovered.question));
                 if(active)setImageUrls(urls);
               }
               setBusy(false);return;
             }
             // A refresh during image preparation leaves a valid prepared session.
             // Continue through idempotent prepare; never create a competing session.
           }
         }catch{/* Previous session was replaced, expired, or invalid. Create a fresh one. */}
         sessionStorage.removeItem(key(profile.authId));
       }
       const prepared=await rpc<{session_id:string;image_paths:string[]}>(
          'vokasi_web_prepare_session',{p_category:category});
       if(!active)return;
       sessionStorage.setItem(key(profile.authId),JSON.stringify({session_id:prepared.session_id,category}));
       const urls=await signedImages(prepared.image_paths||[]);
       await preloadImages(urls);
       if(!active)return;
       setImageUrls(urls);
       // Timer starts on SERVER after selected image assets have loaded.
       const begun=await rpc<State>('vokasi_web_begin_session',{p_session:prepared.session_id});
       if(!active)return;
       if(begun.status==='active'&&begun.question){
         const extra=await signedImages(visualPaths(begun.question));
         if(!active)return;
         setImageUrls(current=>new Map([...current,...extra]));
       }
       accept(begun);
     }catch(e){if(active)setError(errText(e));}
     finally{if(active)setBusy(false);}
   }
   void prepare();
   return()=>{active=false;live.current=false;if(feedbackTimer.current)clearTimeout(feedbackTimer.current);};
 },[profile.authId,category,accept]);

 // Browser clock is display only; server timestamps are authoritative.
 const onServer=useCallback(async()=>{
   const id=state?.session_id;
   if(!id||inFlight.current||feedback||busy)return;
   inFlight.current=true;
   try{
     const next=await rpc<State>('vokasi_web_get_quiz_state',{p_session:id});
     if(!live.current)return;
     if(next.status!==state?.status||next.index!==state?.index){
       accept(next);
       if(next.question&&!imageUrls.has(next.question.image_path||'')){
         const urls=await signedImages(visualPaths(next.question));
         if(live.current)setImageUrls(current=>new Map([...current,...urls]));
       }
     }else{
       setState(next);setClockBase(Date.now()-next.server_now_ms);
     }
   }catch(e){if(live.current)setError('Gagal menyinkronkan timer: '+errText(e));}
   finally{inFlight.current=false;}
 },[state,feedback,busy,accept,imageUrls]);

 useEffect(()=>{
   if(!state||state.status!=='active'||busy||feedback)return;
   const timer=setInterval(()=>{
     const tick=Date.now();
     setNow(tick);
     const deadline=state.question_deadline_ms||0;
     if(tick-clockBase>=deadline||tick-clockBase>=Number(state.overall_deadline_ms||0)){
       void onServer();
     }
   },300);
   function foreground(){if(document.visibilityState==='visible')void onServer();}
   document.addEventListener('visibilitychange',foreground);
   return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',foreground);};
 },[state,busy,feedback,clockBase,onServer]);

 useEffect(()=>{
   if(state?.status!=='complete')return;
   const session=state.session_id;
   void supabase().from('student_attempts').select('earned_xp').eq('session_key',session)
     .maybeSingle().then(({data})=>{if(live.current&&data)setXp(data.earned_xp);});
 },[state?.status,state?.session_id]);

 async function submit(){
   if(!state||state.status!=='active'||selected===null||sending||feedback)return;
   const current=state.question;
   if(!current||state.index===undefined)return;
   setSending(true);setError('');
   try{
     const result=await rpc<State>('vokasi_web_submit_answer',{
       p_session:state.session_id,p_question_index:state.index,p_choice:selected});
     if(!live.current)return;
     if(result.feedback){
       setFeedback(result.feedback);setFeedbackQuestion(current);
       setSelected(result.feedback.selected_index);
       feedbackTimer.current=setTimeout(()=>{
         if(!live.current)return;
         accept(result);setFeedback(null);setFeedbackQuestion(null);
       },Math.max(0,result.feedback_wait_ms||1000));
     }else{accept(result);}
   }catch(e){if(live.current)setError('Jawaban belum diterima server: '+errText(e));}
   finally{if(live.current)setSending(false);}
 }

 async function loadReview(){
   if(!state||state.status!=='complete')return;
   if(review){setReviewShown(x=>!x);return;}
   setSending(true);setError('');
   try{
     const answers=await rpc<Review[]>('vokasi_web_completed_review',{p_session:state.session_id});
     if(!live.current)return;
     const paths=answers.flatMap(a=>[a.image_path,...a.options.map(o=>o.image_path)]).filter((p):p is string=>!!p);
     const urls=await signedImages(paths);
     if(live.current){setReview(answers);setImageUrls(current=>new Map([...current,...urls]));setReviewShown(true);}
   }catch(e){if(live.current)setError('Pembahasan belum bisa dibuka: '+errText(e));}
   finally{if(live.current)setSending(false);}
 }
 const question=feedbackQuestion||state?.question;
 const serverNow=now-clockBase;
 const remaining=state?.status==='active'&&!feedback?Math.max(0,Math.ceil(((state.question_deadline_ms||0)-serverNow)/1000)):0;
 const totalRemaining=state?.status==='active'?Math.max(0,Math.ceil(((state.overall_deadline_ms||0)-serverNow)/1000)):0;
 const currentIndex=feedback&&state?.index!==undefined?Math.max(0,state.index-1):state?.index||0;
 const progress=state?Math.round(currentIndex/state.total*100):0;
 const allRows=(review||[]).filter(r=>reviewFilter==='Semua'||(reviewFilter==='Benar'?r.status==='BENAR':reviewFilter==='Salah'?r.status==='SALAH':r.status==='TIMEOUT'));
 const pages=Math.max(1,Math.ceil(allRows.length/10));
 const page=Math.min(reviewPage,pages-1);

 function quit(){if(!window.confirm('Keluar dari latihan? Sesi tetap berjalan di server dan dapat dilanjutkan dari browser ini.'))return;onQuit();}
 if(busy)return <section className="white-panel center-message">Menyiapkan soal dan gambar... Waktu belum berjalan.</section>;
 if(!state&&error)return <section className="white-panel center-message"><XCircle className="error-icon" size={34}/><h2>Latihan belum bisa dimulai</h2><p>{error}</p><button className="btn secondary" onClick={onQuit}>Kembali</button></section>;
 if(!state)return <section className="white-panel center-message">Memuat sesi aman dari Supabase...</section>;
 if(state.status==='complete')return <section className="result-view quiz-playful-result">
   <div className="result-icon"><CheckCircle2 size={38}/></div>
   <span className="section-kicker">HASIL TELAH DIVERIFIKASI SERVER</span>
   <h2>{(state.score||0)>=75?'Kerja bagus!':'Latihan selesai. Terus berlatih, ya!'}</h2>
   <div className="result-score">{state.score||0}<small>/100</small></div>
   <div className="result-stats"><div><b>{state.correct||0}</b><span>Jawaban benar</span></div>
     <div><b>{state.total}</b><span>Total soal</span></div>
     <div><b>{xp===null?'…':'+'+xp}</b><span>XP didapat</span></div></div>
   <div className="alert success">Nilai dihitung dan disimpan langsung oleh Supabase, bukan browser.</div>
   {error&&<div className="alert danger" role="alert">{error}</div>}
   <div className="vokasi-review">
    <button className="btn secondary vokasi-review-toggle" onClick={()=>void loadReview()} disabled={sending}>
      {reviewShown?'Tutup pembahasan':'Lihat pembahasan jawaban'}</button>
    {reviewShown&&review&&<section className="vokasi-review-details" aria-label="Pembahasan jawaban">
      <h3>Pembahasan Jawaban</h3>
      <div className="vokasi-review-filters">{['Semua','Salah','Benar','Timeout'].map(item=>
        <button key={item} type="button" className={reviewFilter===item?'active':''} onClick={()=>{setReviewFilter(item);setReviewPage(0);}}>{item}</button>)}</div>
      <p className="vokasi-review-minor">{allRows.length} soal pada filter ini</p>
      {allRows.slice(page*10,(page+1)*10).map(r=><article className="vokasi-review-card" key={r.id}>
        <div className="vokasi-review-label"><b>Soal {r.id} • {r.category}</b><span className={r.status==='BENAR'?'good':'bad'}>{r.status}</span></div>
        <h4>{r.text}</h4>
        {r.image_path&&imageUrls.get(r.image_path)&&<img className="quiz-review-figure" src={imageUrls.get(r.image_path)} alt="Gambar soal"/>}
        <p>Jawaban kamu: <b>{r.selected_index===null?'Tidak dijawab':r.options[r.selected_index]?.text||'Jawaban bergambar'}</b></p>
        <p>Jawaban benar: <b>{r.options[r.correct_index]?.text||'Jawaban bergambar'}</b></p>
        {r.explanation&&<p className="vokasi-review-explanation">{r.explanation}</p>}
        <small>Waktu menjawab: {r.response_seconds} detik</small>
      </article>)}
      <div className="vokasi-review-pages"><button className="btn secondary small" disabled={page===0} onClick={()=>setReviewPage(i=>Math.max(0,i-1))}>Sebelumnya</button><span>{page+1}/{pages}</span>
        <button className="btn secondary small" disabled={page>=pages-1} onClick={()=>setReviewPage(i=>i+1)}>Berikutnya</button></div>
    </section>}
   </div>
   <div className="result-actions"><button className="btn primary" onClick={()=>{sessionStorage.removeItem(key(profile.authId));onDone();}}>Kembali ke dashboard <ArrowRight size={16}/></button></div>
 </section>;
 if(!question)return <section className="white-panel center-message">Menunggu soal berikutnya dari server...</section>;
 return <div className="quiz-layout quiz-playful">
   <div className="quiz-header"><button className="back-button" onClick={quit}><ArrowLeft size={18}/> Keluar latihan</button><span className="quiz-topic">{state.category||'Latihan Wajib'}</span></div>
   <div className="quiz-progress"><div className="quiz-progress-label"><span>Soal <b>{currentIndex+1}</b> dari {state.total}</span><span>{progress}% selesai</span></div>
   <div className="progress-track"><div style={{width:progress+'%'}}/></div></div>
   <div className="quiz-card">
    <div className="quiz-playful-deco">✦ VOKASI PLAY MODE ✧</div>
    <div className="quiz-card-head"><span className="question-type">PERTANYAAN {currentIndex+1}</span>
     <div className="time-group"><span className={remaining<=5?'timer urgent':'timer'}><Clock3 size={17}/>{feedback?'Tersimpan':textClock(remaining)}</span>
       <span className="total-time">Total: {textClock(totalRemaining)}</span></div></div>
    <div className="quiz-playful-question"><div><h2>{question.text}</h2><p className="question-hint">Pilih satu jawaban yang paling tepat.</p></div>
      <div className="quiz-playful-mascot" aria-hidden="true"><span className="quiz-mascot-face"><i/><i/></span><span className="quiz-mascot-grin"/></div></div>
    {question.image_path&&imageUrls.get(question.image_path)&&<div className="quiz-visual-figure">
      <img src={imageUrls.get(question.image_path)} alt="Gambar soal numerasi" loading="eager"/></div>}
    <div className="answers">{question.options.map((option,i)=><button type="button" key={i}
       aria-pressed={selected===i} disabled={sending||!!feedback||remaining<=0}
       className={'answer '+(selected===i?'chosen ':'')+(feedback&&selected===i?(feedback.correct?'feedback-correct':'feedback-wrong'):'')}
       onClick={()=>setSelected(i)}>
       <span className="answer-letter">{String.fromCharCode(65+i)}</span>
       <span className="quiz-choice-content">{option.text&&<span>{option.text}</span>}
         {option.image_path&&imageUrls.get(option.image_path)&&<img src={imageUrls.get(option.image_path)} alt={'Gambar pilihan '+String.fromCharCode(65+i)}/>}</span>
       {selected===i&&<CheckCircle2 size={18}/>}
    </button>)}</div>
    {feedback&&<div role="status" className={'quiz-answer-feedback '+(feedback.correct?'correct':'wrong')}>
      <b>{feedback.correct?'✓ Jawaban kamu BENAR!':'✕ Jawaban kamu SALAH.'}</b><span>Soal berikutnya segera tampil…</span></div>}
    {error&&<div className="alert danger" role="alert">{error}<button className="btn secondary small" onClick={()=>void onServer()}><RefreshCw size={15}/> Sinkronkan</button></div>}
    <div className="quiz-footer"><span>Jawaban diperiksa server. Jawaban terkirim tidak bisa diubah.</span>
      <button className="btn primary" disabled={selected===null||sending||!!feedback||remaining<=0} onClick={()=>void submit()}>
        {sending?'Memverifikasi...':'Kirim jawaban'} <ArrowRight size={16}/></button></div>
   </div><p className="quiz-footnote">Waktu dari server. Saat habis, sistem otomatis lanjut dan menandai TIMEOUT.</p>
 </div>;
}
