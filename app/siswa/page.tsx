'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, GraduationCap, History, Medal, Play, RefreshCw, Search, ShieldCheck, Star, TrendingUp, Trophy, UserRound, Users } from 'lucide-react';
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
       <div className="student-session-list">{rows.map((a,i)=><details key={a.session_key} className="student-session-card">
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
       <>
        <main className="student-home">
          <header className="student-dashboard-intro">
            <div className="student-dashboard-greeting">
              <span className="section-kicker">RUANG BELAJAR</span>
              <h1>Halo, {profile.fullName.split(' ')[0]} <span aria-hidden="true">👋</span></h1>
              <p><GraduationCap size={16}/>{profile.className} <span aria-hidden="true">·</span> {profile.majorName}</p>
            </div>
            <div className="student-home-date"><CalendarDays size={16}/>{new Intl.DateTimeFormat('id-ID',{dateStyle:'full',timeZone:'Asia/Jakarta'}).format(new Date())}</div>
          </header>

          <section className="student-featured-practice" aria-labelledby="mandatory-practice-title">
            <div className="student-featured-copy">
              <span className="student-featured-eyebrow"><Star size={14}/> LATIHAN UTAMA</span>
              <h2 id="mandatory-practice-title">Latihan wajib numerasi</h2>
              <p>{BANK_IS_PUBLISHED?'Uji pemahamanmu lewat soal numerasi bergambar. Selesaikan latihan dan lihat hasil belajarmu.':bankChecking?'Sedang memeriksa ketersediaan soal latihan...':'Latihan wajib belum tersedia. Tunggu sampai admin mengaktifkan bank soal terbaru.'}</p>
              <div className="student-featured-meta">
                <span><BookOpen size={16}/>100 soal</span>
                <span><Clock3 size={16}/>30 menit</span>
                <span><CheckCircle2 size={16}/>Nilai otomatis</span>
              </div>
              <button type="button" className="student-start-button" disabled={!BANK_IS_PUBLISHED} onClick={()=>setCategory(null)}>
                <Play size={17}/>{BANK_IS_PUBLISHED?'Mulai latihan wajib':'Latihan belum tersedia'}<ArrowRight size={17}/>
              </button>
            </div>
            <div className="student-featured-visual" aria-hidden="true">
              <div className="student-featured-orbit student-featured-orbit-one"/>
              <div className="student-featured-orbit student-featured-orbit-two"/>
              <div className="student-featured-book"><BookOpen size={39}/></div>
              <strong>100</strong><span>SOAL NUMERASI</span>
              <small><Clock3 size={14}/> 30 menit</small>
            </div>
          </section>

          <section className="student-progress-section" aria-label="Ringkasan progres belajar">
            <div className="student-subsection-heading">
              <div><span className="section-kicker">PROGRES BELAJAR</span><h2>Ringkasanmu</h2></div>
              <span className="student-muted-caption">Berdasarkan latihan yang tercatat</span>
            </div>
            <div className="student-home-metrics">
              <div className="metric"><span className="metric-icon blue"><BookOpen size={19}/></span><div><small>Sesi latihan wajib</small><strong>{busy?'—':compulsory.length}</strong></div><span className="metric-foot">Total sesi selesai</span></div>
              <div className="metric"><span className="metric-icon green"><TrendingUp size={19}/></span><div><small>Rata-rata nilai</small><strong>{busy?'—':average??'—'}</strong></div><span className="metric-foot">Dari latihan wajib</span></div>
              <div className="metric"><span className="metric-icon purple"><Star size={19}/></span><div><small>Total XP</small><strong>{busy?'—':attempts.reduce((sum,attempt)=>sum+attempt.earned_xp,0)}</strong></div><span className="metric-foot">Poin pengalaman</span></div>
              <div className="metric"><span className="metric-icon orange"><Medal size={19}/></span><div><small>Nilai terakhir</small><strong>{busy?'—':latest?.score??'—'}</strong></div><span className="metric-foot">{today?'Sudah latihan hari ini':'Belum latihan hari ini'}</span></div>
            </div>
          </section>

          <section className="student-practice-section" aria-labelledby="practice-topics-title">
            <div className="student-subsection-heading">
              <div><span className="section-kicker">PILIH MATERI</span><h2 id="practice-topics-title">Latihan mandiri</h2><p>Pilih topik yang ingin kamu pelajari dan latih.</p></div>
            </div>
            <div className="student-practice-grid">{categories.map((cat,i)=><button type="button" className="student-topic-card" key={cat} disabled={!BANK_IS_PUBLISHED} onClick={()=>setCategory(cat)}>
              <span className={'student-topic-icon c'+i}>{['×','÷','∑','⚙','◇','▣'][i]}</span>
              <span className="student-topic-copy"><b>{cat}</b><small>{BANK_IS_PUBLISHED?'10 soal latihan':'Menunggu bank soal aktif'}</small></span>
              <span className="student-topic-arrow"><ArrowRight size={17}/></span>
            </button>)}</div>
          </section>

          <div className="student-secondary-grid">
            <section className="white-panel student-recent-panel">
              <div className="panel-heading"><div><span className="section-kicker">AKTIVITAS TERBARU</span><h2>Riwayat latihan</h2></div><Link aria-label="Lihat semua riwayat" className="icon-action" href={embed?'/siswa/riwayat?embed=1':'/siswa/riwayat'}><ArrowRight size={17}/></Link></div>
              {busy?<div className="student-compact-empty">Memuat riwayat latihan...</div>:compulsory.length===0?<div className="student-compact-empty"><History size={23}/><div><b>Belum ada hasil latihan</b><p>Nilai dan progresmu akan tampil setelah menyelesaikan latihan.</p></div></div>:<div className="history-list">{compulsory.slice(0,4).map(a=><div key={a.session_key} className="history-row"><span className="history-dot"/><div><b>{toDay(a.completed_at_ms)}</b><small>{a.correct}/{a.question_count} jawaban benar</small></div><span className={'score-chip '+(a.score>=75?'positive':'')}>{a.score}/100</span></div>)}</div>}
              <Link className="student-text-link" href={embed?'/siswa/riwayat?embed=1':'/siswa/riwayat'}>Buka semua riwayat <ArrowRight size={15}/></Link>
            </section>

            <section className="white-panel leaderboard student-home-leaderboard">
              <div className="panel-heading"><div><span className="section-kicker">SEMANGAT BERSAMA</span><h2>Peringkat sekolah</h2></div><Link href={embed?'/siswa/peringkat?embed=1':'/siswa/peringkat'} className="icon-action" aria-label="Lihat semua peringkat"><ArrowRight size={17}/></Link></div>
              {rankFailed?<div className="student-compact-empty"><Trophy size={22}/><div><b>Peringkat belum tersedia</b><p>Data belum dapat dimuat. Coba lagi nanti.</p></div></div>:leaders.length?<div className="leader-list">{leaders.slice(0,5).map((row,i)=><div key={row.username+'-'+i} className="leader-item"><b className="leader-rank">#{i+1}</b><span className="leader-avatar">{row.display_name.slice(0,1)}</span><div><b>{row.display_name}</b><small>{row.classroom} · {row.major}</small></div><span className="leader-points">{row.mandatory_average??'—'}<small>rata-rata</small></span></div>)}</div>:<div className="student-compact-empty"><Trophy size={22}/><div><b>Belum ada peringkat</b><p>Peringkat muncul setelah ada nilai latihan wajib.</p></div></div>}
              <Link className="student-text-link" href={embed?'/siswa/peringkat?embed=1':'/siswa/peringkat'}>Lihat klasemen <ArrowRight size={15}/></Link>
            </section>
          </div>
        </main>
       </>}
    </>}
  </AppShell>;
}