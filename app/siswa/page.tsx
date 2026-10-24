'use client';
import {useCallback,useEffect,useState} from 'react';
import {ArrowRight,BookOpen,Clock3,GraduationCap,Medal,Play,RefreshCw,Star,TrendingUp,Users} from 'lucide-react';
import AppShell from '@/components/AppShell';
import QuizView from '@/components/QuizView';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {getOwnAttempts,getLeaderboard,wibDate} from '@/lib/school';
import type {Attempt,LeaderboardEntry} from '@/lib/types';

const categories=['Perkalian','Pembagian','Penjumlahan','Konversi Satuan'];
export default function StudentPage(){const {profile,loading,error,logout}=useSchoolAuth('student');
 const [attempts,setAttempts]=useState<Attempt[]>([]);const [leaders,setLeaders]=useState<LeaderboardEntry[]>([]);
 const [busy,setBusy]=useState(true);const [warning,setWarning]=useState('');const [category,setCategory]=useState<string|null|undefined>(undefined);
 const [embed,setEmbed]=useState(false);
 useEffect(()=>{queueMicrotask(()=>setEmbed(new URLSearchParams(window.location.search).get('embed')==='1'));},[]);
 const refresh=useCallback(async()=>{if(!profile)return;setBusy(true);setWarning('');
   const [hist,rank]=await Promise.allSettled([getOwnAttempts(profile.authId),getLeaderboard()]);
   if(hist.status==='fulfilled')setAttempts(hist.value);else setWarning('Gagal membaca riwayat nilai dari Supabase.');
   if(rank.status==='fulfilled')setLeaders(rank.value);
   setBusy(false);
 },[profile]);
 useEffect(()=>{queueMicrotask(()=>void refresh());},[refresh]);
 if(loading||!profile)return <main className="page-loader">{error||'Memeriksa akun siswa...'}</main>;
 const compulsory=attempts.filter(a=>a.practice_category===null),latest=compulsory[0],today=compulsory.find(a=>wibDate(a.completed_at_ms)===wibDate());
 const average=compulsory.length?Math.round(compulsory.reduce((s,a)=>s+a.score,0)/compulsory.length):0;
 return <AppShell role="student" onLogout={()=>void logout()} displayName={profile.fullName} embed={embed}>
  {category!==undefined?<QuizView profile={profile} category={category} history={attempts} onQuit={()=>setCategory(undefined)} onDone={()=>{setCategory(undefined);void refresh();}}/>:<>
  <div className="dashboard-heading"><div><div className="section-kicker">DASHBOARD SISWA</div><h1>Halo, {profile.fullName.split(' ')[0]} <span>👋</span></h1><p>{profile.className} • {profile.majorName}</p></div><span className="today-tag"><Clock3 size={16}/> {new Intl.DateTimeFormat('id-ID',{dateStyle:'full',timeZone:'Asia/Jakarta'}).format(new Date())}</span></div>
  {warning&&<div className="alert danger">{warning}</div>}
  <div className="welcome-banner"><div><span className="welcome-eyebrow">TERUS MELANGKAH MAJU</span><h2>Setiap latihan membawa<br/>kamu lebih dekat ke tujuan.</h2><p>Bangun kebiasaan belajar yang konsisten mulai hari ini.</p><button className="btn white" onClick={()=>setCategory(null)}><Play size={16}/> Mulai latihan wajib</button></div><div className="welcome-art"><BookOpen size={84}/><span>100</span></div></div>
  <div className="metric-grid"><div className="metric"><span className="metric-icon blue"><BookOpen size={21}/></span><small>Latihan wajib</small><strong>{compulsory.length}</strong><span className="metric-foot">Total sesi tercatat</span></div><div className="metric"><span className="metric-icon green"><TrendingUp size={21}/></span><small>Rata-rata nilai</small><strong>{busy?'—':average}</strong><span className="metric-foot">Dari latihan wajib</span></div><div className="metric"><span className="metric-icon purple"><Star size={21}/></span><small>XP terkumpul</small><strong>{attempts.reduce((s,a)=>s+a.earned_xp,0)}</strong><span className="metric-foot">Dari semua latihan</span></div><div className="metric"><span className="metric-icon orange"><Medal size={21}/></span><small>Nilai terakhir</small><strong>{latest?.score??'—'}</strong><span className="metric-foot">{today?'Sudah latihan hari ini':'Belum latihan hari ini'}</span></div></div>
  <div className="dashboard-columns"><section className="white-panel"><div className="panel-heading"><div><span className="section-kicker">PILIH MATERI</span><h2>Latihan numerasi</h2></div><button className="link-action" onClick={()=>setCategory(null)}>Wajib <ArrowRight size={16}/></button></div>
    <div className="practice-list">{categories.map((cat,i)=><button className="practice-item" key={cat} onClick={()=>setCategory(cat)}><span className={'practice-ico c'+i}>{['×','÷','+','↔'][i]}</span><span><b>{cat}</b><small>10 soal latihan mandiri</small></span><ArrowRight size={18}/></button>)}</div></section>
  <section className="white-panel"><div className="panel-heading"><div><span className="section-kicker">HASILMU</span><h2>Riwayat latihan</h2></div><button aria-label="Segarkan riwayat" className="icon-action" onClick={()=>void refresh()}><RefreshCw size={17}/></button></div>
    {compulsory.length===0?<div className="empty-state"><GraduationCap size={35}/><b>Belum ada riwayat latihan</b><p>Kerjakan latihan wajib pertamamu untuk mulai mencatat nilai.</p></div>:<div className="history-list">{compulsory.slice(0,6).map(a=><div key={a.session_key} className="history-row"><span className="history-dot"/><div><b>{new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeZone:'Asia/Jakarta'}).format(new Date(a.completed_at_ms))}</b><small>{a.correct}/{a.question_count} jawaban benar</small></div><span className={'score-chip '+(a.score>=75?'positive':'')}>{a.score}/100</span></div>)}</div>}</section></div>
  <section className="white-panel leaderboard"><div className="panel-heading"><div><span className="section-kicker">KOMUNITAS BELAJAR</span><h2>Peringkat sekolah</h2></div><span className="muted-small"><Users size={16}/> Berdasarkan statistik sekolah</span></div>
    {leaders.length?<div className="leader-list">{leaders.slice(0,8).map((row,i)=><div key={row.username+'-'+i} className="leader-item"><b className="leader-rank">#{i+1}</b><span className="leader-avatar">{row.display_name.slice(0,1)}</span><div><b>{row.display_name}</b><small>{row.classroom} • {row.major}</small></div><span className="leader-points">{row.mandatory_average??'—'} <small>rata-rata</small></span></div>)}</div>:<div className="empty-state"><p>Data peringkat belum tersedia atau RPC Supabase belum aktif.</p></div>}
  </section>
  </>}
 </AppShell>;
}
