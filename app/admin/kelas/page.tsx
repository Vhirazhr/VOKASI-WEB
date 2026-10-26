'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowRight,BookOpen,GraduationCap,RefreshCw,School2,Search,Users} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {supabase} from '@/lib/supabase';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {getSchoolStudents} from '@/lib/school';
import type {SchoolStudent} from '@/lib/types';
import '@/app/admin-workspace.css';
import '@/app/admin-students-ui.css';
import '@/app/admin-classes-ui.css';

const CLASSES_PER_PAGE=12;
type ClassSummary={key:string;name:string;major:string;count:number;registered:number;students:SchoolStudent[]};
export default function AdminClassesPage(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [students,setStudents]=useState<SchoolStudent[]>([]),[busy,setBusy]=useState(true),[issue,setIssue]=useState('');
 const [allClasses,setAllClasses]=useState<{id:string;class_name:string;major_id:string}[]>([]);
 const [search,setSearch]=useState(''),[major,setMajor]=useState(''),[selected,setSelected]=useState<string|null>(null),[refreshKey,setRefreshKey]=useState(0),[listPage,setListPage]=useState(0);
 const [majorsDb,setMajorsDb]=useState<{id:string;name:string}[]>([]);
 const [newMajor,setNewMajor]=useState(''),[newClass,setNewClass]=useState('');
 const [newGrade,setNewGrade]=useState(10),[newYear,setNewYear]=useState('2026/2027');
 const [saveBusy,setSaveBusy]=useState(false),[feedback,setFeedback]=useState('');
 useEffect(()=>{if(loading||error)return;let active=true;
  async function load(){try{
 const [data,cls]=await Promise.all([
  getSchoolStudents(),
  supabase().from('classes').select('id,class_name,major_id').order('class_name')
 ]);
 if(cls.error)throw cls.error;
 if(active){setStudents(data);setAllClasses(cls.data||[]);setIssue('');setBusy(false);}
 }catch(e){if(active){setIssue(e instanceof Error?e.message:'Data kelas tidak dapat dimuat.');setBusy(false);}}}
  queueMicrotask(()=>void load());return()=>{active=false};
 },[loading,error,refreshKey]);
 useEffect(()=>{if(loading||error)return;
   void supabase().from('majors').select('id,name').eq('is_active',true).order('name')
     .then(({data})=>setMajorsDb(data||[]));
 },[loading,error]);
 async function addClass(e:React.FormEvent){
   e.preventDefault();setFeedback('');
   if(!newMajor||!newClass.trim())return;
   setSaveBusy(true);
   const {error:err}=await supabase().rpc('vokasi_admin_create_class',{
     p_major_id:newMajor,p_name:newClass.trim(),p_grade:newGrade,p_year:newYear
   });
   if(err)setFeedback(err.message);
   else{setFeedback('Kelas berhasil dibuat. Perubahan tercatat.');setNewClass('');setRefreshKey(v=>v+1);}
   setSaveBusy(false);
 }
 const groups=useMemo(()=>{
  const map=new Map<string,ClassSummary>();
  const majorsById=new Map(majorsDb.map(x=>[x.id,x.name]));
  for(const cl of allClasses){
    const major=majorsById.get(cl.major_id)||students.find(s=>s.classId===cl.id)?.majorName||'Jurusan belum terpetakan';
    map.set(cl.id,{key:cl.id,name:cl.class_name,major,count:0,registered:0,students:[]});
  }
  for(const s of students){
   let item=map.get(s.classId);
   if(!item){
    item={key:s.classId,name:s.className,major:s.majorName,count:0,registered:0,students:[]};
    map.set(s.classId,item);
   }
   item.count++;item.registered+=s.registered?1:0;item.students.push(s);
  }
  return [...map.values()].sort((a,b)=>a.major.localeCompare(b.major,'id')||a.name.localeCompare(b.name,'id'));
 },[students,allClasses,majorsDb]);
 const majors=[...new Set(groups.map(g=>g.major))].sort((a,b)=>a.localeCompare(b,'id'));
 const filtered=groups.filter(g=>(!major||g.major===major)&&(!search||[g.name,g.major].some(s=>s.toLowerCase().includes(search.trim().toLowerCase()))));
 const classPages=Math.max(1,Math.ceil(filtered.length/CLASSES_PER_PAGE));
 const currentPage=Math.min(listPage,classPages-1);
 const visibleClasses=filtered.slice(currentPage*CLASSES_PER_PAGE,(currentPage+1)*CLASSES_PER_PAGE);
 const picked=groups.find(g=>g.key===selected);
 if(loading)return <main className="page-loader">Memverifikasi hak akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
  <div className="admin-workspace admin-students-page admin-classes-page">
   <section className="admin-students-hero" aria-label="Ringkasan kelas dan jurusan">
    <header className="admin-workspace-header">
     <span className="section-kicker">STRUKTUR SEKOLAH</span>
     <h1>Kelas & Jurusan</h1>
     <p>Data kelas, jurusan, dan keanggotaan siswa.</p>
    </header>
    <div className="admin-mini-stats">
     <div><School2 size={20}/><span>Total jurusan</span><strong>{busy?'—':majors.length.toLocaleString('id-ID')}</strong></div>
     <div><GraduationCap size={20}/><span>Kelas terdata</span><strong>{busy?'—':groups.length.toLocaleString('id-ID')}</strong></div>
     <div><Users size={20}/><span>Jumlah siswa</span><strong>{busy?'—':students.length.toLocaleString('id-ID')}</strong></div>
    </div>
   </section>
   <section className="admin-data-card admin-classes-create" aria-labelledby="admin-create-class-title">
    <div className="admin-data-title"><h2 id="admin-create-class-title">Tambah kelas</h2></div>
    <form className="admin-safe-class-form" onSubmit={e=>void addClass(e)}>
     <label>Jurusan<select value={newMajor} required onChange={e=>setNewMajor(e.target.value)}>
      <option value="">Pilih jurusan</option>{majorsDb.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}
     </select></label>
     <label>Nama kelas<input required maxLength={80} minLength={2} value={newClass} onChange={e=>setNewClass(e.target.value)} placeholder="Contoh: XII TKJ 1"/></label>
     <label>Tingkat<select value={newGrade} onChange={e=>setNewGrade(Number(e.target.value))}>{[10,11,12].map(g=><option key={g} value={g}>{g}</option>)}</select></label>
     <label>Tahun ajaran<input value={newYear} onChange={e=>setNewYear(e.target.value)} pattern="[0-9]{4}/[0-9]{4}" required/></label>
     <button className="btn primary small" type="submit" disabled={saveBusy}>{saveBusy?'Menyimpan...':'Tambah kelas'}</button>
    </form>
    {feedback&&<p role="status">{feedback}</p>}
   </section>
   <section className="admin-data-card admin-classes-list" aria-labelledby="admin-class-list-title">
    <div className="admin-classes-list-heading">
     <h2 id="admin-class-list-title">Daftar kelas</h2>
     <span>{busy?'—':filtered.length.toLocaleString('id-ID')} kelas</span>
    </div>
    {issue&&<div className="alert danger" role="alert">{issue}</div>}
    <div className="admin-directory-controls admin-directory-controls-simple">
     <label className="admin-directory-search"><Search size={17}/><input aria-label="Cari kelas" value={search} onChange={e=>{setSearch(e.target.value);setListPage(0);setSelected(null);}} placeholder="Cari kelas atau jurusan..."/></label>
     <label>Jurusan<select value={major} onChange={e=>{setMajor(e.target.value);setListPage(0);setSelected(null);}}><option value="">Semua jurusan</option>{majors.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
     <button type="button" className="admin-students-refresh" disabled={busy} onClick={()=>{setBusy(true);setRefreshKey(v=>v+1);}}><RefreshCw size={16}/>{busy?'Memuat...':'Segarkan data'}</button>
    </div>
    {busy?<div className="admin-workspace-empty">Mengambil data sekolah dari Supabase...</div>:filtered.length===0?<div className="admin-workspace-empty">Belum ada kelas untuk filter ini.</div>:
    <div className="admin-class-grid">{visibleClasses.map(g=><button type="button" aria-pressed={selected===g.key} className={'admin-class-card '+(selected===g.key?'selected':'')} key={g.key} onClick={()=>setSelected(selected===g.key?null:g.key)}>
     <span className="admin-class-icon"><BookOpen size={23}/></span><span className="admin-class-name">{g.name}</span><span className="admin-class-major">{g.major}</span><span className="admin-class-meta"><Users size={16}/>{g.count} siswa · {g.registered} terdaftar <ArrowRight size={16}/></span>
    </button>)}</div>}
    {!busy&&filtered.length>CLASSES_PER_PAGE&&<div className="admin-workspace-footer">
     <span>Menampilkan {visibleClasses.length} dari {filtered.length} kelas</span>
     <div><button type="button" disabled={currentPage===0} onClick={()=>{setListPage(v=>Math.max(0,v-1));setSelected(null);}}>Sebelumnya</button><span>{currentPage+1} / {classPages}</span><button type="button" disabled={currentPage>=classPages-1} onClick={()=>{setListPage(v=>v+1);setSelected(null);}}>Berikutnya</button></div>
    </div>}
   </section>
   {picked&&<section className="admin-data-card admin-class-members"><div className="admin-data-title"><div><span className="section-kicker">ANGGOTA KELAS</span><h2>{picked.name}</h2><p>{picked.major} · {picked.count} siswa</p></div><button type="button" className="btn secondary small" onClick={()=>setSelected(null)}>Tutup</button></div><div className="admin-workspace-table-wrap"><table><thead><tr><th>Nama siswa</th><th>Username</th><th>Status</th></tr></thead><tbody>{picked.students.slice().sort((a,b)=>a.fullName.localeCompare(b.fullName,'id')).map(s=><tr key={s.id}><td><b>{s.fullName}</b></td><td>{s.username||'—'}</td><td><span className={s.registered?'admin-workspace-status ok':'admin-workspace-status wait'}>{s.registered?'Terdaftar':'Belum terdaftar'}</span></td></tr>)}</tbody></table></div></section>}
  </div>
 </AppShell>;
}