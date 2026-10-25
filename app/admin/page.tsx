'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowDownToLine,BookOpen,CalendarDays,ChartColumnIncreasing,CheckCircle2,Clock3,RefreshCw,School,Search,TrendingUp,Users,XCircle} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {getAdminAttempts,getSchoolStudents,latestGrades,wibDate} from '@/lib/school';
import type {Attempt,SchoolStudent} from '@/lib/types';
const PAGE=50;
export default function AdminPage(){const {loading,error,logout}=useSchoolAuth('admin');
 const [students,setStudents]=useState<SchoolStudent[]>([]);const [attempts,setAttempts]=useState<Attempt[]>([]);
 const [date,setDate]=useState(()=>wibDate());const [major,setMajor]=useState('');const [klass,setKlass]=useState('');const [search,setSearch]=useState('');const [status,setStatus]=useState('all');const [page,setPage]=useState(0);
 const requestId=useRef(0);
 const [busy,setBusy]=useState(true);const [notice,setNotice]=useState('');const [refreshKey,setRefreshKey]=useState(0);const [exporting,setExporting]=useState(false);const [embed,setEmbed]=useState(false);
 useEffect(()=>{queueMicrotask(()=>setEmbed(new URLSearchParams(window.location.search).get('embed')==='1'));},[]);
 useEffect(()=>{if(loading||error)return;let active=true;
  async function loadRoster(){try{const result=await getSchoolStudents();if(active)setStudents(result);}catch(e){if(active)setNotice('Gagal mengambil roster sekolah: '+(e instanceof Error?e.message:'Kesalahan tidak diketahui'));}}
  void loadRoster();return()=>{active=false;};
 },[loading,error]);
 const refresh=useCallback(async()=>{if(loading||error)return;const request=++requestId.current;setBusy(true);setNotice('');
  try{const result=await getAdminAttempts(date);if(request===requestId.current)setAttempts(result);}catch(e){if(request===requestId.current){setAttempts([]);setNotice('Nilai belum terverifikasi: '+(e instanceof Error?e.message:'Tidak dapat mengambil nilai Supabase.'));}}finally{if(request===requestId.current)setBusy(false);}
 },[date,loading,error]);
 useEffect(()=>{queueMicrotask(()=>void refresh());const id=setInterval(()=>void refresh(),20000);return()=>clearInterval(id);},[refresh,refreshKey]);
 const allGrades=useMemo(()=>latestGrades(attempts,students),[attempts,students]);
 const majors=useMemo(()=>Array.from(new Set(students.map(s=>s.majorName))).sort((a,b)=>a.localeCompare(b,'id')),[students]);
 const classes=useMemo(()=>Array.from(new Set(students.filter(s=>!major||s.majorName===major).map(s=>s.className))).sort((a,b)=>a.localeCompare(b,'id')),[students,major]);
 const scope=useMemo(()=>students.filter(s=>(!major||s.majorName===major)&&(!klass||s.className===klass)),[students,major,klass]);
 const complete=scope.filter(s=>allGrades.has(s.authId)).length;
 const avgScores=scope.map(s=>allGrades.get(s.authId)?.score).filter((x):x is number=>x!==undefined);
 const avg=avgScores.length?Math.round(avgScores.reduce((a,b)=>a+b,0)/avgScores.length):0;
 const filtered=useMemo(()=>scope.filter(s=>(!search||s.fullName.toLowerCase().includes(search.toLowerCase())||s.username.toLowerCase().includes(search.toLowerCase()))&&
   (status==='all'||(status==='complete'?allGrades.has(s.authId):!allGrades.has(s.authId)))).sort((a,b)=>a.fullName.localeCompare(b.fullName,'id')),[scope,search,status,allGrades]);
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE));const rows=filtered.slice(Math.min(page,pages-1)*PAGE,(Math.min(page,pages-1)+1)*PAGE);
 
 async function exportExcel(){if(notice||busy||!klass)return;setExporting(true);
  try{const ExcelJS=(await import('exceljs')).default;const book=new ExcelJS.Workbook();book.creator='VOKASI Web';
    const sheet=book.addWorksheet('Nilai Siswa');sheet.columns=[
      {header:'No',key:'no',width:8},{header:'Nama Siswa',key:'name',width:38},{header:'Kelas',key:'class',width:22},
      {header:'Tanggal',key:'date',width:19},{header:'Nilai',key:'score',width:13},{header:'Status',key:'status',width:22}
    ];sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF17345D'}};
    scope.forEach((s,i)=>{const score=allGrades.get(s.authId)?.score;
      const safe=(value:string)=>/^[=+\-@\t\r]/.test(value)?("'"+value):value;
      sheet.addRow({no:i+1,name:safe(s.fullName),class:safe(s.className),date,score:score??'',status:score!==undefined?'Selesai':'Belum Mengerjakan'});
    });
    sheet.autoFilter={from:'A1',to:`F${scope.length+1}`};sheet.views=[{state:'frozen',ySplit:1}];
    const bytes=await book.xlsx.writeBuffer();const blob=new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`VOKASI_Nilai_${klass.replace(/[^a-zA-Z0-9_-]/g,'_')}_${date}.xlsx`;a.click();URL.revokeObjectURL(url);
  }catch(e){setNotice('Ekspor Excel gagal: '+(e instanceof Error?e.message:'Kesalahan tidak diketahui'));}finally{setExporting(false);}
 }
 if(loading)return <main className="page-loader">Memverifikasi akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()} embed={embed}>
   <div className="dashboard-heading"><div><div className="section-kicker">PANEL ADMINISTRASI</div><h1>Ringkasan sekolah <span>📊</span></h1><p>Data nilai terintegrasi dengan akun Supabase VOKASI.</p></div><span className="today-tag"><School size={16}/> Tahun ajaran 2026/2027</span></div>
   <div className="admin-banner"><div><span className="welcome-eyebrow">PEMANTAUAN AKADEMIK</span><h2>Semua perkembangan siswa,<br/>dalam satu dashboard.</h2><p>Filter nilai berdasarkan tanggal, jurusan, kelas, dan status pengerjaan.</p></div><ChartColumnIncreasing size={98}/></div>
   <section id="hasil" className="white-panel filters-panel"><div className="panel-heading"><div><span className="section-kicker">FILTER DATA</span><h2>Laporan nilai harian</h2></div><span className="muted-small"><Clock3 size={15}/> WIB (UTC+7)</span></div>
     <div className="filter-grid"><label>Tanggal <div className="filter-input"><CalendarDays size={16}/><input aria-label="Tanggal nilai" type="date" value={date} onChange={e=>{setDate(e.target.value);setPage(0);}}/></div></label>
       <label>Jurusan <select value={major} onChange={e=>{setMajor(e.target.value);setKlass('');setPage(0);}}><option value="">Semua jurusan</option>{majors.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
       <label>Kelas <select value={klass} onChange={e=>{setKlass(e.target.value);setPage(0);}}><option value="">Semua kelas</option>{classes.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
       <label>Status <select value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">Semua siswa</option><option value="complete">Sudah mengerjakan</option><option value="missing">Belum mengerjakan</option></select></label></div>
   </section>
   {notice&&<div className="alert danger" role="alert">{notice} <button className="link-action" onClick={()=>setRefreshKey(v=>v+1)}>Ulangi</button></div>}
   <div className="metric-grid"><div className="metric"><span className="metric-icon blue"><Users size={21}/></span><small>Jumlah siswa</small><strong>{scope.length}</strong><span className="metric-foot">Dalam filter sekolah</span></div>
     <div className="metric"><span className="metric-icon green"><CheckCircle2 size={21}/></span><small>Sudah latihan</small><strong>{busy||!!notice?'—':complete}</strong><span className="metric-foot">{date} • wajib</span></div>
     <div className="metric"><span className="metric-icon orange"><Clock3 size={21}/></span><small>Belum tercatat</small><strong>{busy||!!notice?'—':scope.length-complete}</strong><span className="metric-foot">Belum ada nilai hari ini</span></div>
     <div className="metric"><span className="metric-icon purple"><TrendingUp size={21}/></span><small>Rata-rata nilai</small><strong>{busy||!!notice?'—':avgScores.length?avg:'—'}</strong><span className="metric-foot">Dari nilai terverifikasi</span></div></div>
   <section id="siswa" className="white-panel"><div className="panel-heading"><div><span className="section-kicker">AKTIVITAS SISWA</span><h2>Nilai siswa</h2><p className="muted-small">{!notice&&!busy?`${attempts.length} sesi wajib • ${new Set(attempts.map(a=>a.auth_user_id)).size} akun siswa mengirim`:'Menunggu data server terverifikasi'}</p></div>
     <div className="panel-actions"><button className="btn secondary small" onClick={()=>setRefreshKey(v=>v+1)} disabled={busy}><RefreshCw size={16}/> Segarkan</button>
     <button title={!klass?'Pilih satu kelas sebelum mengunduh laporan':undefined} className="btn primary small" onClick={()=>void exportExcel()} disabled={busy||!!notice||exporting||!students.length||!klass}><ArrowDownToLine size={16}/> {exporting?'Mengekspor...':'Unduh Excel'}</button></div></div>
     <div className="table-search"><Search size={17}/><input placeholder="Cari nama atau username siswa..." value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></div>
     {busy?<div className="empty-state">Mengambil nilai resmi dari Supabase...</div>:<div className="table-wrap"><table className="grade-table"><thead><tr><th>No.</th><th>Nama siswa</th><th>Jurusan</th><th>Kelas</th><th>Nilai</th><th>Status</th></tr></thead><tbody>
      {rows.map((s,i)=>{const record=allGrades.get(s.authId);return <tr key={s.id}><td>{Math.min(page,pages-1)*PAGE+i+1}</td><td><b>{s.fullName}</b><small>@{s.username||'belum terdaftar'}</small></td><td>{s.majorName}</td><td>{s.className}</td><td>{record?<span className="score-chip positive">{record.score}/100</span>:'—'}</td><td>{record?<span className="status-label done"><CheckCircle2 size={13}/> Selesai</span>:<span className="status-label pending"><XCircle size={13}/> Belum tercatat</span>}</td></tr>})}
      {!rows.length&&<tr><td colSpan={6} className="table-empty">Tidak ada siswa yang sesuai dengan filter.</td></tr>}</tbody></table></div>}
      <div className="table-footer"><span>Menampilkan {rows.length} dari {filtered.length} siswa</span><div><button className="btn secondary small" disabled={page<=0} onClick={()=>setPage(v=>Math.max(0,v-1))}>Sebelumnya</button><span>{Math.min(page,pages-1)+1} / {pages}</span><button className="btn secondary small" disabled={page>=pages-1} onClick={()=>setPage(v=>v+1)}>Berikutnya</button></div></div>
   </section>
   <div className="admin-help"><BookOpen size={20}/><p><b>Info sinkronisasi:</b> nilai wajib dimuat langsung dari Supabase setiap 20 detik. Data ditautkan menggunakan ID Auth siswa agar tidak tertukar saat username berubah. Hanya akun admin yang terdaftar di <code>school_admins</code> yang diberi akses baca data sekolah.</p></div>
 </AppShell>;
}
