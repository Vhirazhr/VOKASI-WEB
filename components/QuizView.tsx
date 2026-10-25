'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,Clock3,RefreshCw,XCircle} from 'lucide-react';
import '@/app/quiz-playful.css';
import {supabase} from '@/lib/supabase';
import {buildQuiz,fetchBank,makeAttempt} from '@/lib/quiz';
import type {Attempt,SessionQuestion,StudentProfile} from '@/lib/types';

type QuizState={questions:SessionQuestion[];index:number;answers:Record<number,number|null>;selected:number|null; startedAt:number;deadline:number;totalDeadline:number;category:string|null;};
const key=(id:string)=>`vokasi-web-quiz-${id}`;
const pendingKey=(id:string)=>`vokasi-web-pending-${id}`;
const textClock=(seconds:number)=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
function safeRestore(profile:StudentProfile):QuizState|null {try {const raw=sessionStorage.getItem(key(profile.authId));if(!raw)return null;
  const state=JSON.parse(raw) as QuizState;
  if(!Array.isArray(state.questions)||![10,100].includes(state.questions.length)||!Number.isFinite(state.totalDeadline)||!Number.isFinite(state.startedAt)||state.index<0||state.index>state.questions.length) return null;
  return state;
}catch{return null;}}

export default function QuizView({profile,category,history,onDone,onQuit}:{profile:StudentProfile;category:string|null;history:Attempt[];onDone:()=>void;onQuit:()=>void}) {
 const [state,setState]=useState<QuizState|null>(null);const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');const [now,setNow]=useState(0);const [completed,setCompleted]=useState<Attempt|null>(null);
 const [sync,setSync]=useState<'idle'|'saving'|'saved'|'failed'>('idle');const [syncError,setSyncError]=useState('');
 const alreadyFinalized=useRef(false);
 useEffect(()=>{let alive=true;async function start(){
   // Resume an already graded attempt with the SAME session UUID after refresh.
   try {const pending=sessionStorage.getItem(pendingKey(profile.authId));if(pending){const attempt=JSON.parse(pending) as Attempt;if(attempt.auth_user_id===profile.authId&&attempt.session_key){setCompleted(attempt);setLoading(false);return;}}}catch{}
   const existing=safeRestore(profile);
   if(existing&&existing.category===category){setState(existing);setLoading(false);return;}
   try {const bank=await fetchBank();if(!alive)return;
     const qs=buildQuiz(bank,category);const startTime=Date.now();
     const initial:QuizState={questions:qs,index:0,answers:{},selected:null,startedAt:startTime,
       deadline:startTime+qs[0].timeLimitSeconds*1000,totalDeadline:startTime+qs.reduce((sum,q)=>sum+q.timeLimitSeconds,0)*1000,category};
     setState(initial);
   }catch(e){if(alive)setError(e instanceof Error?e.message:'Bank soal tidak dapat dibuka.');}
   if(alive)setLoading(false);
  }void start();return()=>{alive=false;};
 },[profile,category]);
 useEffect(()=>{if(state)try{sessionStorage.setItem(key(profile.authId),JSON.stringify(state));}catch{}},[state,profile]);
 const processTimeouts=useCallback((current:QuizState,time:number):QuizState=>{
    if(current.index>=current.questions.length) return current;
    let next=current;
    // Each expired question consumes its allotted time, including during tab suspension.
    while(next.index<next.questions.length&&(time>=next.deadline||time>=next.totalDeadline)){
      const q=next.questions[next.index];const answers={...next.answers,[q.id]:null};
      const nextIndex=next.index+1;
      next={...next,index:nextIndex,answers,selected:null,
        deadline:nextIndex<next.questions.length?next.deadline+next.questions[nextIndex].timeLimitSeconds*1000:next.deadline};
    }
    return next;
 },[]);
 const ticking=state!==null&&completed===null;
 useEffect(()=>{
   if(!ticking)return;
   const id=window.setInterval(()=>{
     const timestamp=Date.now();
     setNow(timestamp);
     setState(prev=>prev?processTimeouts(prev,timestamp):prev);
   },250);
   return()=>clearInterval(id);
 },[ticking,processTimeouts]);
 const current=state?.questions[state.index];
 const remaining=current&&state?Math.max(0,Math.min(Math.ceil((state.deadline-now)/1000),Math.ceil((state.totalDeadline-now)/1000))):0;
 const totalRemaining=state?Math.max(0,Math.ceil((state.totalDeadline-now)/1000)):0;
 const progress=state?Math.min(100,Math.round(state.index/state.questions.length*100)):0;
 function submit(){setState(prev=>{
   if(!prev || prev.index>=prev.questions.length||prev.selected===null)return prev;
   const q=prev.questions[prev.index];const n=prev.index+1;
   return {...prev,answers:{...prev.answers,[q.id]:prev.selected},selected:null,index:n,
     deadline:n<prev.questions.length?Date.now()+prev.questions[n].timeLimitSeconds*1000:prev.deadline};
 });}
 const syncAttempt=useCallback(async(attempt:Attempt)=>{
   setSync('saving');setSyncError('');
   const {error}=await supabase().from('student_attempts').upsert(attempt,{onConflict:'auth_user_id,session_key',ignoreDuplicates:true});
   if(error){setSync('failed');setSyncError(error.message);return;}
   const {data, error:checkError}=await supabase().from('student_attempts').select('session_key').eq('auth_user_id',profile.authId).eq('session_key',attempt.session_key).maybeSingle();
   if(checkError||!data){setSync('failed');setSyncError('Sesi belum terverifikasi di Supabase. Silakan ulangi.');return;}
   try{sessionStorage.removeItem(key(profile.authId));sessionStorage.removeItem(pendingKey(profile.authId));}catch{}
   setSync('saved');
 },[profile]);
 useEffect(()=>{if(!state||state.index<state.questions.length||alreadyFinalized.current)return;
   alreadyFinalized.current=true;const attempt=makeAttempt(profile,state.questions,state.answers,state.startedAt,state.category,history);
   try{sessionStorage.setItem(pendingKey(profile.authId),JSON.stringify(attempt));}catch{}
   setCompleted(attempt);void syncAttempt(attempt);
 },[state,profile,history,syncAttempt]);
 useEffect(()=>{if(completed&&sync==='idle')queueMicrotask(()=>void syncAttempt(completed));},[completed,sync,syncAttempt]);
 function quit(){if(!window.confirm('Keluar dari latihan? Progres akan tetap tersimpan di browser ini.'))return;onQuit();}
 const answeredCount=state?.index||0;
 if(loading) return <section className="white-panel center-message">Menyiapkan latihan VOKASI...</section>;
 if(error) return <section className="white-panel center-message"><XCircle size={35} className="error-icon"/><h2>Belum bisa memulai latihan</h2><p>{error}</p><button className="btn secondary" onClick={onQuit}>Kembali</button></section>;
 if(completed) return <section className="result-view quiz-playful-result"><div className="result-icon"><CheckCircle2 size={38}/></div><span className="section-kicker">LATIHAN TELAH SELESAI</span><h2>Hebat, kamu berhasil menyelesaikan latihan!</h2><div className="result-score">{completed.score}<small>/100</small></div>
   <div className="result-stats"><div><b>{completed.correct}</b><span>Jawaban benar</span></div><div><b>{completed.question_count}</b><span>Total soal</span></div><div><b>+{completed.earned_xp}</b><span>XP didapat</span></div></div>
   <div className={'alert '+(sync==='saved'?'success':sync==='failed'?'danger':'info')}>
     {sync==='saved'?'Nilai sudah TERVERIFIKASI dan tersimpan di Supabase.':sync==='failed'?`Nilai belum terkirim: ${syncError}`:'Mengirim dan memverifikasi nilai di Supabase...'}
   </div><div className="result-actions">{sync==='failed'&&<button className="btn secondary" onClick={()=>void syncAttempt(completed)}><RefreshCw size={17}/> Coba sinkronkan lagi</button>}
   <button className="btn primary" disabled={sync!=='saved'} onClick={onDone}>Kembali ke dashboard <ArrowRight size={16}/></button></div>
   {sync==='failed'&&<p className="muted-small">Jangan hapus data browser sebelum nilai tersimpan. Penyelesaian latihan tetap ada untuk dicoba ulang pada sesi ini.</p>}
 </section>;
 if(!state||!current)return <div className="white-panel center-message">Menyiapkan halaman soal...</div>;
 return <div className="quiz-layout quiz-playful"><div className="quiz-header"><button className="back-button" onClick={quit}><ArrowLeft size={18}/> Keluar latihan</button><span className="quiz-topic">{state.category||'Latihan Wajib'}</span></div>
   <div className="quiz-progress"><div className="quiz-progress-label"><span>Soal <b>{answeredCount+1}</b> dari {state.questions.length}</span><span>{progress}% selesai</span></div><div className="progress-track"><div style={{width:progress+'%'}}/></div></div>
   <div className="quiz-card"><div className="quiz-playful-deco" aria-hidden="true"><span className="quiz-playful-deco-icon">✦</span> VOKASI PLAY MODE <span className="quiz-playful-deco-spark">✧</span></div><div className="quiz-card-head"><span className="question-type">PERTANYAAN {answeredCount+1}</span><div className="time-group"><span className={remaining<=5?'timer urgent':'timer'}><Clock3 size={17}/> {textClock(remaining)}</span><span className="total-time">Total: {textClock(totalRemaining)}</span></div></div>
      <div className="quiz-playful-question"><div><h2>{current.question}</h2><p className="question-hint">Pilih satu jawaban yang paling tepat.</p></div><div className="quiz-playful-mascot" aria-hidden="true"><span className="quiz-mascot-face"><i/><i/></span><span className="quiz-mascot-grin"/></div></div>
      <div className="answers">{current.options.map((option,i)=><button key={i} aria-pressed={state.selected===i} className={'answer '+(state.selected===i?'chosen':'')} onClick={()=>setState(prev=>prev?{...prev,selected:i}:prev)}><span className="answer-letter">{String.fromCharCode(65+i)}</span><span>{option}</span>{state.selected===i&&<CheckCircle2 size={18}/>}</button>)}</div>
      <div className="quiz-footer"><span>Jawaban yang dikirim tidak dapat diubah.</span><button className="btn primary" disabled={state.selected===null} onClick={submit}>Kirim jawaban <ArrowRight size={16}/></button></div>
   </div><p className="quiz-footnote">Sistem menggunakan batas waktu tiap soal. Saat waktu habis, sistem berpindah otomatis ke soal berikutnya.</p>
 </div>;
}
