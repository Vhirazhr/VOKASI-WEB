'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, CheckCircle2, Clock3, GraduationCap, RefreshCw, School2, TrendingUp, Users } from 'lucide-react';
import AppShell from '@/components/AppShell';
import BankFilterDropdown from '@/components/BankFilterDropdown';
import { useSchoolAuth } from '@/lib/use-school-auth';
import { getAdminAnalyticsAttempts, getSchoolStudents, wibDate, wibRange } from '@/lib/school';
import type { SchoolStudent, AttemptSummary } from '@/lib/types';
import '@/app/admin-workspace.css';
import '@/app/admin-students-ui.css';
import '@/app/admin-analytics.css';

type DailyStats = { date:string; label:string; completed:number; percent:number; average:number|null; scores:number[] };
type GroupStats = { name:string; total:number; completed:number; average:number|null };
const formatDay=(date:string)=>new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',timeZone:'Asia/Jakarta'}).format(new Date(date+'T12:00:00+07:00'));
const average=(scores:number[])=>scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10:null;

function buildStats(students:SchoolStudent[],attempts:AttemptSummary[],endDate:string,days:number) {
  const roster=new Map(students.filter(s=>s.authId).map(s=>[s.authId,s]));
  const byDate=new Map<string,Map<string,AttemptSummary>>();
  // First verified compulsory completion per WIB day is official. Later repeats are history only.
  for(const attempt of [...attempts].sort((a,b)=>a.completed_at_ms-b.completed_at_ms)){
    if(!attempt.auth_user_id||!roster.has(attempt.auth_user_id)||!Number.isFinite(attempt.score)||attempt.score<0||attempt.score>100)continue;
    const day=wibDate(attempt.completed_at_ms);
    if(!byDate.has(day))byDate.set(day,new Map());
    const map=byDate.get(day)!;
    if(!map.has(attempt.auth_user_id))map.set(attempt.auth_user_id,attempt);
  }
  const endStart=wibRange(endDate)[0];
  const daily:DailyStats[]=Array.from({length:days},(_,i)=>{
    const date=wibDate(endStart-(days-1-i)*86400000);
    const map=byDate.get(date);
    const scores=[...(map?.values()||[])].map(a=>a.score);
    return {date,label:formatDay(date),completed:map?.size||0,percent:students.length?Math.round((map?.size||0)*100/students.length):0,average:average(scores),scores};
  });
  const latest=byDate.get(endDate)||new Map<string,AttemptSummary>();
  const groups=new Map<string,{name:string;total:number;scores:number[]}>();
  for(const s of students){
    const id=s.classId||s.majorId+'-'+s.className;
    if(!groups.has(id))groups.set(id,{name:s.className+' • '+s.majorName,total:0,scores:[]});
    const item=groups.get(id)!;
    item.total++;
    const score=latest.get(s.authId)?.score;
    if(score!==undefined)item.scores.push(score);
  }
  const classes:GroupStats[]=[...groups.values()].map(g=>({name:g.name,total:g.total,completed:g.scores.length,average:average(g.scores)}))
    .sort((a,b)=>b.completed-b.completed||a.name.localeCompare(b.name,'id'));
  const endScores=[...latest.values()].map(a=>a.score);
  const bands=[
    {label:'90–100',count:endScores.filter(v=>v>=90).length},
    {label:'75–89',count:endScores.filter(v=>v>=75&&v<90).length},
    {label:'60–74',count:endScores.filter(v=>v>=60&&v<75).length},
    {label:'0–59',count:endScores.filter(v=>v<60).length}
  ];
  return {daily,latest,classes,bands,latestAverage:average(endScores)};
}

