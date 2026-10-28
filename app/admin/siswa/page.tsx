'use client';

import { nativeRpc } from '@/lib/native-rpc';
import {useEffect,useMemo,useState} from 'react';
import {CheckCircle2,GraduationCap,Search,Users,UserRound,RefreshCw,FileSpreadsheet,Download} from 'lucide-react';
import AppShell from '@/components/AppShell';
import AdminStudentHistory from '@/components/AdminStudentHistory';
import {supabase} from '@/lib/supabase';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {getAdminAttempts,getSchoolStudents,latestGrades,wibDate} from '@/lib/school';
import type {SchoolStudent} from '@/lib/types';
import {exportAdminGrades,exportAdminRoster,downloadAdminRosterTemplate} from '@/lib/admin-excel';
import '@/app/admin-workspace.css';
import '@/app/admin-students-ui.css';

const ROWS_PER_PAGE=10;
export default function AdminStudentsPage(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [students,setStudents]=useState<SchoolStudent[]>([]);
 const [busy,setBusy]=useState(true),[issue,setIssue]=useState('');
 const [search,setSearch]=useState(''),[major,setMajor]=useState(''),[klass,setKlass]=useState(''),[status,setStatus]=useState('all'),[page,setPage]=useState(0);
 const [selected,setSelected]=useState<SchoolStudent|null>(null);
 const [refreshKey,setRefreshKey]=useState(0);
 const [classOptions,setClassOptions]=useState<{id:string;class_name:string;major_id:string}[]>([]);
 const [targetClass,setTargetClass]=useState('');
 const [savingMove,setSavingMove]=useState(false);
 const [exporting,setExporting]=useState(false);
 const [gradeDate,setGradeDate]=useState(()=>wibDate());
 const [exportIssue,setExportIssue]=useState('');
 const [editInfo,setEditInfo]=useState('');
 useEffect(()=>{if(loading||error)return;let active=true;
  async function load(){try{const data=await getSchoolStudents();if(active){setStudents(data);setIssue('');setBusy(false);}}catch(e){if(active){setIssue(e instanceof Error?e.message:'Data siswa tidak dapat dimuat.');setBusy(false);}}}
  queueMicrotask(()=>void load());return()=>{active=false};
 },[loading,error,refreshKey]);
 useEffect(()=>{if(loading||error)return;
   void supabase().from('classes').select('id,class_name,major_id').eq('is_active',true).order('class_name')
    .then(({data})=>setClassOptions(data||[]));
 },[loading,error,refreshKey]);
 async function moveClass(){
  if(!selected||!targetClass||targetClass===selected.classId)return;
  if(!window.confirm('Pindahkan '+selected.fullName+' ke kelas tujuan? Perubahan ini akan dicatat.'))return;
  setSavingMove(true);setEditInfo('');
  const {error:e}=await nativeRpc('vokasi_admin_move_student',{p_roster_id:selected.id,p_new_class_id:targetClass});
  if(e)setEditInfo('Gagal memindahkan siswa: '+e.message);
  else{setSelected(null);setTargetClass('');setRefreshKey(i=>i+1);}
  setSavingMove(false);
 }
 const majors=useMemo(()=>[...new Set(students.map(s=>s.majorName))].sort((a,b)=>a.localeCompare(b,'id')),[students]);
 const classes=useMemo(()=>[...new Set(students.filter(s=>!major||s.majorName===major).map(s=>s.className))].sort((a,b)=>a.localeCompare(b,'id')),[students,major]);
 const filtered=useMemo(()=>students.filter(s=>
   (!major||s.majorName===major)&&(!klass||s.className===klass)&&
   (status==='all'||(status==='registered'?s.registered:!s.registered))&&
   (!search||[s.fullName,s.username,s.className,s.majorName].some(k=>k.toLowerCase().includes(search.trim().toLowerCase())))
  ).sort((a,b)=>a.fullName.localeCompare(b.fullName,'id')),[students,major,klass,search,status]);
 async function exportRoster(){
  setExporting(true);setExportIssue('');
  try{await exportAdminRoster(filtered,major,klass);}
  catch(e){setExportIssue(e instanceof Error?e.message:'Tidak dapat mengunduh data siswa.');}
  finally{setExporting(false);}
 }
 async function exportScores(){
  if(exporting||busy||issue||!filtered.length)return;
  setExporting(true);setExportIssue('');
  try{
   const freshAttempts=await getAdminAttempts(gradeDate);
   const official=latestGrades(freshAttempts,students);
   if(!official.size&&!window.confirm('Tanggal '+gradeDate+' belum memiliki nilai wajib terverifikasi. Unduh laporan dengan status belum tercatat?'))return;
   await exportAdminGrades(filtered,official,gradeDate,major,klass);
  }catch(e){setExportIssue('Ekspor nilai wajib gagal: '+(e instanceof Error?e.message:'Data Supabase tidak dapat diperiksa.'));}
  finally{setExporting(false);}
 }
 async function downloadTemplate(){
  setExporting(true);setExportIssue('');
  try{await downloadAdminRosterTemplate();}
  catch(e){setExportIssue(e instanceof Error?e.message:'Tidak dapat membuat template.');}
  finally{setExporting(false);}
 }
 const pages=Math.max(1,Math.ceil(filtered.length/ROWS_PER_PAGE));
 const activePage=Math.min(page,pages-1);
 if(loading)return <main className="page-loader">Memverifikasi hak akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
   <div className="admin-workspace admin-students-page">
    <section className="admin-students-hero" aria-label="Ringkasan data siswa">
      <header className="admin-workspace-header">
        <span className="section-kicker">MANAJEMEN SEKOLAH</span>
        <h1>Data Siswa</h1>
        <p>Ringkasan data siswa SMKN 1 Singosari.</p>
      </header>
      <div className="admin-mini-stats">
        <div><Users size={20}/><span>Total siswa</span><strong>{busy?'—':students.length.toLocaleString('id-ID')}</strong></div>
        <div><CheckCircle2 size={20}/><span>Akun terdaftar</span><strong>{busy?'—':students.filter(s=>s.registered).length.toLocaleString('id-ID')}</strong></div>
        <div><GraduationCap size={20}/><span>Belum terdaftar</span><strong>{busy?'—':students.filter(s=>!s.registered).length.toLocaleString('id-ID')}</strong></div>
      </div>
    </section>
    <section className="admin-data-card" aria-label="Daftar siswa">
      {issue&&<div className="alert danger" role="alert">{issue}</div>}
      {exportIssue&&<div className="alert danger" role="alert">{exportIssue}</div>}
      <div className="admin-roster-export-actions">
       <div><span className="section-kicker">DATA SEKOLAH & NILAI</span><h2>Ekspor daftar siswa</h2><p>Ekspor identitas saja atau laporan nilai wajib resmi dari Supabase untuk tanggal yang dipilih.</p></div>
       <div className="admin-roster-export-buttons">
        <button type="button" className="admin-roster-template" onClick={()=>void downloadTemplate()} disabled={exporting}><FileSpreadsheet size={17}/> Template Excel</button>
        <button type="button" className="admin-roster-export" onClick={()=>void exportRoster()} disabled={exporting||busy||!!issue||filtered.length===0}><Download size={17}/> Data siswa (tanpa nilai)</button>
        <label style={{display:'grid',gap:4,fontSize:12,fontWeight:650,color:'#385268'}}>Tanggal nilai (WIB)<input aria-label="Tanggal nilai resmi untuk ekspor" type="date" value={gradeDate} max={wibDate()} onChange={e=>setGradeDate(e.target.value)} style={{padding:'8px 10px',border:'1px solid #cbd9e7',borderRadius:9,minHeight:40}}/></label>
        <button type="button" className="admin-roster-export" onClick={()=>void exportScores()} disabled={exporting||busy||!!issue||filtered.length===0}><Download size={17}/>{exporting?'Menyiapkan...':'Unduh Excel + nilai wajib'}</button>
       </div>
      </div>
      <div className="admin-directory-controls">
       <label className="admin-directory-search"><Search size={17}/><input aria-label="Cari siswa" value={search} placeholder="Cari nama, username, kelas..." onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
       <label>Jurusan<select value={major} onChange={e=>{setMajor(e.target.value);setKlass('');setPage(0);}}><option value="">Semua jurusan</option>{majors.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
       <label>Kelas<select value={klass} onChange={e=>{setKlass(e.target.value);setPage(0);}}><option value="">Semua kelas</option>{classes.map(k=><option key={k} value={k}>{k}</option>)}</select></label>
       <label>Status<select value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">Semua status</option><option value="registered">Terdaftar</option><option value="unregistered">Belum terdaftar</option></select></label>
       <button type="button" className="admin-students-refresh" disabled={busy} onClick={()=>{setBusy(true);setRefreshKey(i=>i+1);}}><RefreshCw size={16}/>{busy?'Memuat...':'Segarkan data'}</button>
      </div>
      {busy?<div className="admin-workspace-empty">Mengambil data siswa dari Supabase...</div>:
       !issue&&filtered.length===0?<div className="admin-workspace-empty">Tidak ada siswa yang cocok dengan filter.</div>:
       <div className="admin-workspace-table-wrap"><table><thead><tr><th>Nama siswa</th><th>Jurusan</th><th>Kelas</th><th>Akun</th><th>Detail</th></tr></thead><tbody>{filtered.slice(activePage*ROWS_PER_PAGE,(activePage+1)*ROWS_PER_PAGE).map(s=><tr key={s.id}>
       <td><b>{s.fullName}</b><small>@{s.username||'belum ada username'}</small></td><td>{s.majorName}</td><td>{s.className}</td><td><span className={s.registered?'admin-workspace-status ok':'admin-workspace-status wait'}>{s.registered?'Terdaftar':'Belum terdaftar'}</span></td>
       <td><button type="button" className="admin-workspace-detail" onClick={()=>{setSelected(s);setTargetClass(s.classId);setEditInfo('');}}>Lihat</button></td></tr>)}</tbody></table></div>}
      <div className="admin-workspace-footer"><span>{busy||issue?'—':filtered.length} siswa ditampilkan dalam filter</span><div><button type="button" disabled={activePage===0} onClick={()=>setPage(v=>Math.max(0,v-1))}>Sebelumnya</button><span>{activePage+1} / {pages}</span><button type="button" disabled={activePage>=pages-1} onClick={()=>setPage(v=>v+1)}>Berikutnya</button></div></div>
    </section>
    {selected&&<div className="admin-modal-overlay" role="presentation" onMouseDown={()=>setSelected(null)}><section role="dialog" aria-modal="true" aria-label="Detail siswa" className="admin-modal-card" onMouseDown={e=>e.stopPropagation()}>
      <div className="admin-modal-top"><span className="admin-modal-avatar"><UserRound size={27}/></span><button type="button" aria-label="Tutup detail siswa" onClick={()=>setSelected(null)}>×</button></div><h2>{selected.fullName}</h2><p>Informasi akun sekolah</p>
      <dl><div><dt>Username</dt><dd>{selected.username||'—'}</dd></div><div><dt>Jurusan</dt><dd>{selected.majorName}</dd></div><div><dt>Kelas</dt><dd>{selected.className}</dd></div><div><dt>Status</dt><dd>{selected.registered?'Terdaftar':'Belum terdaftar'}</dd></div></dl>{selected.authId&&<AdminStudentHistory key={selected.authId} authId={selected.authId}/>}<div className="admin-safe-manage">
       <label>Pindahkan ke kelas (jurusan sama)
        <select value={targetClass} onChange={e=>setTargetClass(e.target.value)}>
         {classOptions.filter(cl=>cl.major_id===selected.majorId).map(cl=><option key={cl.id} value={cl.id}>{cl.class_name}</option>)}
        </select>
       </label>
       <button type="button" className="btn primary small" disabled={savingMove||!targetClass||targetClass===selected.classId} onClick={()=>void moveClass()}>
        {savingMove?'Menyimpan...':'Simpan perpindahan'}
       </button>
       {editInfo&&<p role="alert">{editInfo}</p>}
      </div><button type="button" className="btn secondary" onClick={()=>setSelected(null)}>Tutup</button>
    </section></div>}
   </div>
 </AppShell>;
}