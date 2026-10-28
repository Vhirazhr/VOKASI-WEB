'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,Clock3,RefreshCw,XCircle,Grid2X2,ShieldCheck,ZoomIn,X} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import StudentSessionReportDownload from '@/components/StudentSessionReportDownload';
import type {Attempt,StudentProfile} from '@/lib/types';
import '@/app/quiz-playful.css';
import '@/app/quiz-focus.css';
import '@/app/quiz-viewport.css';

type Option={text:string;image_path:string|null};
type Question={id:number;category:string;text:string;image_path:string|null;options:Option[];seconds:number};
type State={
 session_id:string;status:'prepared'|'active'|'complete';category:string|null;index?:number;total:number;
 question?:Question;question_deadline_ms?:number;overall_deadline_ms?:number;server_now_ms:number;
 score?:number;correct?:number;
 feedback?:{correct:boolean;selected_index:number};feedback_wait_ms?:number;late?:boolean;
};
type LiveProgress={correct:number;wrong:number;timeout:number;statuses:string[];repeat_today?:boolean;official_today?:boolean};
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
 const [liveProgress,setLiveProgress]=useState<LiveProgress|null>(null);
 const [restartCycle,setRestartCycle]=useState(0);
 const [timeoutReaction,setTimeoutReaction]=useState(false);
 const [monitorOpen,setMonitorOpen]=useState(false);
 const [figureOpen,setFigureOpen]=useState(false);
 useEffect(()=>{
   if(!figureOpen&&!monitorOpen)return;
   const escape=(event:KeyboardEvent)=>{
     if(event.key==='Escape'){setFigureOpen(false);setMonitorOpen(false);}
   };
   window.addEventListener('keydown',escape);
   return()=>window.removeEventListener('keydown',escape);
 },[figureOpen,monitorOpen]);

 const live=useRef(true);
 const inFlight=useRef(false);
 const feedbackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

 const accept=useCallback((next:State)=>{
   setState(next);setNow(Date.now());setClockBase(Date.now()-next.server_now_ms);
   if(next.status==='active'){setSelected(null);setTimeoutReaction(false);setMonitorOpen(false);setFigureOpen(false);}
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
             if(recovered.status==='active'){
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
       type PreparedSession={session_id:string;image_paths:string[];reused?:boolean};
       let prepared=await rpc<PreparedSession>('vokasi_web_prepare_session',{p_category:category});
       if(!active)return;
       if(prepared.reused){
         // An active server session can be stale after its deadline.
         // Resolve it before we continue; a complete session is not a new attempt.
         const current=await rpc<State>('vokasi_web_get_quiz_state',{p_session:prepared.session_id});
         if(!active)return;
         if(current.status==='complete'){
           prepared=await rpc<PreparedSession>('vokasi_web_prepare_session',{p_category:category});
           if(!active)return;
         }
       }
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
 },[profile.authId,category,accept,restartCycle]);

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
   let current=true;
   const session=state.session_id;
   void supabase().from('student_attempts').select('earned_xp').eq('session_key',session)
     .maybeSingle().then(({data})=>{if(current&&live.current&&data)setXp(data.earned_xp);});
   return()=>{current=false;};
 },[state?.status,state?.session_id]);

 // Navigator verdicts come from a separate read-only, student-owned server RPC.
 // A refresh or another device never resets the monitoring counters.
 useEffect(()=>{
   if(!state?.session_id||state.status==='prepared')return;
   let cancelled=false;
   const session=state.session_id;
   void rpc<LiveProgress>('vokasi_web_quiz_progress',{p_session:session})
     .then(result=>{
       if(!cancelled&&result&&Array.isArray(result.statuses))setLiveProgress(result);
     }).catch(()=>{/* A monitor read failure never interrupts the exam timer. */});
   return()=>{cancelled=true;};
 },[state?.session_id,state?.status,state?.index]);

 // Timeout emotion is driven by a server-confirmed verdict, never browser guesses.
 // Show it briefly on the next question without overlaying its text or choices.
 useEffect(()=>{
   if(state?.status!=='active'||state.index===undefined||!liveProgress)return;
   if(liveProgress.statuses.length!==state.index||liveProgress.statuses.at(-1)!=='TIMEOUT')return;
   const show=window.setTimeout(()=>setTimeoutReaction(true),0);
   const hide=window.setTimeout(()=>setTimeoutReaction(false),2600);
   return()=>{window.clearTimeout(show);window.clearTimeout(hide);};
 },[state?.status,state?.index,liveProgress]);

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
 const questionDuration=Math.max(1,Number(state?.question?.seconds||1));
 const timePercent=feedback?100:Math.max(0,Math.min(100,Math.round(100*remaining/questionDuration)));
 const timerCritical=!feedback&&remaining<=5;
 const timerWarning=!feedback&&remaining>5&&remaining<=10;
 const finishedStatuses=liveProgress?.statuses||[];
 const processed=Math.max(finishedStatuses.length,currentIndex);
 const monitorRemaining=state?Math.max(0,state.total-processed):0;
 const mascotMood=feedback?(feedback.correct?'happy':'sad'):timeoutReaction?'angry':'neutral';
 const mascotText=mascotMood==='happy'?'Jawaban benar, semangat!':mascotMood==='sad'?'Jawaban salah, coba lagi!':mascotMood==='angry'?'Yah, waktunya habis!':'Semangat mengerjakan!';
 const allRows=(review||[]).filter(r=>reviewFilter==='Semua'||(reviewFilter==='Benar'?r.status==='BENAR':reviewFilter==='Salah'?r.status==='SALAH':r.status==='TIMEOUT'));
 const pages=Math.max(1,Math.ceil(allRows.length/10));
 const page=Math.min(reviewPage,pages-1);

 function restart(){
   sessionStorage.removeItem(key(profile.authId));
   setReview(null);setReviewShown(false);setReviewPage(0);setReviewFilter('Semua');
   setXp(null);setLiveProgress(null);setSelected(null);setFeedback(null);setFeedbackQuestion(null);setTimeoutReaction(false);
   setImageUrls(new Map());setState(null);setError('');setMonitorOpen(false);setFigureOpen(false);setRestartCycle(v=>v+1);
 }
 function quit(){if(!window.confirm('Keluar dari latihan? Sesi tetap berjalan di server dan dapat dilanjutkan dari browser ini.'))return;onQuit();}
 if(busy)return <section className="white-panel center-message">Menyiapkan soal dan gambar... Waktu belum berjalan.</section>;
 if(!state&&error)return <section className="white-panel center-message"><XCircle className="error-icon" size={34}/><h2>Latihan belum bisa dimulai</h2><p>{error}</p><button className="btn secondary" onClick={onQuit}>Kembali</button></section>;
 if(!state)return <section className="white-panel center-message">Memuat sesi aman dari Supabase...</section>;
 if(state.status==='complete')return <section className="result-view quiz-playful-result">
   <div className="result-icon"><CheckCircle2 size={38}/></div>
   <span className="section-kicker">HASIL TELAH DIVERIFIKASI SERVER</span>
   <h2>{liveProgress?.timeout===state.total?'Waktu sesi habis. Yuk, coba lagi!':(state.score||0)>=75?'Kerja bagus!':'Latihan selesai. Terus berlatih, ya!'}</h2>
   <div className="result-score">{state.score||0}<small>/100</small></div>
   <div className="result-stats"><div><b>{state.correct||0}</b><span>Jawaban benar</span></div>
     <div><b>{state.total}</b><span>Total soal</span></div>
     <div><b>{xp===null?'…':'+'+xp}</b><span>XP didapat</span></div></div>
   <div className="alert success">Hasil sesi ini dihitung dan disimpan langsung oleh server.</div>
   {state.category===null&&liveProgress?.repeat_today&&<div className="alert info">Ini <b>pengulangan latihan wajib hari ini</b>. Nilai dan XP sesi ini tidak mengganti hasil resmi pertamamu hari ini, tetapi tetap masuk Riwayat.</div>}
   {state.category===null&&liveProgress?.official_today&&<div className="alert info">Ini hasil resmi latihan wajib pertamamu hari ini. Pengulangan berikutnya tidak akan mengubah nilai resmi atau menambah XP harian.</div>}
   {liveProgress?.timeout===state.total&&<div className="alert danger">Seluruh soal pada sesi ini tercatat TIMEOUT. Jika kamu meninggalkan latihan hingga waktu habis, server tetap mengakhiri sesi. Kamu boleh mengerjakan ulang.</div>}
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
   <div className="result-actions">
     <StudentSessionReportDownload profile={profile} sessionId={state.session_id} official={state.category===null&&liveProgress?.official_today===true}/>
     <button type="button" className="btn secondary" onClick={restart}><RefreshCw size={16}/> Kerjakan ulang</button>
     <button type="button" className="btn primary" onClick={()=>{sessionStorage.removeItem(key(profile.authId));onDone();}}>Kembali ke dashboard <ArrowRight size={16}/></button>
   </div>
 </section>;
 if(!question)return <section className="white-panel center-message">Menunggu soal berikutnya dari server...</section>;
 return <div className="quiz-focus-exam">
   <header className="quiz-focus-appbar">
     <div className="quiz-focus-appbrand">
       <span className="quiz-focus-logo">V</span>
       <div><small>VOKASI · MODE FOKUS</small><strong>{state.category||'Latihan Wajib'}</strong></div>
     </div>
     <div className={'quiz-focus-session-time '+(totalRemaining<=60?'is-critical':'')}>
       <Clock3 size={24}/>
       <div><small>SISA WAKTU SESI</small><strong role="timer">{textClock(totalRemaining)}</strong></div>
     </div>
     <div className="quiz-focus-appbar-actions">
       <button type="button" className="quiz-focus-monitor-toggle" aria-controls="quiz-focus-monitor" aria-expanded={monitorOpen} onClick={()=>setMonitorOpen(value=>!value)}><Grid2X2 size={17}/><span>Daftar soal</span></button>
       <button type="button" className="quiz-focus-leave" onClick={quit}><ArrowLeft size={16}/><span>Keluar latihan</span></button>
     </div>
   </header>
   <div className="quiz-focus-session-track" aria-label={'Progres latihan '+progress+' persen'}>
     <div style={{width:progress+'%'}}/>
   </div>
   <div className="quiz-focus-columns">
    <main className="quiz-focus-workspace">
     <section className={'quiz-focus-timer-banner '+(timerCritical?'is-critical':timerWarning?'is-warning':'')} aria-label="Waktu berjalan untuk soal saat ini">
       <div className="quiz-focus-timer-ring" style={{background:'conic-gradient('+ (feedback?'#20af89':timerCritical?'#f05b69':timerWarning?'#f6aa39':'#2883f3')+' '+timePercent+'%, #e4edfa '+timePercent+'% 100%)'}}>
         <div className="quiz-focus-timer-inner"><Clock3 size={19}/><strong role="timer">{feedback?'✓':textClock(remaining)}</strong><small>{feedback?'TERKIRIM':'WAKTU SOAL'}</small></div>
       </div>
       <div className="quiz-focus-timer-copy">
         <span className="quiz-focus-live-dot"><i/> TIMER BERJALAN</span>
         <h2>{feedback?'Jawaban sudah terkirim!':timerCritical?'Waktunya hampir habis!':'Fokus pada soal ini'}</h2>
         <p>{feedback?'Jawaban sudah diperiksa server, lanjut ke soal berikutnya.':'Pilih jawaban sebelum waktu soal habis. Waktu terus berjalan otomatis.'}</p>
         <div className="quiz-focus-inline-stats"><span>SOAL <b>{currentIndex+1}/{state.total}</b></span><span>SELESAI <b>{progress}%</b></span></div>
       </div>
       <div className={'quiz-focus-mascot quiz-focus-mascot-'+mascotMood} role="img" aria-label={mascotText}>
         <span className="quiz-focus-mascot-halo" aria-hidden="true"/>
         <span className="quiz-focus-mascot-face" aria-hidden="true">
           <i className="quiz-focus-mascot-eye"/><i className="quiz-focus-mascot-eye"/>
           <span className="quiz-focus-mascot-mouth"/>
           <span className="quiz-focus-mascot-cheek left"/><span className="quiz-focus-mascot-cheek right"/>
         </span>
         <span className="quiz-focus-mascot-caption">{mascotMood==='happy'?'HEBAT!':mascotMood==='sad'?'SEMANGAT!':mascotMood==='angry'?'TIMEOUT!':'AYO BISA!'}</span>
       </div>
       <div className="quiz-focus-timer-track" aria-hidden="true"><span style={{width:timePercent+'%'}}/></div>
     </section>
     <div className="quiz-layout quiz-playful">
   <div className="quiz-card">
    <div className="quiz-question-scroll" key={state.session_id+':'+state.index}>
    <div className="quiz-playful-question"><div><h2>{question.text}</h2><p className="question-hint">Pilih satu jawaban yang paling tepat.</p></div></div>
    {question.image_path&&imageUrls.get(question.image_path)&&<button type="button" className="quiz-visual-figure quiz-focus-figure-zoom" onClick={()=>setFigureOpen(true)} aria-label="Perbesar gambar soal">
      <img src={imageUrls.get(question.image_path)} alt="Gambar soal numerasi" loading="eager"/>
      <span className="quiz-focus-zoom-label"><ZoomIn size={15}/> Perbesar gambar</span>
    </button>}
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
    </div>
    <div className="quiz-footer"><span>Jawaban diperiksa server. Jawaban terkirim tidak bisa diubah.</span>
      <button className="btn primary" disabled={selected===null||sending||!!feedback||remaining<=0} onClick={()=>void submit()}>
        {sending?'Memverifikasi...':'Kirim jawaban'} <ArrowRight size={16}/></button></div>
   </div>
     </div>
    </main>
    {monitorOpen&&<button type="button" className="quiz-focus-monitor-backdrop" aria-label="Tutup daftar soal" onClick={()=>setMonitorOpen(false)}/>}
    <aside id="quiz-focus-monitor" className={'quiz-focus-monitor '+(monitorOpen?'is-open':'')} aria-label="Monitoring status soal">
      <button type="button" className="quiz-focus-monitor-close" onClick={()=>setMonitorOpen(false)} aria-label="Tutup daftar soal"><X size={19}/></button>
      <div className="quiz-focus-monitor-heading"><span className="quiz-focus-monitor-icon"><Grid2X2 size={21}/></span><div><small>NAVIGASI</small><strong>Daftar soal</strong><span>Monitoring, bukan untuk lompat soal</span></div></div>
      <div className="quiz-focus-monitor-counts">
        <div className="is-correct"><strong>{liveProgress?.correct??'—'}</strong><small>Benar</small></div>
        <div className="is-wrong"><strong>{liveProgress?.wrong??'—'}</strong><small>Salah</small></div>
        <div className="is-remaining"><strong>{monitorRemaining}</strong><small>Tersisa</small></div>
        <div className="is-timeout"><strong>{liveProgress?.timeout??'—'}</strong><small>Timeout</small></div>
      </div>
      <div className="quiz-focus-monitor-grid" role="list" aria-label="Status nomor soal">
        {Array.from({length:state.total},(_,index)=>{
          const status=finishedStatuses[index];
          const current=index===currentIndex;
          const kind=status==='BENAR'?'is-correct':status==='SALAH'?'is-wrong':status==='TIMEOUT'?'is-timeout':current?'is-active':'is-pending';
          const textStatus=status==='BENAR'?'benar':status==='SALAH'?'salah':status==='TIMEOUT'?'timeout':current?'aktif':'belum dikerjakan';
          return <span role="listitem" aria-current={current?'step':undefined} title={'Soal '+(index+1)+': '+textStatus} className={'quiz-focus-number '+kind} key={index}>{index+1}</span>;
        })}
      </div>
      <div className="quiz-focus-monitor-legend"><span><i className="is-active"/>Aktif</span><span><i className="is-correct"/>Benar</span><span><i className="is-wrong"/>Salah</span><span><i className="is-timeout"/>Timeout</span></div>
      <div className="quiz-focus-monitor-assurance"><ShieldCheck size={15}/><span>Jawaban dan waktu dikendalikan server. Nomor yang selesai tidak dapat diubah.</span></div>
    </aside>
   </div>
   {figureOpen&&question.image_path&&imageUrls.get(question.image_path)&&<div className="quiz-focus-image-modal" role="dialog" aria-modal="true" aria-label="Gambar soal diperbesar">
     <button type="button" className="quiz-focus-image-modal-backdrop" onClick={()=>setFigureOpen(false)} aria-label="Tutup gambar soal yang diperbesar"/>
     <button type="button" className="quiz-focus-image-modal-close" onClick={()=>setFigureOpen(false)} aria-label="Tutup gambar"><X size={23}/></button>
     <img src={imageUrls.get(question.image_path)} alt="Gambar soal berukuran besar"/>
   </div>}
 </div>;
}
