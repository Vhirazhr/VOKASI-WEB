'use client';

import {useEffect,useMemo,useState} from 'react';
import {CheckCircle2,GraduationCap,Search,ShieldCheck,Users,UserRound,RefreshCw} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {supabase} from '@/lib/supabase';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {getSchoolStudents} from '@/lib/school';
import type {SchoolStudent} from '@/lib/types';
import '@/app/admin-workspace.css';

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
  const {error:e}=await supabase().rpc('vokasi_admin_move_student',{p_roster_id:selected.id,p_new_class_id:targetClass});
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
 const pages=Math.max(1,Math.ceil(filtered.length/30));
 const activePage=Math.min(page,pages-1);
 if(loading)return <main className="page-loader">Memverifikasi hak akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
   <div className="admin-workspace">
    <header className="admin-workspace-header"><div><span className="section-kicker">MANAJEMEN SEKOLAH</span><h1>Data Siswa</h1><p>Daftar siswa dari Supabase sekolah, bukan data simulasi.</p></div><button type="button" onClick={()=>{setBusy(true);setRefreshKey(i=>i+1);}} className="btn secondary small" disabled={busy}><RefreshCw size={16}/> Segarkan data</button></header>
    <div className="admin-mini-stats"><div><Users size={20}/><span>Total siswa</span><strong>{busy?'—':students.length}</strong></div><div><CheckCircle2 size={20}/><span>Akun terdaftar</span><strong>{busy?'—':students.filter(s=>s.registered).length}</strong></div><div><GraduationCap size={20}/><span>Belum terdaftar</span><strong>{busy?'—':students.filter(s=>!s.registered).length}</strong></div></div>
    <section className="admin-data-card">
      <div className="admin-data-title"><div><h2>Direktori siswa</h2><p>Gunakan filter untuk menemukan siswa berdasarkan jurusan, kelas, dan status akun.</p></div><span className="admin-workspace-pill"><ShieldCheck size={15}/> Akses admin</span></div>
      {issue&&<div className="alert danger" role="alert">{issue}</div>}
      <div className="admin-directory-controls">
       <label className="admin-directory-search"><Search size={17}/><input aria-label="Cari siswa" value={search} placeholder="Cari nama, username, kelas..." onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
       <label>Jurusan<select value={major} onChange={e=>{setMajor(e.target.value);setKlass('');setPage(0);}}><option value="">Semua jurusan</option>{majors.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
       <label>Kelas<select value={klass} onChange={e=>{setKlass(e.target.value);setPage(0);}}><option value="">Semua kelas</option>{classes.map(k=><option key={k} value={k}>{k}</option>)}</select></label>
       <label>Status<select value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">Semua status</option><option value="registered">Terdaftar</option><option value="unregistered">Belum terdaftar</option></select></label>
      </div>
      {busy?<div className="admin-workspace-empty">Mengambil data siswa dari Supabase...</div>:
       !issue&&filtered.length===0?<div className="admin-workspace-empty">Tidak ada siswa yang cocok dengan filter.</div>:
       <div className="admin-workspace-table-wrap"><table><thead><tr><th>Nama siswa</th><th>Jurusan</th><th>Kelas</th><th>Akun</th><th>Detail</th></tr></thead><tbody>{filtered.slice(activePage*30,(activePage+1)*30).map(s=><tr key={s.id}>
       <td><b>{s.fullName}</b><small>@{s.username||'belum ada username'}</small></td><td>{s.majorName}</td><td>{s.className}</td><td><span className={s.registered?'admin-workspace-status ok':'admin-workspace-status wait'}>{s.registered?'Terdaftar':'Belum terdaftar'}</span></td>
       <td><button type="button" className="admin-workspace-detail" onClick={()=>{setSelected(s);setTargetClass(s.classId);setEditInfo('');}}>Lihat</button></td></tr>)}</tbody></table></div>}
      <div className="admin-workspace-footer"><span>{busy||issue?'—':filtered.length} siswa ditampilkan dalam filter</span><div><button type="button" disabled={activePage===0} onClick={()=>setPage(v=>Math.max(0,v-1))}>Sebelumnya</button><span>{activePage+1} / {pages}</span><button type="button" disabled={activePage>=pages-1} onClick={()=>setPage(v=>v+1)}>Berikutnya</button></div></div>
    </section>
    <div className="admin-workspace-footnote">Halaman ini untuk pencarian dan pengecekan data. Perpindahan kelas dalam jurusan yang sama tersedia dengan konfirmasi dan log perubahan. Pembuatan akun, hapus massal, serta perpindahan jurusan tetap memerlukan alur verifikasi.</div>
    {selected&&<div className="admin-modal-overlay" role="presentation" onMouseDown={()=>setSelected(null)}><section role="dialog" aria-modal="true" aria-label="Detail siswa" className="admin-modal-card" onMouseDown={e=>e.stopPropagation()}>
      <div className="admin-modal-top"><span className="admin-modal-avatar"><UserRound size={27}/></span><button type="button" aria-label="Tutup detail siswa" onClick={()=>setSelected(null)}>×</button></div><h2>{selected.fullName}</h2><p>Informasi akun sekolah</p>
      <dl><div><dt>Username</dt><dd>{selected.username||'—'}</dd></div><div><dt>Jurusan</dt><dd>{selected.majorName}</dd></div><div><dt>Kelas</dt><dd>{selected.className}</dd></div><div><dt>Status</dt><dd>{selected.registered?'Terdaftar':'Belum terdaftar'}</dd></div></dl><div className="admin-safe-manage">
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