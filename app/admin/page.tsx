'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowDownToLine,ArrowRight,CalendarDays,CheckCircle2,Clock3,RefreshCw,Search,TrendingUp,Users,XCircle} from 'lucide-react';
import '@/app/admin-dashboard.css';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {getAdminAnalyticsAttempts,getAdminAttempts,getSchoolStudents,latestGrades,wibDate} from '@/lib/school';
import type {Attempt,AttemptSummary,SchoolStudent} from '@/lib/types';
const PAGE=10;
export default function AdminPage(){const {loading,error,logout}=useSchoolAuth('admin');
 const [students,setStudents]=useState<SchoolStudent[]>([]);const [attempts,setAttempts]=useState<Attempt[]>([]);
 const [trendAttempts,setTrendAttempts]=useState<AttemptSummary[]>([]);const [trendError,setTrendError]=useState('');
 const [date,setDate]=useState(()=>wibDate());const [major,setMajor]=useState('');const [klass,setKlass]=useState('');const [search,setSearch]=useState('');const [status,setStatus]=useState('all');const [page,setPage]=useState(0);
 const requestId=useRef(0);
 const [busy,setBusy]=useState(true);const [notice,setNotice]=useState('');const [refreshKey,setRefreshKey]=useState(0);const [exporting,setExporting]=useState(false);const [embed,setEmbed]=useState(false);
 useEffect(()=>{queueMicrotask(()=>setEmbed(new URLSearchParams(window.location.search).get('embed')==='1'));},[]);
 useEffect(()=>{if(loading||error)return;let active=true;
  async function loadRoster(){try{const result=await getSchoolStudents();if(active)setStudents(result);}catch(e){if(active)setNotice('Gagal mengambil roster sekolah: '+(e instanceof Error?e.message:'Kesalahan tidak diketahui'));}}
  void loadRoster();return()=>{active=false;};
 },[loading,error]);
 const refresh=useCallback(async()=>{if(loading||error)return;const request=++requestId.current;setBusy(true);setNotice('');setTrendError('');
  // The seven-day trend uses the same verified-only Supabase view as the full analytics page.
  // Keep errors independent: a trend failure must not remove the official daily report.
  const [dailyResult,trendResult]=await Promise.allSettled([getAdminAttempts(date),getAdminAnalyticsAttempts(date,7)]);
  if(request!==requestId.current)return;
  if(dailyResult.status==='fulfilled')setAttempts(dailyResult.value);
  else{setAttempts([]);setNotice('Gagal mengambil nilai terverifikasi: '+(dailyResult.reason instanceof Error?dailyResult.reason.message:'Tidak dapat mengambil nilai Supabase.'));}
  if(trendResult.status==='fulfilled')setTrendAttempts(trendResult.value);
  else{setTrendAttempts([]);setTrendError('Grafik belum bisa dimuat dari Supabase.');}
  setBusy(false);
 },[date,loading,error]);
 useEffect(()=>{queueMicrotask(()=>void refresh());const id=setInterval(()=>void refresh(),20000);return()=>clearInterval(id);},[refresh,refreshKey]);
 const allGrades=useMemo(()=>latestGrades(attempts,students),[attempts,students]);
 const majors=useMemo(()=>Array.from(new Set(students.map(s=>s.majorName))).sort((a,b)=>a.localeCompare(b,'id')),[students]);
 const classes=useMemo(()=>Array.from(new Set(students.filter(s=>!major||s.majorName===major).map(s=>s.className))).sort((a,b)=>a.localeCompare(b,'id')),[students,major]);
 const scope=useMemo(()=>students.filter(s=>(!major||s.majorName===major)&&(!klass||s.className===klass)),[students,major,klass]);
 const complete=scope.filter(s=>allGrades.has(s.authId)).length;
 const avgScores=scope.map(s=>allGrades.get(s.authId)?.score).filter((x):x is number=>x!==undefined);
 const avg=avgScores.length?Math.round(avgScores.reduce((a,b)=>a+b,0)/avgScores.length):0;

 const trendDays=useMemo(()=>{
  const start=Date.parse(date+'T00:00:00+07:00');
  if(!Number.isFinite(start))return [];
  const scopeIds=new Set(scope.map(s=>s.authId).filter(Boolean));
  const byDay=new Map<string,Map<string,number>>();
  // First verified compulsory score of each WIB day is official.
  // Retakes stay in history and cannot replace daily analytics.
  for(const attempt of [...trendAttempts].sort((a,b)=>a.completed_at_ms-b.completed_at_ms)){
    const id=attempt.auth_user_id;
    if(!id||!scopeIds.has(id)||!Number.isFinite(attempt.score)||attempt.score<0||attempt.score>100)continue;
    const day=wibDate(attempt.completed_at_ms);
    const scores=byDay.get(day)||new Map<string,number>();
    if(!scores.has(id))scores.set(id,attempt.score);
    byDay.set(day,scores);
  }
  const labelFormat=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',timeZone:'Asia/Jakarta'});
  return Array.from({length:7},(_,i)=>{
    const timestamp=start-(6-i)*86400000;
    const day=wibDate(timestamp);
    const scores=[...(byDay.get(day)?.values()||[])];
    const average=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null;
    return {date:day,label:labelFormat.format(new Date(timestamp)),average,completed:scores.length};
  });
 },[date,scope,trendAttempts]);
 const trendHasData=trendDays.some(d=>d.completed>0);
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

 const completionRate=scope.length?Math.round(complete/scope.length*100):0;
 const valuesAvailable=!busy&&!notice;
 if(loading)return <main className="page-loader">Memverifikasi akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()} embed={embed} dashboardStyle>
  <div className="admin-overview">
    <section className="admin-overview-hero" aria-label="Ringkasan akademik">
      <div className="admin-overview-hero-copy">
        <span className="admin-overview-eyebrow">VOKASI · PEMANTAUAN AKADEMIK</span>
        <h2>Perkembangan siswa,<br/>dalam satu pandangan.</h2>
        <p>Nilai latihan wajib yang ditampilkan berasal dari hasil terverifikasi server.</p>
      </div>
      <div className="admin-overview-hero-stat">
        <span>Jumlah siswa dalam filter</span>
        <strong>{scope.length.toLocaleString('id-ID')}</strong>
        <small>{!valuesAvailable?'Memuat hasil terverifikasi...':`${complete.toLocaleString('id-ID')} siswa sudah latihan`}</small>
        <div className="admin-overview-hero-track" role="progressbar" aria-label="Proporsi siswa selesai latihan wajib" aria-valuemin={0} aria-valuemax={100} aria-valuenow={valuesAvailable?completionRate:0}><span style={{width:(valuesAvailable?completionRate:0)+'%'}}/></div>
      </div>
    </section>

    {notice&&<div className="alert danger admin-overview-alert" role="alert">{notice} <button type="button" className="link-action" onClick={()=>setRefreshKey(v=>v+1)}>Ulangi</button></div>}
    <div className="admin-overview-grid">
      <div className="admin-overview-primary">
      <section className="white-panel admin-overview-filters-panel" id="hasil" aria-labelledby="admin-overview-title">
        <div className="admin-overview-panel-heading">
          <div>
            <span className="section-kicker">NILAI & LAPORAN</span>
            <h2 id="admin-overview-title">Laporan nilai harian</h2>
            <p>Filter data siswa berdasarkan tanggal, jurusan, kelas, dan status.</p>
          </div>
          <span className="admin-overview-time"><Clock3 size={15}/> WIB (UTC+7)</span>
        </div>
        <div className="admin-overview-filters">
          <label>Tanggal
            <div className="admin-overview-date"><CalendarDays size={15}/><input aria-label="Tanggal nilai" type="date" value={date} onChange={e=>{setDate(e.target.value);setPage(0);}}/></div>
          </label>
          <label>Jurusan
            <select value={major} onChange={e=>{setMajor(e.target.value);setKlass('');setPage(0);}}><option value="">Semua jurusan</option>{majors.map(m=><option key={m} value={m}>{m}</option>)}</select>
          </label>
          <label>Kelas
            <select value={klass} onChange={e=>{setKlass(e.target.value);setPage(0);}}><option value="">Semua kelas</option>{classes.map(c=><option key={c} value={c}>{c}</option>)}</select>
          </label>
          <label>Status
            <select value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">Semua siswa</option><option value="complete">Sudah mengerjakan</option><option value="missing">Belum mengerjakan</option></select>
          </label>
        </div>
      </section>
      <section className="white-panel admin-overview-report" aria-labelledby="admin-overview-table-title">
        <div className="admin-overview-table-area" id="siswa">
          <div className="admin-overview-table-top">
            <div>
              <span className="section-kicker">AKTIVITAS SISWA</span>
              <h2 id="admin-overview-table-title">Nilai siswa</h2>
              <p>{valuesAvailable?`${attempts.length} sesi wajib • ${new Set(attempts.map(a=>a.auth_user_id)).size} akun mengirim`:'Menunggu hasil terverifikasi dari server'}</p>
            </div>
          </div>
          <div className="admin-overview-toolbar">
            <label className="admin-overview-search"><Search size={17}/><input aria-label="Cari siswa pada laporan" placeholder="Cari nama atau username siswa..." value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
            <div className="admin-overview-actions">
              <button type="button" className="btn secondary small" onClick={()=>setRefreshKey(v=>v+1)} disabled={busy}><RefreshCw size={15}/> Segarkan</button>
              <button type="button" title={!klass?'Pilih satu kelas sebelum mengunduh laporan':undefined} className="btn primary small" onClick={()=>void exportExcel()} disabled={busy||!!notice||exporting||!students.length||!klass}><ArrowDownToLine size={15}/> {exporting?'Mengekspor...':'Unduh Excel'}</button>
            </div>
          </div>
          {busy?<div className="empty-state">Mengambil nilai resmi dari Supabase...</div>:
            <div className="table-wrap admin-overview-table-wrap">
              <table className="grade-table"><thead><tr><th>No.</th><th>Nama siswa</th><th>Jurusan</th><th>Kelas</th><th>Nilai</th><th>Status</th></tr></thead><tbody>
              {rows.map((s,i)=>{const record=allGrades.get(s.authId);return <tr key={s.id}>
                <td>{Math.min(page,pages-1)*PAGE+i+1}</td>
                <td><b>{s.fullName}</b><small>@{s.username||'belum terdaftar'}</small></td>
                <td>{s.majorName}</td><td>{s.className}</td>
                <td>{record?<span className="score-chip positive">{record.score}/100</span>:'—'}</td>
                <td>{record?<span className="status-label done"><CheckCircle2 size={13}/> Selesai</span>:<span className="status-label pending"><XCircle size={13}/> Belum tercatat</span>}</td>
              </tr>})}
              {!rows.length&&<tr><td colSpan={6} className="table-empty">Tidak ada siswa yang sesuai dengan filter.</td></tr>}
              </tbody></table>
            </div>}
          <div className="table-footer admin-overview-pagination">
            <span>Menampilkan {rows.length} dari {filtered.length} siswa · maksimal 10 per halaman</span>
            <div><button type="button" className="btn secondary small" disabled={page<=0} onClick={()=>setPage(v=>Math.max(0,v-1))}>Sebelumnya</button><span>{Math.min(page,pages-1)+1} / {pages}</span><button type="button" className="btn secondary small" disabled={page>=pages-1} onClick={()=>setPage(v=>v+1)}>Berikutnya</button></div>
          </div>
        </div>
      </section>
      </div>
      <div className="admin-overview-secondary">
      <aside className="white-panel admin-overview-summary" aria-label="Status pembelajaran">
        <div className="admin-overview-panel-heading">
          <div><span className="section-kicker">RINGKASAN</span><h2>Status pada {date}</h2></div>
          <TrendingUp size={21} className="admin-overview-summary-icon"/>
        </div>
        <div className="admin-overview-stats">
          <div className="admin-overview-stat"><span className="admin-overview-stat-icon blue"><Users size={18}/></span><div><small>Jumlah siswa</small><strong>{scope.length.toLocaleString('id-ID')}</strong></div></div>
          <div className="admin-overview-stat"><span className="admin-overview-stat-icon green"><CheckCircle2 size={18}/></span><div><small>Sudah latihan</small><strong>{valuesAvailable?complete.toLocaleString('id-ID'):'—'}</strong></div></div>
          <div className="admin-overview-stat"><span className="admin-overview-stat-icon orange"><Clock3 size={18}/></span><div><small>Belum tercatat</small><strong>{valuesAvailable?(scope.length-complete).toLocaleString('id-ID'):'—'}</strong></div></div>
        </div>
      </aside>
      <section className="admin-overview-performance-card" aria-label="Performa akademik">
        <span className="admin-overview-performance-eyebrow">PERFORMA</span>
        <h2>Rata-rata nilai</h2>
        <strong className="admin-overview-average">{valuesAvailable&&avgScores.length?avg:'—'}</strong>
        <p>{valuesAvailable&&avgScores.length?'Berdasarkan nilai wajib terverifikasi':'Belum ada nilai terverifikasi'}</p>
        <div className="admin-overview-performance">
          <div className="admin-overview-performance-heading"><span>Siswa sudah latihan</span><strong>{valuesAvailable?completionRate+'%':'—'}</strong></div>
          <div className="admin-overview-performance-track"><span style={{width:(valuesAvailable?completionRate:0)+'%'}}/></div>
        </div>
        <div className="admin-overview-trend">
          <div className="admin-overview-trend-heading">
            <div><span>STATISTIK PERKEMBANGAN</span><h3>Tren nilai 7 hari</h3></div>
            <Link href={embed?'/admin/analitik?embed=1':'/admin/analitik'} aria-label="Lihat statistik analitik selengkapnya">Detail <ArrowRight size={14}/></Link>
          </div>
          <div className="admin-overview-trend-chart">
            <div className="admin-overview-trend-scale" aria-hidden="true"><span>100</span><span>50</span><span>0</span></div>
            <div className="admin-overview-trend-bars" role="img" aria-label={busy?'Grafik perkembangan sedang dimuat':trendError?trendError:trendHasData?'Grafik rata-rata nilai wajib terverifikasi selama tujuh hari pada skala 0 hingga 100':'Diagram tujuh hari belum memiliki nilai terverifikasi; tidak ada nilai rekaan'}>
              {trendDays.map(d=><div className="admin-overview-trend-day" key={d.date} title={d.label+': '+d.completed+' siswa, rata-rata nilai '+(d.average??'belum ada')}>
                <span className="admin-overview-trend-value">{busy||trendError||d.average===null?'—':d.average}</span>
                <div className={'admin-overview-trend-track '+(busy||trendError||d.average===null?'is-empty':'')}>
                  <div style={{height:(busy||trendError||d.average===null?0:d.average)+'%'}}/>
                </div>
                <small>{d.label}</small>
              </div>)}
            </div>
          </div>
          {(busy||trendError||!trendHasData)&&<p className="admin-overview-trend-status" role="status">{busy?'Memuat data perkembangan...':trendError||'Belum ada nilai terverifikasi pada periode ini.'}</p>}
          <p className="admin-overview-trend-note">Rata-rata nilai resmi pertama per siswa per hari (WIB), dari hasil terverifikasi.</p>
        </div>
      </section>
      </div>
    </div>
  </div>
 </AppShell>;
}
