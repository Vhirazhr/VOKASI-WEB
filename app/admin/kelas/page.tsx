'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowRight,BookOpen,GraduationCap,RefreshCw,School2,Search,Users,Plus,PenLine,Trash2,X} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {supabase} from '@/lib/supabase';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {getSchoolStudents} from '@/lib/school';
import type {SchoolStudent} from '@/lib/types';
import '@/app/admin-workspace.css';
import '@/app/admin-students-ui.css';
import '@/app/admin-classes-ui.css';

const CLASSES_PER_PAGE=12;
type ClassSummary={key:string;name:string;major:string;count:number;registered:number;students:SchoolStudent[];majorId:string;grade:number;year:string};
type ClassRow={id:string;class_name:string;major_id:string;grade_level:number;school_year:string};
export default function AdminClassesPage(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [students,setStudents]=useState<SchoolStudent[]>([]),[busy,setBusy]=useState(true),[issue,setIssue]=useState('');
 const [allClasses,setAllClasses]=useState<ClassRow[]>([]);
 const [search,setSearch]=useState(''),[major,setMajor]=useState(''),[selected,setSelected]=useState<string|null>(null),[refreshKey,setRefreshKey]=useState(0),[listPage,setListPage]=useState(0);
 const [majorsDb,setMajorsDb]=useState<{id:string;name:string;code:string|null}[]>([]);
 const [newMajor,setNewMajor]=useState(''),[newClass,setNewClass]=useState('');
 const [classModal,setClassModal]=useState<'add'|'edit'|null>(null),[editClassId,setEditClassId]=useState<string|null>(null),[manualName,setManualName]=useState(false);
 const [deleteTarget,setDeleteTarget]=useState<ClassSummary|null>(null);
 const [newGrade,setNewGrade]=useState(10),[newYear,setNewYear]=useState('2026/2027');
 const [saveBusy,setSaveBusy]=useState(false),[feedback,setFeedback]=useState('');
 useEffect(()=>{if(loading||error)return;let active=true;
  async function load(){try{
 const [data,cls]=await Promise.all([
  getSchoolStudents(),
  supabase().from('classes').select('id,class_name,major_id,grade_level,school_year').order('class_name')
 ]);
 if(cls.error)throw cls.error;
 if(active){setStudents(data);setAllClasses(cls.data||[]);setIssue('');setBusy(false);}
 }catch(e){if(active){setIssue(e instanceof Error?e.message:'Data kelas tidak dapat dimuat.');setBusy(false);}}}
  queueMicrotask(()=>void load());return()=>{active=false};
 },[loading,error,refreshKey]);
 useEffect(()=>{if(loading||error)return;
   void supabase().from('majors').select('id,name,code').eq('is_active',true).order('name')
     .then(({data})=>setMajorsDb(data||[]));
 },[loading,error]);
 const romanGrade=(grade:number)=>grade===10?'X':grade===11?'XI':'XII';
 function generatedClass(majorId:string,grade:number,rombel:string){
  const code=majorsDb.find(m=>m.id===majorId)?.code?.trim()||majorsDb.find(m=>m.id===majorId)?.name.split(' ').map(word=>word[0]).join('').slice(0,5).toUpperCase()||'';
  return majorId&&rombel.trim()?romanGrade(grade)+' '+code+' '+rombel.trim():'';
 }
 const [rombel,setRombel]=useState('1');
 function openAdd(){setClassModal('add');setEditClassId(null);setNewMajor('');setNewGrade(10);setNewYear('2026/2027');setRombel('1');setNewClass('');setManualName(false);setFeedback('');}
 function openEdit(g:ClassSummary){
  setClassModal('edit');setEditClassId(g.key);setNewMajor(g.majorId);setNewGrade(g.grade);setNewYear(g.year);
  setNewClass(g.name);setManualName(true);setFeedback('');
 }
 function closeModal(){if(!saveBusy){setClassModal(null);setFeedback('');}}
 async function addClass(e:React.FormEvent){
   e.preventDefault();setFeedback('');
   const finalName=classModal==='add'&&!manualName?generatedClass(newMajor,newGrade,rombel):newClass.trim();
   if(!newMajor||!finalName.trim()){setFeedback('Lengkapi jurusan, nama kelas, dan rombel.');return;}
   if(!/^\d{4}\/\d{4}$/.test(newYear)||Number(newYear.slice(5))!==Number(newYear.slice(0,4))+1){setFeedback('Tahun ajaran harus berurutan, misalnya 2026/2027.');return;}
   setSaveBusy(true);
   const {error:err}=classModal==='edit'
     ?await supabase().rpc('vokasi_admin_update_class',{p_class_id:editClassId,p_major_id:newMajor,p_name:finalName,p_grade:newGrade,p_year:newYear})
     :await supabase().rpc('vokasi_admin_create_class',{p_major_id:newMajor,p_name:finalName,p_grade:newGrade,p_year:newYear});
   if(err)setFeedback(err.message);
   else{setFeedback('');setClassModal(null);setSelected(null);setRefreshKey(v=>v+1);}
   setSaveBusy(false);
 }
 async function removeClass(){
  if(!deleteTarget||saveBusy)return;
  setSaveBusy(true);setFeedback('');
  const {error:err}=await supabase().rpc('vokasi_admin_delete_empty_class',{p_class_id:deleteTarget.key});
  if(err)setFeedback(err.message);
  else{setDeleteTarget(null);setSelected(null);setRefreshKey(v=>v+1);}
  setSaveBusy(false);
 }
 const groups=useMemo(()=>{
  const map=new Map<string,ClassSummary>();
  const majorsById=new Map(majorsDb.map(x=>[x.id,x.name]));
  for(const cl of allClasses){
    const major=majorsById.get(cl.major_id)||students.find(s=>s.classId===cl.id)?.majorName||'Jurusan belum terpetakan';
    map.set(cl.id,{key:cl.id,name:cl.class_name,major,count:0,registered:0,students:[],majorId:cl.major_id,grade:cl.grade_level,year:cl.school_year});
  }
  for(const s of students){
   let item=map.get(s.classId);
   if(!item){
    item={key:s.classId,name:s.className,major:s.majorName,count:0,registered:0,students:[],majorId:'',grade:10,year:'2026/2027'};
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
   <section className="admin-data-card admin-classes-list" aria-labelledby="admin-class-list-title">
    <div className="admin-classes-list-heading">
     <h2 id="admin-class-list-title">Daftar kelas</h2>
     <div className="admin-classes-heading-actions"><span>{busy?'—':filtered.length.toLocaleString('id-ID')} kelas</span><button type="button" className="btn primary small" onClick={openAdd}><Plus size={16}/> Tambah kelas</button></div>
    </div>
    {issue&&<div className="alert danger" role="alert">{issue}</div>}
    <div className="admin-directory-controls admin-directory-controls-simple">
     <label className="admin-directory-search"><Search size={17}/><input aria-label="Cari kelas" value={search} onChange={e=>{setSearch(e.target.value);setListPage(0);setSelected(null);}} placeholder="Cari kelas atau jurusan..."/></label>
     <label>Jurusan<select value={major} onChange={e=>{setMajor(e.target.value);setListPage(0);setSelected(null);}}><option value="">Semua jurusan</option>{majors.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
     <button type="button" className="admin-students-refresh" disabled={busy} onClick={()=>{setBusy(true);setRefreshKey(v=>v+1);}}><RefreshCw size={16}/>{busy?'Memuat...':'Segarkan data'}</button>
    </div>
    {busy?<div className="admin-workspace-empty">Mengambil data sekolah dari Supabase...</div>:filtered.length===0?<div className="admin-workspace-empty">Belum ada kelas untuk filter ini.</div>:
    <div className="admin-class-grid">{visibleClasses.map(g=><article className={'admin-class-card admin-class-manage-card '+(selected===g.key?'selected':'')} key={g.key}>
      <span className="admin-class-icon"><BookOpen size={23}/></span>
      <strong className="admin-class-name">{g.name}</strong><span className="admin-class-major">{g.major}</span>
      <span className="admin-class-meta"><Users size={16}/>{g.count} siswa · {g.registered} terdaftar</span>
      <div className="admin-class-card-actions">
       <button type="button" onClick={()=>setSelected(selected===g.key?null:g.key)}><ArrowRight size={14}/> Lihat</button>
       <button type="button" onClick={()=>openEdit(g)}><PenLine size={14}/> Edit</button>
       <button type="button" className="danger" onClick={()=>{setDeleteTarget(g);setFeedback('');}} disabled={g.count>0} title={g.count>0?'Pindahkan siswa terlebih dahulu sebelum menghapus kelas.':'Hapus kelas kosong'}><Trash2 size={14}/> Hapus</button>
      </div>
     </article>)}</div>}
    {!busy&&filtered.length>CLASSES_PER_PAGE&&<div className="admin-workspace-footer">
     <span>Menampilkan {visibleClasses.length} dari {filtered.length} kelas</span>
     <div><button type="button" disabled={currentPage===0} onClick={()=>{setListPage(v=>Math.max(0,v-1));setSelected(null);}}>Sebelumnya</button><span>{currentPage+1} / {classPages}</span><button type="button" disabled={currentPage>=classPages-1} onClick={()=>{setListPage(v=>v+1);setSelected(null);}}>Berikutnya</button></div>
    </div>}
   </section>
   {classModal&&<div className="admin-modal-overlay" role="presentation" onMouseDown={closeModal}>
    <section role="dialog" aria-modal="true" aria-label={classModal==='add'?'Tambah kelas':'Edit kelas'} className="admin-modal-card admin-class-form-modal" onMouseDown={e=>e.stopPropagation()}>
     <header className="admin-modal-top"><div><span className="section-kicker">STRUKTUR SEKOLAH</span><h2>{classModal==='add'?'Tambah kelas':'Edit kelas'}</h2><p>Kelola data kelas langsung dari halaman ini.</p></div><button type="button" aria-label="Tutup" onClick={closeModal}><X size={19}/></button></header>
     {feedback&&<div className="alert danger" role="alert">{feedback}</div>}
     <form className="admin-class-modal-form" onSubmit={e=>void addClass(e)}>
      <label>Jurusan<select required value={newMajor} onChange={e=>setNewMajor(e.target.value)} disabled={classModal==='edit'&&groups.find(g=>g.key===editClassId)?.count!>0}><option value="">Pilih jurusan</option>{majorsDb.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
      <div className="admin-class-form-row">
       <label>Tingkat<select value={newGrade} onChange={e=>setNewGrade(Number(e.target.value))}>{[10,11,12].map(g=><option key={g} value={g}>{romanGrade(g)} · Kelas {g}</option>)}</select></label>
       {classModal==='add'&&!manualName&&<label>Rombel<input required type="number" min="1" max="30" value={rombel} onChange={e=>setRombel(e.target.value)} placeholder="1"/></label>}
      </div>
      <label>Nama kelas<input required maxLength={80} minLength={2} value={classModal==='add'&&!manualName?generatedClass(newMajor,newGrade,rombel):newClass} readOnly={classModal==='add'&&!manualName} onChange={e=>setNewClass(e.target.value)} placeholder="Contoh: X DPIB 1"/></label>
      {classModal==='add'&&<label className="admin-class-manual-toggle"><input type="checkbox" checked={manualName} onChange={e=>setManualName(e.target.checked)}/> Atur nama kelas manual</label>}
      <label>Tahun ajaran<input value={newYear} onChange={e=>setNewYear(e.target.value)} placeholder="2026/2027" pattern="[0-9]{4}/[0-9]{4}" required/></label>
      {classModal==='edit'&&<p className="admin-class-guard-note">Jurusan kelas yang sudah memiliki siswa tidak bisa diganti. Data siswa tetap aman.</p>}
      <div className="admin-class-modal-actions"><button type="button" className="btn secondary small" onClick={closeModal}>Batal</button><button type="submit" className="btn primary small" disabled={saveBusy}>{saveBusy?'Menyimpan...':classModal==='edit'?'Simpan perubahan':'Tambah kelas'}</button></div>
     </form>
    </section></div>}
   {deleteTarget&&<div className="admin-modal-overlay" role="presentation" onMouseDown={()=>{if(!saveBusy)setDeleteTarget(null);}}>
    <section role="alertdialog" aria-modal="true" className="admin-modal-card admin-class-delete-modal" onMouseDown={e=>e.stopPropagation()}>
     <span className="section-kicker">KONFIRMASI HAPUS KELAS</span><h2>Hapus {deleteTarget.name}?</h2>
     <p>Kelas hanya bisa dihapus jika tidak memiliki siswa. Tindakan ini tidak menghapus jurusan atau kelas lain.</p>
     {feedback&&<div className="alert danger" role="alert">{feedback}</div>}
     <div className="admin-class-modal-actions"><button type="button" className="btn secondary small" onClick={()=>setDeleteTarget(null)} disabled={saveBusy}>Batal</button><button type="button" className="btn primary small admin-class-confirm-delete" onClick={()=>void removeClass()} disabled={saveBusy||deleteTarget.count>0}><Trash2 size={15}/>{saveBusy?'Menghapus...':'Ya, hapus kelas'}</button></div>
    </section></div>}
   {picked&&<section className="admin-data-card admin-class-members"><div className="admin-data-title"><div><span className="section-kicker">ANGGOTA KELAS</span><h2>{picked.name}</h2><p>{picked.major} · {picked.count} siswa</p></div><button type="button" className="btn secondary small" onClick={()=>setSelected(null)}>Tutup</button></div><div className="admin-workspace-table-wrap"><table><thead><tr><th>Nama siswa</th><th>Username</th><th>Status</th></tr></thead><tbody>{picked.students.slice().sort((a,b)=>a.fullName.localeCompare(b.fullName,'id')).map(s=><tr key={s.id}><td><b>{s.fullName}</b></td><td>{s.username||'—'}</td><td><span className={s.registered?'admin-workspace-status ok':'admin-workspace-status wait'}>{s.registered?'Terdaftar':'Belum terdaftar'}</span></td></tr>)}</tbody></table></div></section>}
  </div>
 </AppShell>;
}