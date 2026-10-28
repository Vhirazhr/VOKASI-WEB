'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {ArrowDownToLine,ArrowLeft,BookOpen,CalendarDays,CheckCircle2,ChevronLeft,ChevronRight,Clock3,Eye,Filter,RefreshCw,Search,Users,XCircle} from 'lucide-react';
import AppShell from '@/components/AppShell';
import AdminAnswerReview from '@/components/AdminAnswerReview';
import {exportAdminGrades} from '@/lib/admin-excel';
import {getAdminAttempts,getSchoolStudents,latestGrades,wibDate} from '@/lib/school';
import {useSchoolAuth} from '@/lib/use-school-auth';
import type {Attempt,SchoolStudent} from '@/lib/types';
import '@/app/admin-workspace.css';
import '@/app/admin-students-ui.css';
import '@/app/admin-monitoring-grades.css';

const PAGE_SIZE=12;
export default function AdminMonitoringPage(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [students,setStudents]=useState<SchoolStudent[]>([]);
 const [attempts,setAttempts]=useState<Attempt[]>([]);
 const [date,setDate]=useState(()=>wibDate());
 const [major,setMajor]=useState(''),[klass,setKlass]=useState(''),[query,setQuery]=useState('');
 const [onlyMissing,setOnlyMissing]=useState(false),[page,setPage]=useState(0);
 const [busy,setBusy]=useState(true),[issue,setIssue]=useState('');
 const [refreshKey,setRefreshKey]=useState(0),[exporting,setExporting]=useState(false);
 const [reviewing,setReviewing]=useState<{attempt:Attempt;name:string}|null>(null);
 const [embed,setEmbed]=useState(false);
 useEffect(()=>{queueMicrotask(()=>setEmbed(new URLSearchParams(window.location.search).get('embed')==='1'));},[]);
 useEffect(()=>{
  if(loading||error)return;
  let active=true;
  async function fetchData(){
    const [roster,results]=await Promise.allSettled([getSchoolStudents(),getAdminAttempts(date)]);
    if(!active)return;
    if(roster.status==='fulfilled')setStudents(roster.value);
    if(results.status==='fulfilled')setAttempts(results.value);
    const problems=[
      ...(roster.status==='rejected'?['Daftar siswa: '+String(roster.reason)]:[]),
      ...(results.status==='rejected'?['Hasil nilai: '+String(results.reason)]:[])
    ];
    setIssue(problems.join(' · '));setBusy(false);
  }
  queueMicrotask(()=>void fetchData());
  return()=>{active=false;};
 },[loading,error,date,refreshKey]);
 const grades=useMemo(()=>latestGrades(attempts,students),[attempts,students]);
 const majors=useMemo(()=>[...new Set(students.map(s=>s.majorName))].sort((a,b)=>a.localeCompare(b,'id')),[students]);
 const classes=useMemo(()=>[...new Set(students.filter(s=>!major||s.majorName===major).map(s=>s.className))].sort((a,b)=>a.localeCompare(b,'id')),[students,major]);
 const scoped=useMemo(()=>students.filter(s=>(!major||s.majorName===major)&&(!klass||s.className===klass)),[students,major,klass]);
 const filtered=useMemo(()=>scoped.filter(s=>(!onlyMissing||!grades.has(s.authId))
  &&(!query||[s.fullName,s.username,s.className].some(v=>v.toLowerCase().includes(query.trim().toLowerCase()))))
  .sort((a,b)=>Number(!grades.has(a.authId))-Number(!grades.has(b.authId))||a.fullName.localeCompare(b.fullName,'id')),
  [scoped,grades,onlyMissing,query]);
 const completed=scoped.filter(s=>grades.has(s.authId)).length;
 const missing=scoped.length-completed;
 const average=completed?Math.round(scoped.reduce((sum,s)=>sum+(grades.get(s.authId)?.score??0),0)/completed*10)/10:null;
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
 const activePage=Math.min(page,pages-1);
 const rows=filtered.slice(activePage*PAGE_SIZE,(activePage+1)*PAGE_SIZE);
 const confirmed=!busy&&!issue;
 async function download(){
  if(busy||issue||exporting||!scoped.length)return;
  setExporting(true);
  try{const freshAttempts=await getAdminAttempts(date);
   const freshGrades=latestGrades(freshAttempts,students);
   if(!freshGrades.size&&!window.confirm('Tidak ada nilai wajib terverifikasi pada '+date+'. Unduh laporan dengan status belum tercatat?'))return;
   await exportAdminGrades(scoped,freshGrades,date,major,klass);}
  catch(e){setIssue('Gagal ekspor Excel: '+(e instanceof Error?e.message:'Kesalahan tidak diketahui'));}
  finally{setExporting(false);}
 }
 function reload(){setBusy(true);setIssue('');setRefreshKey(x=>x+1);}
 function changeDate(value:string){setDate(value);setPage(0);setBusy(true);setIssue('');}
 if(loading)return <main className="page-loader">Memverifikasi akses administrator...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
  <main className="admin-workspace admin-monitoring-page">
   <section className="admin-monitoring-hero">
    <div><span className="section-kicker">MONITORING NILAI WAJIB</span><h1>Pantau hasil setiap siswa.</h1><p>Lihat siswa yang sudah latihan dan yang belum, nilai resmi, serta pembahasan jawaban terverifikasi.</p></div>
    <div className="admin-monitoring-hero-stat"><span>PARTISIPASI HARIAN</span><strong>{confirmed&&scoped.length?Math.round(completed/scoped.length*100)+'%':'—'}</strong><small>{confirmed?completed+' dari '+scoped.length+' siswa tercatat':'Menunggu verifikasi server'}</small></div>
   </section>
   {issue&&<div className="alert danger" role="alert">{issue} <button type="button" onClick={reload}>Coba lagi</button></div>}
   <div className="admin-monitoring-top-stats">
    <div><span className="stat-icon blue"><Users size={19}/></span><span>Jumlah siswa</span><strong>{students.length?scoped.length.toLocaleString('id-ID'):'—'}</strong></div>
    <div><span className="stat-icon green"><CheckCircle2 size={19}/></span><span>Sudah latihan</span><strong>{confirmed?completed:'—'}</strong></div>
    <div><span className="stat-icon amber"><Clock3 size={19}/></span><span>Belum tercatat</span><strong>{confirmed?missing:'—'}</strong></div>
    <div><span className="stat-icon purple"><BookOpen size={19}/></span><span>Rata-rata nilai</span><strong>{confirmed?average??'—':'—'}</strong></div>
   </div>
   <section className="admin-monitoring-card">
    <div className="admin-monitoring-card-top">
     <div><span className="section-kicker">HASIL LATIHAN WAJIB</span><h2>Daftar monitoring siswa</h2><p>Nilai pertama yang terverifikasi pada hari terpilih. Pengulangan tidak mengganti nilai resmi.</p></div>
     <Link className="admin-monitoring-back" href={embed?'/admin?embed=1':'/admin'}><ArrowLeft size={16}/> Ringkasan</Link>
    </div>
    <div className="admin-monitoring-filters">
     <label>Tanggal (WIB)<span><CalendarDays size={16}/><input type="date" value={date} max={wibDate()} onChange={e=>changeDate(e.target.value)}/></span></label>
     <label>Jurusan<select value={major} onChange={e=>{setMajor(e.target.value);setKlass('');setPage(0);}}><option value="">Semua jurusan</option>{majors.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
     <label>Kelas<select value={klass} onChange={e=>{setKlass(e.target.value);setPage(0);}}><option value="">Semua kelas</option>{classes.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
     <button type="button" className="admin-monitoring-refresh" onClick={reload} disabled={busy}><RefreshCw size={16}/>{busy?'Memuat...':'Segarkan'}</button>
    </div>
    <div className="admin-monitoring-toolbar">
     <label className="admin-monitoring-search"><Search size={18}/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="Cari nama, username atau kelas..." aria-label="Cari siswa"/></label>
     <div className="admin-monitoring-actions">
      <button type="button" className={onlyMissing?'admin-monitoring-missing active':'admin-monitoring-missing'} aria-pressed={onlyMissing} onClick={()=>{setOnlyMissing(v=>!v);setPage(0);}}><Filter size={15}/> {onlyMissing?'Hanya belum tercatat':'Belum tercatat saja'}</button>
      <button type="button" className="admin-monitoring-export" disabled={!confirmed||!scoped.length||exporting} onClick={()=>void download()}><ArrowDownToLine size={17}/>{exporting?'Membuat Excel...':'Unduh Excel seluruh filter'}</button>
     </div>
    </div>
    {busy?<div className="admin-monitoring-empty"><RefreshCw size={22}/> Mengambil hasil dari Supabase...</div>:
     issue?<div className="admin-monitoring-empty"><XCircle size={22}/> Gagal memverifikasi hasil. Silakan segarkan data.</div>:
     rows.length===0?<div className="admin-monitoring-empty"><Users size={23}/> Tidak ada siswa yang sesuai filter.</div>:
     <div className="admin-monitoring-list">{rows.map(s=>{
      const grade=grades.get(s.authId);
      const reviewable=!!grade&&grade.signature?.startsWith('WEB-SERVER-v1:');
      const initials=s.fullName.trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase()||'S';
      return <article key={s.id} className="admin-monitoring-student">
       <div className="admin-monitoring-avatar">{initials}</div>
       <div className="admin-monitoring-identity"><strong>{s.fullName}</strong><span>{s.className} · {s.majorName}</span><small>@{s.username||'belum ada username'}</small></div>
       <div className="admin-monitoring-result">
        {grade?<><span className="admin-monitoring-score">{grade.score}<small>/100</small></span><small>{grade.correct}/{grade.question_count} benar</small></>:
          <span className="admin-monitoring-not-done">Belum tercatat</span>}
       </div>
       <div className="admin-monitoring-student-action">
         <button type="button" disabled={!reviewable} title={!reviewable?'Pembahasan hanya untuk sesi web terverifikasi':'Lihat pembahasan terverifikasi'} onClick={()=>{if(grade)setReviewing({attempt:grade,name:s.fullName});}}><Eye size={16}/> {reviewable?'Lihat jawaban':'Belum ada pembahasan'}</button>
       </div>
      </article>;
     })}</div>}
    <footer className="admin-monitoring-pagination">
      <span>{confirmed?filtered.length.toLocaleString('id-ID')+' siswa · Halaman '+(activePage+1)+' dari '+pages:'Menunggu hasil terverifikasi'}</span>
      <div><button type="button" disabled={activePage===0} onClick={()=>setPage(x=>Math.max(0,x-1))}><ChevronLeft size={16}/> Sebelumnya</button><button type="button" disabled={activePage+1>=pages} onClick={()=>setPage(x=>x+1)}>Berikutnya <ChevronRight size={16}/></button></div>
    </footer>
   </section>
   <p className="admin-monitoring-help">Hasil dari Supabase · Belum tercatat bukan berarti tidak hadir. Jika hasil belum sinkron, gunakan tombol Segarkan.</p>
  </main>
  {reviewing&&<AdminAnswerReview student={reviewing.name} attempt={reviewing.attempt} onClose={()=>setReviewing(null)}/>}
 </AppShell>;
}