export default function AdminAnalyticsPage(){
  const {loading,error,logout}=useSchoolAuth('admin');
  const [endDate,setEndDate]=useState(()=>wibDate());
  const [days,setDays]=useState(14);
  const [students,setStudents]=useState<SchoolStudent[]>([]);
  const [attempts,setAttempts]=useState<AttemptSummary[]>([]);
  const [major,setMajor]=useState(''),[klass,setKlass]=useState('');
  const [busy,setBusy]=useState(true),[notice,setNotice]=useState(''),[refreshKey,setRefreshKey]=useState(0);
  const reload=useCallback(()=>setRefreshKey(k=>k+1),[]);
  useEffect(()=>{if(loading||error)return;let active=true;
    async function load(){
      try{
        const [roster,sessions]=await Promise.all([getSchoolStudents(),getAdminAnalyticsAttempts(endDate,days)]);
        if(active){setStudents(roster);setAttempts(sessions);setNotice('');setBusy(false);}
      }catch(e){
        if(active){setNotice('Analitik belum dapat dimuat: '+(e instanceof Error?e.message:'Terjadi kesalahan mengambil data.'));setBusy(false);}
      }
    }
    queueMicrotask(()=>void load());
    return ()=>{active=false};
  },[loading,error,endDate,days,refreshKey]);

  const majors=useMemo(()=>[...new Set(students.map(s=>s.majorName))].sort((a,b)=>a.localeCompare(b,'id')),[students]);
  const classes=useMemo(()=>[...new Set(students.filter(s=>!major||s.majorName===major).map(s=>s.className))].sort((a,b)=>a.localeCompare(b,'id')),[students,major]);
  const scope=useMemo(()=>students.filter(s=>(!major||s.majorName===major)&&(!klass||s.className===klass)),[students,major,klass]);
  const stats=useMemo(()=>buildStats(scope,attempts,endDate,days),[scope,attempts,endDate,days]);
  const denominator=scope.length;
  const endCount=stats.latest.size;
  const endRate=denominator?Math.round(endCount/denominator*100):0;
  const periodAverage=average(stats.daily.flatMap(d=>d.scores));
  const maxComplete=Math.max(1,...stats.daily.map(d=>d.completed));
  const hasFilters=major!==''||klass!==''||days!==14||endDate!==wibDate();
  function resetFilters(){
    const today=wibDate();
    const requiresReload=days!==14||endDate!==today;
    setEndDate(today);setDays(14);setMajor('');setKlass('');
    if(requiresReload)setBusy(true);
  }
  const maxBand=Math.max(1,...stats.bands.map(b=>b.count));

  if(loading)return <main className="page-loader">Memverifikasi akses admin...</main>;
  if(error)return <main className="page-loader">{error}</main>;
  return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
    <div className="admin-analytics admin-students-page">
      <section className="admin-students-hero admin-analytics-hero" aria-label="Ringkasan analitik hasil belajar">
        <header className="admin-workspace-header analytics-hero-heading">
          <span className="section-kicker">MONITORING SEKOLAH</span>
          <h1>Analitik hasil belajar</h1>
          <p>Pantau partisipasi latihan wajib dan perkembangan nilai siswa berdasarkan data yang tersimpan di Supabase.</p>
          <button type="button" className="analytics-hero-refresh" disabled={busy} onClick={()=>{setBusy(true);reload();}}><RefreshCw size={16}/> {busy?'Memuat data...':'Segarkan data'}</button>
        </header>
        <div className="admin-mini-stats analytics-hero-stats">
          <div><Users size={20}/><span>Siswa dalam filter</span><strong>{busy?'—':denominator.toLocaleString('id-ID')}</strong></div>
          <div><CheckCircle2 size={20}/><span>Latihan pada {formatDay(endDate)}</span><strong>{busy?'—':endCount.toLocaleString('id-ID')}<small> / {denominator.toLocaleString('id-ID')}</small></strong></div>
          <div><TrendingUp size={20}/><span>Rata-rata nilai harian</span><strong>{busy?'—':stats.latestAverage===null?'—':stats.latestAverage.toLocaleString('id-ID')}</strong></div>
          <div><Clock3 size={20}/><span>Rata-rata nilai periode</span><strong>{busy?'—':periodAverage===null?'—':periodAverage.toLocaleString('id-ID')}</strong></div>
        </div>
      </section>
      <section className="analytics-filter-card" aria-label="Filter laporan analitik">
        <div className="analytics-filter-heading"><div><span className="section-kicker">ATUR LAPORAN</span><h2>Filter analitik</h2><p>Pilih periode, jurusan, atau kelas untuk menampilkan hasil yang relevan.</p></div>
          {hasFilters&&<button type="button" className="analytics-reset" onClick={resetFilters}>Reset filter</button>}
        </div>
        <div className="analytics-filter-grid">
          <label className="analytics-date-field">Tanggal akhir (WIB)
            <span className="analytics-input-wrap"><CalendarDays size={16}/><input aria-label="Tanggal akhir laporan" type="date" value={endDate} max={wibDate()} onChange={e=>{if(e.target.value){setEndDate(e.target.value);setBusy(true);}}}/></span>
          </label>
          <fieldset className="analytics-period-field"><legend>Periode</legend>
            <div className="analytics-period-options" aria-label="Pilihan rentang hari">
              {[7,14,30].map(value=><button type="button" key={value} aria-pressed={days===value} className={days===value?'active':''} onClick={()=>{if(days!==value){setDays(value);setBusy(true);}}}>{value} hari</button>)}
            </div>
          </fieldset>
          <BankFilterDropdown label="Jurusan" value={major} items={[{value:'',label:'Semua jurusan'},...majors.map(name=>({value:name,label:name}))]} onChange={value=>{setMajor(value);setKlass('');}}/>
          <BankFilterDropdown label="Kelas" value={klass} items={[{value:'',label:'Semua kelas'},...classes.map(name=>({value:name,label:name}))]} onChange={setKlass}/>
        </div>
      </section>
      {notice&&<div className="alert danger" role="alert">{notice}<button className="link-action" type="button" onClick={()=>{setBusy(true);reload();}}> Coba lagi</button></div>}
      {!busy&&!notice&&<>
        <div className="analytics-context" role="status"><div><CheckCircle2 size={15}/><span><strong>{endRate}% partisipasi</strong> pada {formatDay(endDate)} · {days} hari pengamatan</span></div><p>Nilai kosong berarti belum ada sesi latihan wajib yang tercatat, bukan nilai nol.</p></div>
        <div className="analytics-main-grid">
          <section className="analytics-panel">
            <div className="analytics-panel-head"><div><span className="section-kicker">AKTIVITAS HARIAN</span><h2>Partisipasi latihan wajib</h2><p>Jumlah siswa dengan minimal satu sesi pada setiap hari.</p></div><BarChart3 size={23}/></div>
            {stats.daily.every(d=>d.completed===0)&&<div className="analytics-empty-note">Belum ada sesi latihan wajib pada periode yang dipilih.</div>}
            <div className="analytics-bar-chart" role="img" aria-label="Grafik jumlah siswa yang telah mengerjakan latihan wajib per hari">
              {stats.daily.map(d=><div key={d.date} className="analytics-bar-column" title={d.label+': '+d.completed+' siswa, rata-rata '+(d.average??'—')}>
                <span className="analytics-bar-count">{d.completed}</span><div className="analytics-bar-track"><div style={{height:(d.completed===0?0:Math.max(4,d.completed/maxComplete*100))+'%'}}/></div><span className="analytics-bar-day">{d.label}</span>
              </div>)}
            </div>
            <p className="analytics-note">Angka 0 berarti tidak ada sesi wajib tercatat untuk tanggal tersebut. Data lama dan data latihan mandiri tidak digabungkan.</p>
          </section>
          <section className="analytics-panel analytics-band-panel">
            <div className="analytics-panel-head"><div><span className="section-kicker">SEBARAN NILAI</span><h2>Kelompok hasil belajar</h2><p>Nilai terakhir per siswa pada {formatDay(endDate)}.</p></div><GraduationCap size={23}/></div>
            {endCount===0&&<div className="analytics-empty-note">Belum ada nilai pada tanggal yang dipilih.</div>}
            {stats.bands.map((band,i)=><div className="analytics-band-row" key={band.label}><span>{band.label}</span><div className={'analytics-band-track shade-'+i}><div style={{width:Math.round(band.count/maxBand*100)+'%'}}/></div><strong>{band.count}</strong></div>)}
            <div className="analytics-band-footer"><span>Total siswa dengan nilai</span><strong>{endCount}</strong></div>
          </section>
        </div>
        <section className="analytics-panel">
          <div className="analytics-panel-head"><div><span className="section-kicker">RINGKASAN KELAS</span><h2>Performa tiap kelas</h2><p>Perbandingan pada tanggal akhir yang dipilih, hanya untuk kelas dalam filter.</p></div><School2 size={23}/></div>
          <div className="analytics-table-wrap"><table><thead><tr><th>Kelas / jurusan</th><th>Jumlah siswa</th><th>Sudah latihan</th><th>Partisipasi</th><th>Rata-rata nilai</th></tr></thead>
          <tbody>{stats.classes.map(g=><tr key={g.name}><td><b>{g.name}</b></td><td>{g.total}</td><td>{g.completed}</td><td><div className="analytics-rate"><div><span style={{width:(g.total?Math.round(g.completed/g.total*100):0)+'%'}}/></div><small>{g.total?Math.round(g.completed/g.total*100):0}%</small></div></td><td><b>{g.average??'—'}</b></td></tr>)}
          {!stats.classes.length&&<tr><td colSpan={5} className="analytics-empty">Belum ada kelas pada filter ini.</td></tr>}</tbody></table></div>
        </section>
        <div className="analytics-disclaimer">Data analitik menampilkan hasil yang tersimpan di database sesuai hak akses admin. Rekap ini bukan sertifikasi hasil ujian resmi atau validasi anti-kecurangan server. Nilai siswa yang belum mengerjakan tidak dihitung sebagai nol.</div>
      </>}
      {busy&&<div className="analytics-panel analytics-loading"><RefreshCw size={22}/> Mengambil data riwayat dari Supabase...</div>}
    </div>
  </AppShell>;
}
