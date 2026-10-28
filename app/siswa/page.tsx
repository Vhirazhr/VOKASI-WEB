'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Atom, BookOpen, Brain, Calculator, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Divide, GraduationCap, History, Image as ImageIcon, Lightbulb, Medal, Megaphone, Play, RefreshCw, Search, Shapes, ShieldCheck, Sigma, Star, Target, TrendingUp, Trophy } from 'lucide-react';
import AppShell from '@/components/AppShell';
import StudentAvatar from '@/components/StudentAvatar';
import StudentProfileDashboard from '@/components/StudentProfileDashboard';
import QuizView from '@/components/QuizView';
import ReviewHistory from '@/components/ReviewHistory';
import StudentReportDownload from '@/components/StudentReportDownload';
import {getPublishedBankVersion,PRACTICE_CATEGORIES} from '@/lib/quiz';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {getOwnAttempts,getLeaderboard,officialMandatoryAttempts,wibDate} from '@/lib/school';
import {getSchoolAvatarUrls} from '@/lib/student-avatar';
import {getWeakTopicInsights,rankRecommendedTopics,topicInsight} from '@/lib/student-insights';
import type {TopicInsight} from '@/lib/student-insights';
import type {Attempt,LeaderboardEntry,StudentProfile} from '@/lib/types';
import '@/app/student-experience.css';
import '@/app/student-unified-ui.css';
import '@/app/student-ranking-reference.css';
import '@/app/student-learning-extras.css';

const categories=[...PRACTICE_CATEGORIES];
const toDay=(ms:number)=>new Intl.DateTimeFormat('id-ID',{dateStyle:'long',timeZone:'Asia/Jakarta'}).format(new Date(ms));
const toTime=(seconds:number)=>seconds>=60?Math.floor(seconds/60)+' mnt '+Math.floor(seconds%60)+' dtk':Math.floor(seconds||0)+' dtk';
type PageView='home'|'history'|'ranking'|'profile';

function StudentHeading({kicker,title,description}:{kicker:string;title:string;description:string}) {
  return <header className="student-section-hero" aria-label={title}>
    <div className="student-section-hero-copy"><span className="section-kicker">{kicker}</span><h1>{title}</h1><p>{description}</p></div>
    <div className="student-section-hero-icon" aria-hidden="true"><GraduationCap size={45}/><span>VOKASI</span></div>
  </header>;
}

