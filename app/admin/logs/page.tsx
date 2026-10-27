'use client';

import {useEffect,useMemo,useState} from 'react';
import {Activity,BookOpen,CheckCircle2,ChevronLeft,ChevronRight,Clock3,RefreshCw,Search,ScrollText,ShieldCheck,Users} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {adminWibTimestamp,getAdminActivity,type AdminActivity,type AdminLogKind} from '@/lib/admin-monitor';
import '@/app/admin-workspace.css';
import '@/app/admin-students-ui.css';
import '@/app/admin-monitor.css';

const filters:{key:AdminLogKind;label:string}[]=[
 {key:'all',label:'Semua aktivitas'},
 {key:'mandatory',label:'Latihan wajib'},
 {key:'practice',label:'Latihan mandiri'},
 {key:'admin',label:'Perubahan admin'}
];
const limit=30;
function labelFor(item:AdminActivity){
 if(item.kind==='mandatory')return {icon:<CheckCircle2 size={18}/>,label:'Latihan wajib',className:'mandatory'};
 if(item.kind==='practice')return {icon:<BookOpen size={18}/>,label:'Latihan mandiri',className:'practice'};
 return {icon:<ShieldCheck size={18}/>,label:'Admin',className:'admin'};
}
export default function AdminLogsPage(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [kind,setKind]=useState<AdminLogKind>('all');
 const [days,setDays]=useState(30);
 const [page,setPage]=useState(0);
 const [search,setSearch]=useState('');
 const [total,setTotal]=useState(0);
 const [events,setEvents]=useState<AdminActivity[]>([]);
 const [busy,setBusy]=useState(true);
 const [notice,setNotice]=useState('');
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  if(loading||error)return;
  let active=true;
  async function load(){
   try{
    const result=await getAdminActivity(kind,days,page*limit);
    if(!active)return;
    setTotal(result.total);setEvents(result.items);setNotice('');
   }catch(e){if(active){setNotice(e instanceof Error?e.message:'Gagal memuat log aktivitas.');setEvents([]);setTotal(0);}}
   finally{if(active)setBusy(false);}
  }
  void load();
  return()=>{active=false};
 },[loading,error,kind,days,page,revision]);

 const matching=useMemo(()=>{
  const term=search.trim().toLocaleLowerCase('id-ID');
  return term?events.filter(event=>[event.title,event.actor,event.class_name,event.detail].some(value=>value.toLocaleLowerCase('id-ID').includes(term))):events;
 },[events,search]);
 const maxPages=Math.max(1,Math.ceil(total/limit));
 function changeKind(next:AdminLogKind){setKind(next);setPage(0);setSearch('');setBusy(true);}
 function changeDays(next:number){setDays(next);setPage(0);setSearch('');setBusy(true);}
 function refresh(){setBusy(true);setRevision(value=>value+1);}
 if(loading)return <main className="page-loader">Memverifikasi akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
  <main className="admin-workspace admin-students-page admin-logs-page">
   <section className="admin-students-hero admin-logs-hero" aria-label="Ringkasan log aktivitas">
    <header className="admin-workspace-header">
     <span className="section-kicker">MONITORING SEKOLAH</span>
     <h1>Log Aktivitas</h1>
     <p>Pantau latihan yang sudah diverifikasi dan perubahan data sekolah. Disusun menurut waktu kejadian, terbaru lebih dahulu.</p>
    </header>
    <div className="admin-mini-stats">
     <div><Activity size={20}/><span>Aktivitas pada filter</span><strong>{busy?'—':total.toLocaleString('id-ID')}</strong></div>
     <div><Clock3 size={20}/><span>Rentang pantauan</span><strong>{days} <small>hari</small></strong></div>
     <div><Users size={20}/><span>Halaman riwayat</span><strong>{page+1}<small> / {maxPages}</small></strong></div>
    </div>
   </section>
   <section className="admin-data-card admin-logs-panel" aria-labelledby="admin-logs-title">
    <div className="admin-logs-heading">
     <div><span className="section-kicker">RIWAYAT TERCATAT</span><h2 id="admin-logs-title">Aktivitas sistem</h2><p>Riwayat berasal dari latihan terverifikasi, catatan perubahan admin, dan audit penyuntingan soal.</p></div>
     <button type="button" className="admin-logs-refresh" disabled={busy} onClick={refresh}><RefreshCw size={16}/> {busy?'Memuat...':'Segarkan log'}</button>
    </div>
    <div className="admin-logs-controls">
     <div className="admin-logs-filter-tabs" aria-label="Filter jenis aktivitas">{filters.map(option=><button type="button" key={option.key} aria-pressed={kind===option.key} className={kind===option.key?'active':''} onClick={()=>changeKind(option.key)}>{option.label}</button>)}</div>
     <div className="admin-logs-other-filters">
      <label>Periode<select value={days} onChange={event=>changeDays(Number(event.target.value))}><option value={7}>7 hari</option><option value={30}>30 hari</option><option value={90}>90 hari</option></select></label>
      <label className="admin-logs-search"><Search size={17}/><input aria-label="Cari aktivitas pada halaman ini" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Cari pada halaman ini..."/></label>
     </div>
    </div>
    {notice&&<div role="alert" className="alert danger">{notice} <button className="admin-logs-retry" type="button" onClick={refresh}>Coba lagi</button></div>}
    {busy?<div className="admin-logs-empty"><RefreshCw size={21}/> Memuat aktivitas dari Supabase...</div>:
     matching.length===0?<div className="admin-logs-empty"><ScrollText size={22}/>{total===0?'Belum ada aktivitas tercatat untuk filter ini.':'Tidak ada aktivitas yang cocok pada halaman ini.'}</div>:
     <div className="admin-logs-list">
      {matching.map(item=>{const visual=labelFor(item);return <article className="admin-logs-item" key={item.id}>
       <span className={'admin-logs-event-icon '+visual.className}>{visual.icon}</span>
       <div className="admin-logs-item-main"><div className="admin-logs-item-top"><strong>{item.title}</strong><span className={'admin-logs-tag '+visual.className}>{visual.label}</span></div>
        <p><b>{item.actor}</b>{item.kind!=='admin'?' · '+item.class_name:''}</p>
        <span className="admin-logs-details">{item.detail}{item.score!==null?' · Nilai '+item.score:''}</span>
       </div>
       <time className="admin-logs-time" dateTime={item.occurred_at}><Clock3 size={14}/>{adminWibTimestamp(item.occurred_at)}</time>
      </article>;})}
     </div>}
    <div className="admin-logs-pagination">
     <span>Menampilkan {matching.length} dari {total.toLocaleString('id-ID')} aktivitas dalam filter{search?' (pencarian di halaman ini)':''}.</span>
     <div><button type="button" disabled={busy||page===0} onClick={()=>{setPage(value=>Math.max(0,value-1));setBusy(true);}}><ChevronLeft size={15}/> Sebelumnya</button><span>{page+1} / {maxPages}</span><button type="button" disabled={busy||page>=maxPages-1} onClick={()=>{setPage(value=>value+1);setBusy(true);}}>Berikutnya <ChevronRight size={15}/></button></div>
    </div>
   </section>
   <p className="admin-logs-disclaimer">Notifikasi pada lonceng diperbarui saat admin membuka halaman dan diperiksa sekitar setiap 30 detik selama tab aktif. Hanya penyelesaian latihan yang terverifikasi server yang menghasilkan pemberitahuan; ini bukan laporan aktivitas klik atau status online secara langsung.</p>
  </main>
 </AppShell>;
}
