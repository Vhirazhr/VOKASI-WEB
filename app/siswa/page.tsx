'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Atom, BookOpen, Brain, Calculator, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Divide, GraduationCap, History, Image as ImageIcon, Lightbulb, Medal, Megaphone, Play, RefreshCw, Search, Shapes, ShieldCheck, Sigma, Star, Target, TrendingUp, Trophy } from 'lucide-react';
import AppShell from '@/components/AppShell';
import QuizView from '@/components/QuizView';
import ReviewHistory from '@/components/ReviewHistory';
import {getPublishedBankVersion,PRACTICE_CATEGORIES} from '@/lib/quiz';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {getOwnAttempts,getLeaderboard,wibDate} from '@/lib/school';
import type {Attempt,LeaderboardEntry,StudentProfile} from '@/lib/types';
import '@/app/student-experience.css';
import '@/app/student-unified-ui.css';

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

function HistoryView({attempts,busy}:{attempts:Attempt[];busy:boolean}) {
  const [kind,setKind]=useState('all');
  const [date,setDate]=useState('');
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(0);
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
         <summary><span className="student-session-icon"><BookOpen size={20}/></span><span className="student-session-main"><b>{a.practice_category||'Latihan wajib'}</b><small>{toDay(a.completed_at_ms)} • {toTime(a.seconds_spent)} • {a.question_count} soal</small></span><span className="student-session-score">{a.score}<small>/100</small><small>{a.signature?.startsWith('WEB-SERVER-v1:')?'Terverifikasi':'Riwayat lama · belum terverifikasi'}</small></span><span className="student-session-open">Detail <ArrowRight size={15}/></span></summary>
         <div className="student-session-detail"><div><span>Jawaban benar</span><strong>{a.correct}</strong></div><div><span>Jumlah terjawab</span><strong>{a.answered}</strong></div><div><span>XP sesi</span><strong>+{a.earned_xp}</strong></div><div><span>Durasi</span><strong>{toTime(a.seconds_spent)}</strong></div></div>
         {a.signature?.startsWith('WEB-SERVER-v1:')&&<ReviewHistory sessionId={a.session_key}/>}
         {a.review_summary?.length>0&&<div className="student-answer-summary"><b>Ringkasan status jawaban</b><p>Status diambil dari catatan sesi yang sudah selesai.</p><div>{a.review_summary.slice(0,100).map((answer,j)=><span key={j} title={'Soal '+(j+1)+': '+answer.status} className={'student-answer-dot '+(/^(BENAR|CORRECT|RIGHT)$/i.test(answer.status)?'is-correct':/^(TIMEOUT)$/i.test(answer.status)?'is-timeout': 'is-other')}>{j+1}</span>)}</div></div>}
       </details>)}</div>}
      <div className="student-list-footer"><span>Halaman {currentPage+1} dari {pages}</span><div><button type="button" className="btn secondary small" disabled={currentPage===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>Sebelumnya</button><button type="button" className="btn secondary small" disabled={currentPage>=pages-1} onClick={()=>setPage(p=>p+1)}>Berikutnya</button></div></div>
    </div>
  </div>;
}