function HistoryView({attempts,busy,profile}:{attempts:Attempt[];busy:boolean;profile:StudentProfile}) {
  const [kind,setKind]=useState('all');
  const [date,setDate]=useState('');
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(0);
  const officialKeys=useMemo(()=>new Set(officialMandatoryAttempts(attempts).map(a=>a.session_key)),[attempts]);
  const filtered=useMemo(()=>attempts
    .filter(a=>(kind==='all'||(kind==='mandatory'?a.practice_category===null:a.practice_category!==null))&&(!date||wibDate(a.completed_at_ms)===date))
    .filter(a=>!query||(a.practice_category||'Latihan wajib').toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b)=>b.completed_at_ms-a.completed_at_ms),[attempts,kind,date,query]);
  const perPage=10;
  const pages=Math.max(1,Math.ceil(filtered.length/perPage));
  const currentPage=Math.min(page,pages-1);
  const rows=filtered.slice(currentPage*perPage,(currentPage+1)*perPage);
  return <div className="student-experience">
    <StudentHeading kicker="JEJAK BELAJAR" title="Riwayat latihan" description="Semua sesi yang tersimpan di akunmu, lengkap dengan nilai dan waktu pengerjaannya."/>
    <div className="student-panel student-history-panel">
      <div className="student-filter-bar">
        <label>Jenis latihan<select value={kind} onChange={e=>{setKind(e.target.value);setPage(0);}}><option value="all">Semua jenis</option><option value="mandatory">Latihan wajib</option><option value="practice">Latihan mandiri</option></select></label>
        <label>Tanggal<input type="date" value={date} onChange={e=>{setDate(e.target.value);setPage(0);}}/></label>
        <label>Cari materi<input placeholder="Contoh: Perkalian" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
        <button type="button" className="student-clear-btn" onClick={()=>{setKind('all');setDate('');setQuery('');setPage(0);}}>Reset filter</button>
      </div>
      <div className="student-list-caption">{busy?'Memuat riwayat...':filtered.length+' sesi ditemukan'}</div>
      {busy?<div className="student-blank"><RefreshCw size={23}/> Memuat hasil dari Supabase...</div>:
       rows.length===0?<div className="student-blank"><History size={34}/><b>Belum ada sesi untuk filter ini</b><span>Kerjakan latihan atau ubah filter untuk melihat sesi lain.</span></div>:
       <div className="student-session-list">{rows.map((a)=><details key={a.session_key} className="student-session-card">
         <summary><span className="student-session-icon"><BookOpen size={20}/></span><span className="student-session-main"><b>{a.practice_category||'Latihan wajib'}</b><small>{toDay(a.completed_at_ms)} • {toTime(a.seconds_spent)} • {a.question_count} soal</small></span><span className="student-session-score">{a.score}<small>/100</small><small>{a.signature?.startsWith('WEB-SERVER-v1:')?'Terverifikasi':'Riwayat lama · belum terverifikasi'}</small>{a.practice_category===null&&a.signature?.startsWith('WEB-SERVER-v1:')&&<small>{officialKeys.has(a.session_key)?'Nilai resmi harian':'Pengulangan · tidak mengubah nilai resmi'}</small>}</span><span className="student-session-open">Detail <ArrowRight size={15}/></span></summary>
         <div className="student-session-detail"><div><span>Jawaban benar</span><strong>{a.correct}</strong></div><div><span>Jumlah terjawab</span><strong>{a.answered}</strong></div><div><span>XP sesi</span><strong>+{a.earned_xp}</strong></div><div><span>Durasi</span><strong>{toTime(a.seconds_spent)}</strong></div></div>
         <div className="student-history-download"><StudentReportDownload profile={profile} attempt={a} official={a.practice_category===null&&officialKeys.has(a.session_key)}/></div>
         {a.signature?.startsWith('WEB-SERVER-v1:')&&<ReviewHistory sessionId={a.session_key}/>}
         {a.review_summary?.length>0&&<div className="student-answer-summary"><b>Ringkasan status jawaban</b><p>Status diambil dari catatan sesi yang sudah selesai.</p><div>{a.review_summary.slice(0,100).map((answer,j)=><span key={j} title={'Soal '+(j+1)+': '+answer.status} className={'student-answer-dot '+(/^(BENAR|CORRECT|RIGHT)$/i.test(answer.status)?'is-correct':/^(TIMEOUT)$/i.test(answer.status)?'is-timeout': 'is-other')}>{j+1}</span>)}</div></div>}
       </details>)}</div>}
      <div className="student-list-footer"><span>Halaman {currentPage+1} dari {pages}</span><div><button type="button" className="btn secondary small" disabled={currentPage===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>Sebelumnya</button><button type="button" className="btn secondary small" disabled={currentPage>=pages-1} onClick={()=>setPage(p=>p+1)}>Berikutnya</button></div></div>
    </div>
  </div>;
}

