'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,Clock3,RefreshCw,XCircle} from 'lucide-react';
import '@/app/quiz-playful.css';
import {supabase} from '@/lib/supabase';
import {buildQuiz,fetchBank,makeAttempt} from '@/lib/quiz';
import type {Attempt,SessionQuestion,StudentProfile} from '@/lib/types';

type QuizFeedback={questionId:number;correct:boolean;selectedIndex:number;until:number};
type QuizState={questions:SessionQuestion[];index:number;answers:Record<number,number|null>;selected:number|null; startedAt:number;deadline:number;totalDeadline:number;category:string|null;
  sessionKey?:string;questionStartedAt?:number;responseSeconds?:Record<number,number>;feedback?:QuizFeedback|null;};
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
   try {const pending=sessionStorage.getItem(pendingKey(profile.authId));if(pending){const attempt=JSON.parse(pending) as Attempt;if(attempt.auth_user_id===profile.authId&&attempt.session_key){const original=safeRestore(profile);if(original)setState(original);setCompleted(attempt);setNow(Date.now());setLoading(false);return;}}}catch{}
   const existing=safeRestore(profile);
   if(existing&&existing.category===category){setState(existing);setNow(Date.now());setLoading(false);return;}
   try {const bank=await fetchBank();if(!alive)return;
     const qs=buildQuiz(bank,category);const startTime=Date.now();
     const initial:QuizState={questions:qs,index:0,answers:{},selected:null,startedAt:startTime,
       deadline:startTime+qs[0].timeLimitSeconds*1000,totalDeadline:startTime+qs.reduce((sum,q)=>sum+q.timeLimitSeconds,0)*1000,category,sessionKey:crypto.randomUUID(),questionStartedAt:startTime,responseSeconds:{},feedback:null};
     setNow(startTime);setState(initial);
   }catch(e){if(alive)setError(e instanceof Error?e.message:'Bank soal tidak dapat dibuka.');}
   if(alive)setLoading(false);
  }void start();return()=>{alive=false;};
 },[profile,category]);
 useEffect(()=>{if(state)try{sessionStorage.setItem(key(profile.authId),JSON.stringify(state));}catch{}},[state,profile]);
 const processTimeouts=useCallback((current:QuizState,time:number):QuizState=>{
    if(current.index>=current.questions.length)return current;
    let next=current;
    // Mobile parity: expired overall session closes all unanswered questions.
    if(time>=next.totalDeadline){
      const answers={...next.answers};const seconds={...next.responseSeconds};
      for(let i=next.index;i<next.questions.length;i++){
        const q=next.questions[i];
        if(answers[q.id]===undefined){answers[q.id]=null;seconds[q.id]=q.timeLimitSeconds;}
      }
      return {...next,index:next.questions.length,answers,responseSeconds:seconds,selected:null,feedback:null};
    }
    // Android shows one second of correctness feedback after committing a response.
    // The next question starts at feedback.until, never at the time the interval happens to fire.
    if(next.feedback){
      if(time<next.feedback.until)return next;
      const start=next.feedback.until;
      const n=next.index+1;
      next={...next,index:n,feedback:null,selected:null,questionStartedAt:start,
        deadline:n<next.questions.length?start+next.questions[n].timeLimitSeconds*1000:next.deadline};
    }
    // A suspended/background tab must not get free time for expired questions.
    while(next.index<next.questions.length&&time>=next.deadline){
      const q=next.questions[next.index],answers={...next.answers},seconds={...next.responseSeconds};
      if(answers[q.id]===undefined){answers[q.id]=null;seconds[q.id]=q.timeLimitSeconds;}
      const n=next.index+1;
      const start=next.deadline;
      next={...next,index:n,answers,responseSeconds:seconds,selected:null,feedback:null,questionStartedAt:start,
        deadline:n<next.questions.length?start+next.questions[n].timeLimitSeconds*1000:next.deadline};
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
 const remaining=current&&state&&!state.feedback?Math.max(0,Math.min(Math.ceil((state.deadline-now)/1000),Math.ceil((state.totalDeadline-now)/1000))):0;
 const totalRemaining=state?Math.max(0,Math.ceil((state.totalDeadline-now)/1000)):0;
 const progress=state?Math.min(100,Math.round(state.index/state.questions.length*100)):0;
 function submit(){
   const submittedAt=Date.now();
   setNow(submittedAt);
   setState(prev=>{
     if(!prev||prev.index>=prev.questions.length||prev.feedback||prev.selected===null)return prev;
     const checked=processTimeouts(prev,submittedAt);
     // A late click cannot count after the question or session timer has expired.
     if(checked.index!==prev.index||checked.feedback||submittedAt>=prev.deadline)return checked;
     const q=prev.questions[prev.index];
     const spent=Math.min(q.timeLimitSeconds,Math.max(0,Math.floor((submittedAt-(prev.questionStartedAt??(prev.deadline-q.timeLimitSeconds*1000)))/1000)));
     return {...prev,answers:{...prev.answers,[q.id]:prev.selected},responseSeconds:{...prev.responseSeconds,[q.id]:spent},
       feedback:{questionId:q.id,correct:prev.selected===q.answerIndex,selectedIndex:prev.selected,until:submittedAt+1000},
       totalDeadline:prev.totalDeadline+1000};
   });
 }
 const syncAttempt=useCallback(async(attempt:Attempt)=>{
   setSync('saving');setSyncError('');
   const {error}=await supabase().from('student_attempts').upsert(attempt,{onConflict:'auth_user_id,session_key',ignoreDuplicates:true});
   if(error){setSync('failed');setSyncError(error.message);return;}
   const {data, error:checkError}=await supabase().from('student_attempts').select('session_key').eq('auth_user_id',profile.authId).eq('session_key',attempt.session_key).maybeSingle();
   if(checkError||!data){setSync('failed');setSyncError('Sesi belum terverifikasi di Supabase. Silakan ulangi.');return;}
   try{sessionStorage.removeItem(key(profile.authId));sessionStorage.removeItem(pendingKey(profile.authId));}catch{}
   setSync('saved');
 },[profile]);
 useEffect(()=>{if(!state||state.index<state.questions.length||alreadyFinalized.current||completed)return;
   alreadyFinalized.current=true;const attempt=makeAttempt(profile,state.questions,state.answers,state.startedAt,state.category,history,state.sessionKey,state.responseSeconds);
   try{sessionStorage.setItem(pendingKey(profile.authId),JSON.stringify(attempt));}catch{}
   setCompleted(attempt);void syncAttempt(attempt);
 },[state,profile,history,syncAttempt,completed]);
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
      <div className="answers">{current.options.map((option,i)=>{
        const selected=(state.feedback?.selectedIndex??state.selected)===i;
        return <button type="button" key={i} aria-pressed={selected} disabled={!!state.feedback||remaining<=0}
          className={'answer '+(selected?'chosen ':'')+(selected&&state.feedback?(state.feedback.correct?'feedback-correct':'feedback-wrong'):'')}
          onClick={()=>setState(prev=>prev&&!prev.feedback?{...prev,selected:i}:prev)}>
          <span className="answer-letter">{String.fromCharCode(65+i)}</span><span>{option}</span>{selected&&<CheckCircle2 size={18}/>}
        </button>;
      })}</div>
      {state.feedback&&<div role="status" aria-live="polite" className={'quiz-answer-feedback '+(state.feedback.correct?'correct':'wrong')}>
        <b>{state.feedback.correct?'✓ Jawaban kamu BENAR!':'✕ Jawaban kamu SALAH.'}</b><span>Soal berikutnya segera tampil…</span>
      </div>}
      <div className="quiz-footer"><span>Jawaban yang dikirim tidak dapat diubah.</span><button className="btn primary" disabled={state.selected===null||!!state.feedback||remaining<=0} onClick={submit}>Kirim jawaban <ArrowRight size={16}/></button></div>
   </div><p className="quiz-footnote">Sistem menggunakan batas waktu tiap soal. Saat waktu habis, sistem berpindah otomatis ke soal berikutnya.</p>
 </div>;
}