function RankingView({leaders,profile,busy,failed}:{leaders:LeaderboardEntry[];profile:StudentProfile;busy:boolean;failed:boolean}) {
  const [scope,setScope]=useState('school');
  const [query,setQuery]=useState('');
  const normalized=(value:string)=>value.trim().toLocaleLowerCase('id-ID');
  const visible=useMemo(()=>leaders.filter(a=>(scope==='school'||(scope==='class'?a.classroom===profile.className:a.major===profile.majorName))&&(query.trim()===''||[a.display_name,a.classroom,a.major].some(v=>normalized(v).includes(normalized(query))))),[leaders,scope,query,profile.className,profile.majorName]);
  const podium=[visible[1],visible[0],visible[2]];
  const ownIndex=visible.findIndex(a=>normalized(a.username)===normalized(profile.username));
  return <div className="student-experience">
    <StudentHeading kicker="HALL OF ACHIEVEMENT" title="Peringkat prestasi" description="Apresiasi hasil belajar berdasarkan rata-rata nilai latihan wajib, bukan XP."/>
    <div className="student-ranking-controls">
      <div className="student-segments" role="group" aria-label="Lingkup peringkat">
        {[{id:'school',label:'Sekolah'},{id:'major',label:'Jurusan'},{id:'class',label:'Kelas'}].map(item=><button key={item.id} type="button" className={scope===item.id?'active':''} aria-pressed={scope===item.id} onClick={()=>setScope(item.id)}>{item.label}</button>)}
      </div>
      <label className="student-ranking-search"><Search size={16}/><input placeholder="Cari nama / kelas..." value={query} onChange={e=>setQuery(e.target.value)}/></label>
    </div>
    <div className="student-ranking-info"><ShieldCheck size={17}/> Nilai diambil dari layanan peringkat Supabase. Posisi dihitung ulang setelah filter; nilai kosong tidak dimasukkan.</div>
    {busy?<div className="student-panel student-blank"><RefreshCw size={23}/> Memuat peringkat...</div>:
     failed?<div className="student-panel student-blank"><Trophy size={34}/><b>Peringkat tidak dapat dimuat</b><span>Data Supabase belum dapat diakses. Coba buka kembali setelah jaringan membaik.</span></div>:
     !visible.length?<div className="student-panel student-blank"><Trophy size={34}/><b>Belum ada hasil peringkat</b><span>Belum ada nilai latihan wajib untuk lingkup atau pencarian ini.</span></div>:
     <>
      <div className="student-podium">{podium.map((a,i)=>a?<div className={'student-podium-item student-podium-'+(i===1?1:i===0?2:3)} key={a.username||i}><span className="student-podium-medal"><Trophy size={22}/></span><div className="student-podium-avatar">{a.display_name.slice(0,1)}</div><small>JUARA {i===1?1:i===0?2:3}</small><b>{a.display_name}</b><span>{a.classroom}</span><strong>{a.mandatory_average}<small> nilai rata-rata</small></strong></div>:<div key={i} className="student-podium-placeholder"/>)}</div>
      <div className="student-panel student-ranking-table">
        <div className="student-panel-heading"><div><span className="section-kicker">KLASEMEN AKADEMIK</span><h2>Daftar peringkat</h2></div><span className="student-table-meta">{visible.length} siswa</span></div>
        <div className="table-wrap"><table className="grade-table"><thead><tr><th>Posisi</th><th>Nama siswa</th><th>Kelas</th><th>Jurusan</th><th>Nilai rata-rata</th><th>Hari latihan</th></tr></thead><tbody>
          {visible.map((a,index)=><tr key={a.username+'-'+index} className={normalized(a.username)===normalized(profile.username)?'student-self-row':''}><td><b>#{index+1}</b></td><td><b>{a.display_name}</b>{normalized(a.username)===normalized(profile.username)&&<small>Ini kamu</small>}</td><td>{a.classroom}</td><td>{a.major}</td><td><span className="score-chip positive">{a.mandatory_average}</span></td><td>{a.mandatory_days}</td></tr>)}
        </tbody></table></div>
      </div>
      <div className="student-personal-rank"><Medal size={21}/><span>{ownIndex>=0?'Posisimu pada filter ini: peringkat #'+(ownIndex+1):'Posisimu belum ada pada filter yang dipilih.'}</span></div>
     </>}
  </div>;
}

function ProfileView({profile,attempts,busy}:{profile:StudentProfile;attempts:Attempt[];busy:boolean}) {
  const compulsory=attempts.filter(a=>a.practice_category===null);
  const average=compulsory.length?Math.round(compulsory.reduce((s,a)=>s+a.score,0)/compulsory.length):null;
  const highest=compulsory.length?Math.max(...compulsory.map(a=>a.score)):null;
  const latest=compulsory[0];
  const days=new Set(compulsory.map(a=>wibDate(a.completed_at_ms))).size;
  return <div className="student-experience">
    <StudentHeading kicker="AKUN BELAJAR" title="Profil siswa" description="Informasi akun, aktivitas, dan ringkasan capaian pribadimu."/>
    <div className="student-profile-grid">
      <section className="student-panel student-profile-card"><span className="student-profile-avatar">{profile.fullName.slice(0,1).toUpperCase()}</span><h2>{profile.fullName}</h2><p>@{profile.username}</p><span className="student-profile-pill"><GraduationCap size={16}/> Siswa VOKASI</span><div className="student-profile-divider"/><dl><div><dt>Nama lengkap</dt><dd>{profile.fullName}</dd></div><div><dt>Kelas</dt><dd>{profile.className}</dd></div><div><dt>Jurusan</dt><dd>{profile.majorName}</dd></div></dl><div className="student-profile-safe"><ShieldCheck size={17}/> Profil dibaca dari akun sekolah.</div></section>
      <div className="student-profile-side"><section className="student-panel"><div className="student-panel-heading"><div><span className="section-kicker">PERKEMBANGANMU</span><h2>Statistik belajar</h2></div><TrendingUp size={24}/></div><div className="student-profile-stats">
        <div><small>Rata-rata nilai</small><strong>{busy?'—':average??'—'}</strong></div><div><small>Nilai tertinggi</small><strong>{busy?'—':highest??'—'}</strong></div><div><small>Total sesi wajib</small><strong>{busy?'—':compulsory.length}</strong></div><div><small>Hari aktif latihan</small><strong>{busy?'—':days}</strong></div>
      </div></section>
      <section className="student-panel student-profile-next"><div><span className="section-kicker">LANJUTKAN BELAJAR</span><h2>Setiap sesi berarti.</h2><p>{latest?'Latihan wajib terakhirmu pada '+toDay(latest.completed_at_ms)+'.':'Mulailah latihan wajib pertamamu untuk mencatat capaian.'}</p></div><Link className="btn primary" href="/siswa/riwayat">Lihat riwayat <ArrowRight size={16}/></Link></section></div>
    </div>
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
  const [leaders,setLeaders]=useState<LeaderboardEntry[]>([]);
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
    setBusy(true);setWarning('');setRankFailed(false);
    const [hist,rank]=await Promise.allSettled([getOwnAttempts(profile.authId),getLeaderboard()]);
    if(hist.status==='fulfilled')setAttempts(hist.value);
    else setWarning('Gagal membaca riwayat nilai dari Supabase.');
    if(rank.status==='fulfilled')setLeaders(rank.value);
    else {setLeaders([]);setRankFailed(true);}
    setBusy(false);
  },[profile]);
  useEffect(()=>{queueMicrotask(()=>void refresh());},[refresh]);
  if(loading||!profile)return <main className="page-loader">{error||'Memeriksa akun siswa...'}</main>;
  const compulsory=attempts.filter(a=>a.practice_category===null);
  const latest=compulsory[0];
  const today=compulsory.find(a=>wibDate(a.completed_at_ms)===wibDate());
  const average=compulsory.length?Math.round(compulsory.reduce((s,a)=>s+a.score,0)/compulsory.length):null;
  return <AppShell role="student" onLogout={()=>void logout()} displayName={profile.fullName} embed={embed} navigationBlocked={category!==undefined}>
    {category!==undefined?<QuizView profile={profile} category={category} history={attempts} onQuit={()=>setCategory(undefined)} onDone={()=>{setCategory(undefined);void refresh();}}/>:
    <>
      {warning&&<div className="alert danger">{warning} <button type="button" className="link-action" onClick={()=>void refresh()}>Coba lagi</button></div>}
      {view==='history'?<HistoryView attempts={attempts} busy={busy}/>:
       view==='ranking'?<RankingView leaders={leaders} profile={profile} busy={busy} failed={rankFailed}/>:
       view==='profile'?<ProfileView profile={profile} attempts={attempts} busy={busy}/>:
        <main className="student-home student-home-dashboard">
          <section className="student-featured-practice student-reference-hero" aria-labelledby="mandatory-practice-title">
            <div className="student-featured-copy">
              <span className="student-featured-eyebrow"><span className="student-live-dot"/> LATIHAN WAJIB</span>
              <h1 id="mandatory-practice-title">Siap menguji<br/>kemampuanmu?</h1>
              <p className="student-hero-class">{profile.className} <span aria-hidden="true">·</span> {profile.majorName}</p>
              <p className="student-hero-description">{BANK_IS_PUBLISHED?'Kerjakan latihan wajib dan lihat perkembangan hasil belajarmu.':'Latihan wajib belum tersedia. Admin sekolah perlu mengaktifkan bank soal terlebih dahulu.'}</p>
              <div className="student-hero-actions">
                <button type="button" className="student-start-button" disabled={!BANK_IS_PUBLISHED} onClick={()=>setCategory(null)}>
                  <span className="student-play-icon"><Play size={17}/></span>{BANK_IS_PUBLISHED?'Mulai latihan wajib':'Latihan belum tersedia'}<ArrowRight size={17}/>
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
              <div className="student-reference-section-heading"><div><span className="student-card-eyebrow">BANK SOAL</span><h2>Pilih latihan mandiri</h2><p>Latih kemampuanmu melalui enam materi numerasi.</p></div><span className="student-reference-count">6 materi</span></div>
              <div className="student-reference-topic-list">
                {categories.map((cat,i)=>{const TopicIcon=[Calculator,Divide,Sigma,Atom,Brain,ImageIcon][i%6];return <button type="button" className="student-reference-topic" key={cat} disabled={!BANK_IS_PUBLISHED} onClick={()=>setCategory(cat)}>
                  <span className={'student-reference-topic-icon tone-'+i}><TopicIcon size={20}/></span>
                  <span className="student-reference-topic-copy"><b>{cat}</b><small>{BANK_IS_PUBLISHED?'10 soal latihan mandiri':'Menunggu bank soal aktif'}</small></span>
                  <span className="student-reference-topic-arrow"><ArrowRight size={17}/></span>
                </button>;})}
              </div>
            </div>

            <aside className="student-reference-rail" aria-label="Ringkasan hasil belajar">
              <section className="student-aside-card student-reference-rank">
                <div className="student-reference-section-heading"><div><span className="student-card-eyebrow">PERINGKAT SEKOLAH</span><h2>Peringkatmu saat ini</h2></div><span className="student-dashboard-card-icon blue"><TrendingUp size={19}/></span></div>
                {busy?<div className="student-reference-empty">Memuat peringkat...</div>:rankFailed?<div className="student-reference-empty"><b>Peringkat belum tersedia</b><span>Data peringkat belum dapat dimuat.</span></div>:(()=>{const rankIndex=leaders.findIndex(row=>row.username.trim().toLocaleLowerCase('id-ID')===profile.username.trim().toLocaleLowerCase('id-ID'));const rank=rankIndex>=0?rankIndex+1:null;return <div className="student-reference-rank-value"><strong>{rank?'#'+rank:'—'}</strong><div><b>{rank?'Dari '+leaders.length+' siswa':'Belum tersedia'}</b><span>{rank?'Posisi berdasarkan hasil belajar yang tercatat.':'Peringkat tampil setelah data hasil belajar tersedia.'}</span></div></div>;})()}
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