function RankingView({leaders,profile,busy,failed,avatarUrls}:{leaders:LeaderboardEntry[];profile:StudentProfile;busy:boolean;failed:boolean;avatarUrls:Record<string,string>}) {
  const [scope,setScope]=useState('school');
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<{student:LeaderboardEntry;rank:number}|null>(null);
  const normalized=(value:string)=>value.trim().toLocaleLowerCase('id-ID');
  const visible=useMemo(()=>leaders.filter(a=>(scope==='school'||(scope==='class'?a.classroom===profile.className:a.major===profile.majorName))&&(query.trim()===''||[a.display_name,a.classroom,a.major].some(v=>normalized(v).includes(normalized(query))))),[leaders,scope,query,profile.className,profile.majorName]);
  const podium=[{student:visible[1],rank:2},{student:visible[0],rank:1},{student:visible[2],rank:3}];
  const ownIndex=visible.findIndex(a=>normalized(a.username)===normalized(profile.username));
  const bestScore=leaders.length?Math.max(...leaders.map(row=>row.mandatory_average??0)):null;
  const totalDays=leaders.reduce((sum,row)=>sum+row.mandatory_days,0);
  const avatar=(entry:LeaderboardEntry)=>avatarUrls[normalized(entry.username)]||'';
  useEffect(()=>{
    if(!selected)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelected(null);};
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[selected]);
  return <div className="student-experience student-ranking-experience vokasi-leaderboard">
    <header className="vokasi-ranking-hero">
      <div className="vokasi-ranking-hero-copy">
        <span className="vokasi-ranking-hero-kicker"><Star size={15}/> VOKASI LEADERBOARD</span>
        <h1>Temukan posisi terbaikmu.</h1>
        <p>Konsistensi kecil hari ini adalah prestasi besar esok hari. Lihat pencapaian siswa berdasarkan nilai latihan wajib yang terverifikasi.</p>
        <div className="vokasi-ranking-hero-stats">
          <div><strong>{busy?'—':leaders.length}</strong><small>SISWA TERPERINGKAT</small></div>
          <div><strong>{busy?'—':totalDays}</strong><small>HARI LATIHAN TERCATAT</small></div>
          <div><strong>{busy?'—':bestScore??'—'}</strong><small>NILAI TERTINGGI</small></div>
        </div>
      </div>
      <div className="vokasi-ranking-trophy" aria-hidden="true">
        <div className="vokasi-ranking-trophy-glow"/>
        <div className="vokasi-ranking-cup"><span className="vokasi-ranking-cup-star">★</span><span className="vokasi-ranking-cup-handle left"/><span className="vokasi-ranking-cup-handle right"/><span className="vokasi-ranking-cup-stem"/><span className="vokasi-ranking-cup-base"/></div>
      </div>
    </header>
    <div className="vokasi-ranking-controls">
      <div className="student-segments" role="group" aria-label="Lingkup peringkat">
        {[{id:'school',label:'Sekolah'},{id:'major',label:'Jurusan'},{id:'class',label:'Kelas'}].map(item=><button key={item.id} type="button" className={scope===item.id?'active':''} aria-pressed={scope===item.id} onClick={()=>{setScope(item.id);setQuery('');}}>{item.label}</button>)}
      </div>
      <label className="student-ranking-search"><Search size={16}/><input aria-label="Cari nama siswa atau kelas" placeholder="Cari nama atau kelas..." value={query} onChange={e=>setQuery(e.target.value)}/></label>
    </div>
    <section className="vokasi-ranking-stage" aria-label="Papan peringkat">
      <div className="vokasi-ranking-stage-heading">
        <div><span>TOP PERFORMERS</span><h2>Podium terbaik <em>{scope==='school'?'sekolah':scope==='major'?'jurusan':'kelas'}</em></h2></div>
        <span className="vokasi-ranking-verification"><CheckCircle2 size={14}/> Nilai diverifikasi server</span>
      </div>
      {busy?<div className="vokasi-ranking-stage-empty"><RefreshCw size={28}/><b>Memuat papan peringkat...</b></div>:
       failed?<div className="vokasi-ranking-stage-empty"><Trophy size={36}/><b>Peringkat belum dapat dimuat</b><p>Data Supabase belum dapat diakses. Coba lagi saat koneksi membaik.</p></div>:
       !visible.length?<div className="vokasi-ranking-stage-empty"><Trophy size={38}/><b>{query?'Siswa tidak ditemukan':'Belum ada peringkat resmi'}</b><p>{query?'Coba gunakan nama atau kelas lain.':'Peringkat akan muncul setelah siswa menyelesaikan latihan wajib yang nilainya dihitung server. Hasil lama tetap ada di Riwayat.'}</p></div>:
       <>
        <div className="vokasi-ranking-podium">
          <div className="vokasi-ranking-podium-grid">
            {podium.map(({student,rank})=>student?
              <button type="button" className={'vokasi-ranking-podium-card vokasi-ranking-podium-'+rank} key={student.username} onClick={()=>setSelected({student,rank})} aria-label={'Lihat detail '+student.display_name+' peringkat '+rank}>
                <span className="vokasi-ranking-card-rank"><Trophy size={15}/> #{rank}</span>
                <span className="vokasi-ranking-photo-frame">
                  <StudentAvatar name={student.display_name} url={avatar(student)} className="vokasi-ranking-photo" size={126}/>
                  <span className="vokasi-ranking-photo-badge">{rank}</span>
                  <span className="vokasi-deco-spark vokasi-deco-spark-one" aria-hidden="true">✦</span>
                  <span className="vokasi-deco-spark vokasi-deco-spark-two" aria-hidden="true">✧</span>
                  <span className="vokasi-deco-spark vokasi-deco-spark-three" aria-hidden="true">✦</span>
                </span>
                <span className="vokasi-ranking-card-subtitle">{rank===1?'CHAMPION':'TOP PERFORMER'}</span>
                <span className="vokasi-ranking-card-score-label">NILAI RATA-RATA</span>
                <span className="vokasi-ranking-card-score">{student.mandatory_average}<small>/100</small></span>
                <strong className="vokasi-ranking-card-name">{student.display_name}</strong>
                <span className="vokasi-ranking-card-class">{student.classroom} · {student.major}</span>
                <span className="vokasi-ranking-detail-button">Lihat detail</span>
              </button>:
              <div key={rank} className={'vokasi-ranking-podium-placeholder vokasi-ranking-placeholder-'+rank}><Trophy size={30}/><span>Belum ada juara {rank}</span></div>)}
          </div>
          <div className="vokasi-ranking-podium-base" aria-hidden="true"><span>02</span><span>01</span><span>03</span></div>
        </div>
        <div className="vokasi-ranking-list" aria-label="Peringkat siswa berikutnya">
          <div className="vokasi-ranking-list-header"><span>POSISI</span><span>SISWA</span><span>KELAS</span><span>PROGRES NILAI</span><span>NILAI</span></div>
          {visible.slice(3).length?visible.slice(3).map((student,index)=>{
            const rank=index+4;const score=student.mandatory_average??0;
            return <button key={student.username} type="button" className={'vokasi-ranking-list-row '+(normalized(student.username)===normalized(profile.username)?'is-self':'')} onClick={()=>setSelected({student,rank})}>
              <strong className="vokasi-ranking-row-position">#{rank}</strong>
              <span className="vokasi-ranking-row-student">
                <StudentAvatar name={student.display_name} url={avatar(student)} className="vokasi-ranking-row-photo" size={44}/>
                <span className="vokasi-ranking-row-identity"><b>{student.display_name}</b><small>{student.major}{normalized(student.username)===normalized(profile.username)?' · Kamu':''}</small></span>
              </span>
              <span className="vokasi-ranking-class-pill">{student.classroom}</span>
              <span className="vokasi-ranking-progress"><progress value={Math.max(0,Math.min(100,score))} max={100}/><small>{score}/100</small></span>
              <strong className="vokasi-ranking-row-score">{score}</strong>
            </button>;
          }):<div className="vokasi-ranking-list-empty">Belum ada siswa di luar tiga peringkat teratas.</div>}
        </div>
        <div className="vokasi-ranking-own-position"><Medal size={17}/>{ownIndex>=0?'Peringkatmu: #'+(ownIndex+1)+' dari '+visible.length+' siswa pada filter ini.':'Peringkatmu belum ada pada lingkup ini. Kerjakan latihan wajib untuk mulai mendapat peringkat.'}</div>
       </>}
    </section>
    {selected&&<div className="vokasi-ranking-modal-backdrop" role="presentation" onMouseDown={()=>setSelected(null)}>
      <section className="vokasi-ranking-modal" role="dialog" aria-modal="true" aria-labelledby="vokasi-ranking-modal-title" onMouseDown={event=>event.stopPropagation()}>
        <button className="vokasi-ranking-modal-close" type="button" onClick={()=>setSelected(null)} aria-label="Tutup detail">×</button>
        <div className="vokasi-ranking-modal-banner">
          <span><Trophy size={16}/> Peringkat #{selected.rank}</span>
          <StudentAvatar name={selected.student.display_name} url={avatar(selected.student)} className="vokasi-ranking-modal-photo" size={125}/>
        </div>
        <div className="vokasi-ranking-modal-content">
          <small>PROFIL PERINGKAT SISWA</small><h2 id="vokasi-ranking-modal-title">{selected.student.display_name}</h2>
          <p>{selected.student.classroom} · {selected.student.major}</p>
          <div className="vokasi-ranking-modal-stats">
            <span><small>Rata-rata nilai</small><b>{selected.student.mandatory_average}/100</b></span>
            <span><small>Hari latihan wajib</small><b>{selected.student.mandatory_days}</b></span>
          </div>
          <p className="vokasi-ranking-modal-note"><ShieldCheck size={16}/> Nilai dari latihan wajib yang sudah diverifikasi server.</p>
        </div>
      </section>
    </div>}
  </div>;
}

function getWibCalendarParts(){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jakarta',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date());
  return {year:Number(parts.find(p=>p.type==='year')?.value||2026),month:Number(parts.find(p=>p.type==='month')?.value||1),day:Number(parts.find(p=>p.type==='day')?.value||1)};
}

function StudentCalendar(){
  const [cursor,setCursor]=useState(()=>{const now=getWibCalendarParts();return new Date(Date.UTC(now.year,now.month-1,1));});
  const today=getWibCalendarParts();
  const year=cursor.getUTCFullYear();
  const month=cursor.getUTCMonth();
  const firstDay=new Date(Date.UTC(year,month,1)).getUTCDay();
  const dayCount=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  const cellCount=Math.ceil((firstDay+dayCount)/7)*7;
  const days=Array.from({length:cellCount},(_,index)=>{const day=index-firstDay+1;return day>0&&day<=dayCount?day:null;});
  const monthLabel=new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric',timeZone:'UTC'}).format(cursor);
  const todayLabel=new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date());
  return <section className="student-aside-card student-calendar-card" aria-label="Kalender">
    <div className="student-calendar-today"><CalendarDays size={16}/><strong>{todayLabel}</strong></div>
    <div className="student-calendar-heading"><b>{monthLabel}</b><div><button type="button" aria-label="Bulan sebelumnya" onClick={()=>setCursor(new Date(Date.UTC(year,month-1,1)))}><ChevronLeft size={16}/></button><button type="button" aria-label="Bulan berikutnya" onClick={()=>setCursor(new Date(Date.UTC(year,month+1,1)))}><ChevronRight size={16}/></button></div></div>
    <div className="student-calendar-grid student-calendar-weekdays">{['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(day=><span key={day}>{day}</span>)}</div>
    <div className="student-calendar-grid student-calendar-days">{days.map((day,index)=><span key={index} className={day&&year===today.year&&month===today.month-1&&day===today.day?'is-today':''}>{day||''}</span>)}</div>
  </section>;
}

function ClipboardListIcon(){return <div className="student-clipboard-illustration"><div className="student-clipboard-clip"/><CheckCircle2 size={17}/><CheckCircle2 size={17}/><CheckCircle2 size={17}/></div>}

export default function StudentPage(){
  const pathname=usePathname();
  const view:PageView=pathname.endsWith('/riwayat')?'history':pathname.endsWith('/peringkat')?'ranking':pathname.endsWith('/profil')?'profile':'home';
  const {profile,loading,error,logout}=useSchoolAuth('student');
  const [attempts,setAttempts]=useState<Attempt[]>([]);
  const [topicInsights,setTopicInsights]=useState<TopicInsight[]>([]);
  const [insightsError,setInsightsError]=useState(false);
  const [leaders,setLeaders]=useState<LeaderboardEntry[]>([]);
  const [avatarUrls,setAvatarUrls]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(true);
  const [warning,setWarning]=useState('');
  const [rankFailed,setRankFailed]=useState(false);
  const [category,setCategory]=useState<string|null|undefined>(undefined);
  const [embed,setEmbed]=useState(false);
  const [bankPublished,setBankPublished]=useState(false);
  const [bankChecking,setBankChecking]=useState(true);
  useEffect(()=>{
    if(!profile)return;
    let active=true;
    async function check(){
      try{const version=await getPublishedBankVersion();
        if(active)setBankPublished(version==='VOKASI-NEW-20261026-v1');
      }catch{if(active)setBankPublished(false);}
      if(active)setBankChecking(false);
    }
    queueMicrotask(()=>void check());
    return()=>{active=false;};
  },[profile]);
  const BANK_IS_PUBLISHED=bankPublished&&!bankChecking;
  useEffect(()=>{queueMicrotask(()=>setEmbed(new URLSearchParams(window.location.search).get('embed')==='1'));},[]);
  const refresh=useCallback(async()=>{
    if(!profile)return;
    setBusy(true);setWarning('');setRankFailed(false);setInsightsError(false);
    const [hist,rank,topics]=await Promise.allSettled([getOwnAttempts(profile.authId),getLeaderboard(),getWeakTopicInsights()]);
    if(hist.status==='fulfilled')setAttempts(hist.value);
    else setWarning('Gagal membaca riwayat nilai dari Supabase.');
    if(topics.status==='fulfilled')setTopicInsights(topics.value);
    else {setTopicInsights([]);setInsightsError(true);}
    if(rank.status==='fulfilled')setLeaders(rank.value);
    else {setLeaders([]);setRankFailed(true);}
    try{
      const usernames=[profile.username,...(rank.status==='fulfilled'?rank.value.map(student=>student.username):[])];
      setAvatarUrls(await getSchoolAvatarUrls(usernames));
    }catch{
      // Missing images must never stop displaying real grades or the leaderboard.
      setAvatarUrls({});
    }
    setBusy(false);
  },[profile]);
  useEffect(()=>{queueMicrotask(()=>void refresh());},[refresh]);
  if(loading||!profile)return <main className="page-loader">{error||'Memeriksa akun siswa...'}</main>;
  const recommended=rankRecommendedTopics(topicInsights).find(insight=>insight.needsPractice||insight.status==='improve');
  const compulsory=officialMandatoryAttempts(attempts);
  const latest=compulsory[0];
  const today=compulsory.find(a=>wibDate(a.completed_at_ms)===wibDate());
  const average=compulsory.length?Math.round(compulsory.reduce((s,a)=>s+a.score,0)/compulsory.length):null;
  return <AppShell role="student" onLogout={()=>void logout()} displayName={profile.fullName} studentAvatarUrl={avatarUrls[profile.username.toLowerCase()]} embed={embed} navigationBlocked={category!==undefined} quizFocusMode={category!==undefined}>
    {category!==undefined?<QuizView profile={profile} category={category} history={attempts} onQuit={()=>setCategory(undefined)} onDone={()=>{setCategory(undefined);void refresh();}}/>:
    <>
      {warning&&<div className="alert danger">{warning} <button type="button" className="link-action" onClick={()=>void refresh()}>Coba lagi</button></div>}
      {view==='history'?<HistoryView attempts={attempts} busy={busy} profile={profile}/>:
       view==='ranking'?<RankingView leaders={leaders} profile={profile} busy={busy} failed={rankFailed} avatarUrls={avatarUrls}/>:
       view==='profile'?<StudentProfileDashboard profile={profile} attempts={attempts} busy={busy} avatarUrl={avatarUrls[profile.username.toLowerCase()]} onAvatarUploaded={url=>setAvatarUrls(previous=>({...previous,[profile.username.toLowerCase()]:url}))} onLogout={()=>void logout()}/>:
        <main className="student-home student-home-dashboard">
          <section className="student-featured-practice student-reference-hero" aria-labelledby="mandatory-practice-title">
            <div className="student-featured-copy">
              <span className="student-featured-eyebrow"><span className="student-live-dot"/> LATIHAN WAJIB</span>
              <h1 id="mandatory-practice-title">Siap menguji<br/>kemampuanmu?</h1>
              <p className="student-hero-class">{profile.className} <span aria-hidden="true">·</span> {profile.majorName}</p>
              <p className="student-hero-description">{BANK_IS_PUBLISHED?'Kerjakan latihan wajib dan lihat perkembangan hasil belajarmu.':'Latihan wajib belum tersedia. Admin sekolah perlu mengaktifkan bank soal terlebih dahulu.'}</p>
              <div className="student-hero-actions">
                <button type="button" className="student-start-button" disabled={!BANK_IS_PUBLISHED} onClick={()=>setCategory(null)}>
                  <span className="student-play-icon"><Play size={17}/></span>{BANK_IS_PUBLISHED?'Jawab soal sekarang':'Latihan belum tersedia'}<ArrowRight size={17}/>
                </button>
                <span className="student-hero-duration"><CalendarDays size={15}/> 100 soal <span aria-hidden="true">·</span> 30 menit</span>
              </div>
            </div>
            <div className="student-hero-illustration student-reference-illustration" aria-hidden="true">
              <div className="student-illustration-orbit"/>
              <div className="student-paper-stack"><span className="student-paper-number">01</span><div className="student-paper-title">LATIHAN<br/>SOAL</div><svg viewBox="0 0 120 70" fill="none"><path d="M8 56C27 19 43 49 60 25S88 25 109 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><circle cx="8" cy="56" r="3.5" fill="currentColor"/><circle cx="60" cy="25" r="3.5" fill="currentColor"/><circle cx="109" cy="8" r="3.5" fill="currentColor"/></svg></div>
              <span className="student-hero-spark spark-a">✦</span><span className="student-hero-spark spark-b">●</span><span className="student-hero-spark spark-c">○</span>
            </div>
          </section>

          <section className="student-progress-section student-reference-stats" aria-label="Ringkasan progres belajar">
            <div className="student-home-metrics">
              <div className="metric"><span className="metric-icon blue"><CheckCircle2 size={19}/></span><div><small>Latihan wajib selesai</small><strong>{busy?'—':compulsory.length}</strong></div><span className="metric-foot">Total sesi tercatat</span></div>
              <div className="metric"><span className="metric-icon green"><TrendingUp size={19}/></span><div><small>Rata-rata nilai</small><strong>{busy?'—':average??'—'}</strong></div><span className="metric-foot">Dari latihan wajib</span></div>
              <div className="metric"><span className="metric-icon purple"><Trophy size={19}/></span><div><small>Total XP</small><strong>{busy?'—':attempts.reduce((sum,attempt)=>sum+attempt.earned_xp,0)}</strong></div><span className="metric-foot">Dari sesi yang tercatat</span></div>
            </div>
          </section>

          <section className="student-reference-content">
            <div className="student-reference-lessons student-aside-card">
              <div className="student-reference-section-heading"><div><span className="student-card-eyebrow">BANK SOAL</span><h2>Pilih latihan mandiri</h2><p>Materi yang perlu diperbaiki ditandai berdasarkan jawabanmu.</p></div><span className="student-reference-count">6 materi</span></div>
              <section className="vokasi-study-recommendation" aria-label="Rekomendasi materi belajar">
                <div className="vokasi-study-recommendation-title"><Target size={17}/><strong>REKOMENDASI BELAJAR</strong><span>Analisis 5 sesi terakhir</span></div>
                {busy?<p>Memeriksa hasil jawabanmu...</p>:insightsError?<p>Rekomendasi belum dapat dimuat. Coba segarkan halaman.</p>:recommended?
                  <div className={'vokasi-study-recommendation-body '+(recommended.needsPractice?'is-weak':'is-improve')}>
                    <div><b>{recommended.category}</b><span>{recommended.needsPractice?'Prioritas latihan · banyak jawaban salah':'Materi untuk ditingkatkan'}</span><small>Benar {recommended.correct} dari {recommended.answered} jawaban · {recommended.wrong} salah{recommended.timeout>0?' · '+recommended.timeout+' timeout':''}</small></div>
                    <button type="button" disabled={!BANK_IS_PUBLISHED} onClick={()=>setCategory(recommended.category)}>Latih materi <ArrowRight size={16}/></button>
                  </div>:
                  <p>{topicInsights.some(item=>item.answered>0)?'Belum ada materi dengan akurasi di bawah 85%. Pertahankan hasil belajarmu!':'Selesaikan latihan untuk melihat materi yang perlu diperbaiki. Soal timeout dibedakan dari jawaban salah.'}</p>}
              </section>
              <div className="student-reference-topic-list">
                {categories.map((cat,i)=>{const TopicIcon=[Calculator,Divide,Sigma,Atom,Brain,ImageIcon][i%6];const insight=topicInsights.find(x=>x.category===cat)||topicInsight(cat);return <button type="button" className={'student-reference-topic'+(insight.needsPractice?' needs-practice':insight.status==='improve'?' needs-improve':'')} key={cat} disabled={!BANK_IS_PUBLISHED} onClick={()=>setCategory(cat)}>
                  <span className={'student-reference-topic-icon tone-'+i}><TopicIcon size={20}/></span>
                  <span className="student-reference-topic-copy"><b>{cat}</b><small>{BANK_IS_PUBLISHED?'10 soal latihan mandiri':'Menunggu bank soal aktif'}</small>
                  {!busy&&!insightsError&&<span className={'vokasi-topic-status status-'+insight.status}>{insight.label}{insight.answered>=5&&insight.accuracy!==null?' · '+insight.accuracy+'% benar':''}</span>}</span>
                  <span className="student-reference-topic-arrow"><ArrowRight size={17}/></span>
                </button>;})}
              </div>
            </div>

            <aside className="student-reference-rail" aria-label="Ringkasan hasil belajar">
              <section className="student-aside-card student-reference-rank">
                <div className="student-reference-section-heading"><div><span className="student-card-eyebrow">PERINGKAT SEKOLAH</span><h2>Peringkatmu saat ini</h2></div><span className="student-dashboard-card-icon blue"><TrendingUp size={19}/></span></div>
                {busy?<div className="student-reference-empty">Memuat peringkat...</div>:rankFailed?<div className="student-reference-empty"><b>Peringkat belum tersedia</b><span>Data peringkat belum dapat dimuat.</span></div>:(()=>{const rankIndex=leaders.findIndex(row=>row.username.trim().toLocaleLowerCase('id-ID')===profile.username.trim().toLocaleLowerCase('id-ID'));const rank=rankIndex>=0?rankIndex+1:null;return <div className="student-reference-rank-value"><strong>{rank?'#'+rank:'—'}</strong><div><b>{rank?'Dari '+leaders.length+' siswa':'Belum tersedia'}</b><span>{rank?'Posisi berdasarkan hasil latihan wajib terverifikasi.':'Peringkat resmi muncul setelah kamu menyelesaikan latihan wajib terbaru.'}</span></div></div>;})()}
                <Link className="student-reference-primary-link" href={embed?'/siswa/peringkat?embed=1':'/siswa/peringkat'}>Lihat peringkat <ArrowRight size={15}/></Link>
              </section>

              <section className="student-aside-card student-reference-latest">
                <div className="student-reference-section-heading"><div><span className="student-card-eyebrow">HASIL TERAKHIR</span><h2>Riwayat latihan</h2></div><span className="student-dashboard-card-icon blue"><History size={19}/></span></div>
                {busy?<div className="student-reference-empty">Memuat riwayat...</div>:latest?<div className="student-reference-latest-detail"><span className="student-reference-clipboard"><ClipboardListIcon/></span><div><b>Latihan wajib</b><span>{toDay(latest.completed_at_ms)} · {latest.question_count} soal</span><strong>Nilai {latest.score}/100</strong></div></div>:<div className="student-reference-empty"><BookOpen size={23}/><b>Belum ada riwayat</b><span>Mulai latihan wajib untuk mencatat hasil belajarmu.</span></div>}
                <Link className="student-reference-secondary-link" href={embed?'/siswa/riwayat?embed=1':'/siswa/riwayat'}>Lihat riwayat <ArrowRight size={15}/></Link>
              </section>

              <section className="student-aside-card student-reference-tip">
                <div className="student-reference-section-heading"><div><span className="student-card-eyebrow">TIPS BELAJAR</span><h2>Kerjakan dengan teliti</h2></div><span className="student-dashboard-card-icon gold"><Lightbulb size={19}/></span></div>
                <p>Baca setiap soal sampai selesai, perhatikan informasi penting, lalu periksa kembali jawabanmu sebelum mengirim.</p>
              </section>
            </aside>
          </section>
        </main>
      }
    </>}
  </AppShell>;
}