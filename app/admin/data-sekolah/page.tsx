'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {FileSpreadsheet,Upload,Plus,CheckCircle2,AlertTriangle,RefreshCw,School2,Users,Download} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {supabase} from '@/lib/supabase';
import {getAdminSchoolCatalog,getSchoolStudents} from '@/lib/school';
import type {SchoolStudent} from '@/lib/types';
import {downloadAdminRosterTemplate} from '@/lib/admin-excel';
import '@/app/admin-workspace.css';
import '@/app/admin-students-ui.css';
import '@/app/admin-data-management.css';

type ClassOption={id:string;class_name:string;major_id:string;grade_level:number;school_year:string};
type Major={id:string;name:string;code:string|null};
type Draft={full_name:string;username:string;class_id:string;admission_year:number;line:number};
type Review=Draft&{error:string};
const normalize=(s:string)=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('id');
function field(row:Record<string,unknown>,aliases:string[]):string{
 const key=Object.keys(row).find(k=>aliases.includes(normalize(k)));
 const v=key?row[key]:null;return v==null?'':String(v).trim();
}
function yearOf(cl:ClassOption){return Number(cl.school_year.slice(0,4))-(cl.grade_level-10);}
export default function AdminDataManagement(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [majors,setMajors]=useState<Major[]>([]),[classes,setClasses]=useState<ClassOption[]>([]),[students,setStudents]=useState<SchoolStudent[]>([]);
 const [busy,setBusy]=useState(true),[refresh,setRefresh]=useState(0),[notice,setNotice]=useState(''),[problem,setProblem]=useState('');
 const [majorId,setMajorId]=useState(''),[classId,setClassId]=useState(''),[fullName,setFullName]=useState(''),[username,setUsername]=useState(''),[year,setYear]=useState('2026');
 const [majorName,setMajorName]=useState(''),[majorCode,setMajorCode]=useState(''),[saving,setSaving]=useState(false);
 const [draft,setDraft]=useState<Draft[]>([]),[fileName,setFileName]=useState(''),[showAll,setShowAll]=useState(false);
 const fileRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(loading||error)return;let active=true;const load=async()=>{setBusy(true);try{
  const [catalog,s]=await Promise.all([getAdminSchoolCatalog(),getSchoolStudents()]);
  if(active){setMajors(catalog.majors);setClasses(catalog.classes);setStudents(s);setProblem('');}
 }catch(e){if(active)setProblem(e instanceof Error?e.message:'Gagal memuat data sekolah.');}
 finally{if(active)setBusy(false);}
 };void load();return()=>{active=false};},[loading,error,refresh]);
 const classChoices=classes.filter(c=>!majorId||c.major_id===majorId);
 const knownUsernames=useMemo(()=>new Set(students.filter(s=>s.username).map(s=>normalize(s.username))),[students]);
 const existingNames=useMemo(()=>new Set(students.map(s=>s.classId+'|'+normalize(s.fullName))),[students]);
 const reviews=useMemo(()=>{
  const seenName=new Set<string>(),seenUsername=new Set<string>();
  return draft.map(d=>{
   const cl=classes.find(c=>c.id===d.class_id);let reason='';
   const name=normalize(d.full_name),login=normalize(d.username);
   if(name.length<3||name.length>120)reason='Nama harus 3–120 karakter';
   else if(!cl)reason='Kelas tidak ditemukan';
   else if(!Number.isInteger(d.admission_year)||d.admission_year<2000||d.admission_year>2100)reason='Angkatan tidak valid';
   else if(login&&!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(login))reason='Username tidak valid';
   else if(login&&(knownUsernames.has(login)||seenUsername.has(login)))reason='Username sudah tercatat/duplikat';
   else if(existingNames.has(d.class_id+'|'+name)||seenName.has(d.class_id+'|'+name))reason='Siswa sudah tercatat/duplikat dalam kelas';
   seenName.add(d.class_id+'|'+name);if(login)seenUsername.add(login);
   return {...d,error:reason};
  });
 },[draft,classes,knownUsernames,existingNames]);
 const valid=reviews.filter(r=>!r.error),invalid=reviews.filter(r=>r.error);
 async function upload(file:File){
  setProblem('');setNotice('');setDraft([]);setShowAll(false);setFileName(file.name);
  if(!/\.xlsx$/i.test(file.name)){setProblem('Gunakan file Excel .xlsx dari template VOKASI.');return;}
  if(file.size>5*1024*1024){setProblem('Ukuran file maksimal 5 MB.');return;}
  try{
   const ExcelJS=(await import('exceljs')).default;
   const book=new ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());
   const sheet=book.getWorksheet('Template Siswa')||book.worksheets[0];
   if(!sheet)throw new Error('Sheet siswa tidak ditemukan.');
   const headers:Record<number,string>={};
   sheet.getRow(1).eachCell((cell,i)=>{headers[i]=String(cell.text||'').trim();});
   const rows:Draft[]=[];
   sheet.eachRow((row,line)=>{
    if(line===1)return;
    const obj:Record<string,unknown>={};
    row.eachCell((cell,col)=>{obj[headers[col]||'Kolom '+col]=cell.text?.trim()||'';});
    const full_name=field(obj,['nama lengkap','nama siswa','nama']);
    const username=field(obj,['username','nama pengguna']);
    const jurusan=field(obj,['jurusan','major']);
    const kelas=field(obj,['kelas','class']);
    const angkatan=field(obj,['angkatan','tahun angkatan','admission year']);
    if(!full_name&&!username&&!jurusan&&!kelas)return;
    const matches=classes.filter(c=>{
     const major=majors.find(m=>m.id===c.major_id);
     return normalize(c.class_name)===normalize(kelas) &&
       (normalize(major?.name||'')===normalize(jurusan)||normalize(major?.code||'')===normalize(jurusan));
    });
    rows.push({full_name,username,class_id:matches.length===1?matches[0].id:'',admission_year:angkatan?Number(angkatan):matches.length===1?yearOf(matches[0]):0,line});
   });
   if(rows.length===0)throw new Error('Excel belum berisi data siswa.');
   if(rows.length>5000)throw new Error('Maksimal 5.000 baris per berkas. Pisahkan berkas menjadi beberapa bagian.');
   setDraft(rows);
  }catch(e){setProblem('Tidak bisa membaca Excel: '+(e instanceof Error?e.message:'Format tidak dikenali'));}
  finally{if(fileRef.current)fileRef.current.value='';}
 }
 async function saveRows(rows:Draft[]){
  if(!rows.length||saving)return;
  if(!window.confirm('Tambahkan '+rows.length+' siswa berstatus BELUM TERDAFTAR ke Supabase? Data yang sudah ada tidak akan diubah.'))return;
  setSaving(true);setNotice('');setProblem('');
  try{
   let done=0;
   for(let offset=0;offset<rows.length;offset+=200){
    const chunk=rows.slice(offset,offset+200);
    const {data,error:e}=await supabase().rpc('vokasi_admin_add_pending_students',{p_rows:chunk.map(({full_name,username,class_id,admission_year})=>({full_name,username,class_id,admission_year}))});
    if(e)throw new Error('Gagal pada kelompok '+(Math.floor(offset/200)+1)+': '+e.message+(done?' ('+done+' baris sebelumnya sudah tersimpan)':''));
    done+=Number(data||0);
   }
   setNotice(done+' siswa berhasil ditambahkan sebagai data sekolah. Pembuatan akun/login siswa tetap melalui alur registrasi.');
   setDraft([]);setFileName('');setFullName('');setUsername('');setRefresh(n=>n+1);
  }catch(e){setProblem(e instanceof Error?e.message:'Gagal menyimpan.');setRefresh(n=>n+1);}
  finally{setSaving(false);}
 }
 async function addMajor(e:React.FormEvent){e.preventDefault();if(saving)return;setSaving(true);setProblem('');setNotice('');
  const {error:e2}=await supabase().rpc('vokasi_admin_create_major',{p_name:majorName.trim(),p_code:majorCode.trim()||null});
  if(e2)setProblem(e2.message);else{setNotice('Jurusan berhasil ditambahkan. Sekarang buat kelasnya lewat menu Kelas & Jurusan.');setMajorName('');setMajorCode('');setRefresh(n=>n+1);}setSaving(false);
 }
 function addManual(e:React.FormEvent){e.preventDefault();setNotice('');setProblem('');
  const row:Draft={full_name:fullName.trim(),username:username.trim(),class_id:classId,admission_year:Number(year),line:1};
  const className=classes.find(c=>c.id===row.class_id);
  if(!className){setProblem('Pilih kelas yang valid.');return;}
  const duplicate=existingNames.has(row.class_id+'|'+normalize(row.full_name))||!!row.username&&knownUsernames.has(normalize(row.username));
  if(duplicate){setProblem('Siswa atau username sudah terdaftar.');return;}
  if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(normalize(row.username))&&row.username){setProblem('Username harus 3–40 karakter berupa huruf, angka, titik, minus, atau underscore.');return;}
  if(row.full_name.length<3||row.full_name.length>120||!Number.isInteger(row.admission_year)||row.admission_year<2000||row.admission_year>2100){setProblem('Periksa nama dan tahun angkatan.');return;}
  void saveRows([row]);
 }
 if(loading)return <main className="page-loader">Memverifikasi akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
 <main className="admin-workspace admin-intake">
  <section className="admin-students-hero"><header className="admin-workspace-header"><span className="section-kicker">MANAJEMEN SEKOLAH</span><h1>Kelola Data Sekolah</h1><p>Tambah siswa dan jurusan, impor Excel, periksa duplikat, lalu simpan ke database sekolah.</p></header>
   <div className="admin-mini-stats"><div><Users size={20}/><span>Data siswa</span><strong>{busy?'—':students.length.toLocaleString('id-ID')}</strong></div><div><School2 size={20}/><span>Jurusan aktif</span><strong>{majors.length}</strong></div><div><CheckCircle2 size={20}/><span>Kelas aktif</span><strong>{classes.length}</strong></div></div>
  </section>
  {problem&&<div className="alert danger" role="alert">{problem}</div>}
  {notice&&<div className="admin-intake-success" role="status"><CheckCircle2 size={18}/>{notice}</div>}
  <div className="admin-intake-grid">
   <section className="admin-data-card"><div className="admin-intake-heading"><span className="admin-intake-icon"><Plus size={20}/></span><div><h2>Tambah siswa manual</h2><p>Simpan calon siswa tanpa mengubah akun yang sudah terdaftar.</p></div></div>
    <form className="admin-intake-form" onSubmit={addManual}>
     <label>Nama lengkap<input required maxLength={120} placeholder="Nama siswa" value={fullName} onChange={e=>setFullName(e.target.value)}/></label>
     <label>Username (opsional)<input maxLength={40} placeholder="Boleh dikosongkan" value={username} onChange={e=>setUsername(e.target.value)}/></label>
     <label>Jurusan<select value={majorId} onChange={e=>{setMajorId(e.target.value);setClassId('');}} required><option value="">Pilih jurusan</option>{majors.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
     <label>Kelas<select value={classId} onChange={e=>{setClassId(e.target.value);const cl=classes.find(x=>x.id===e.target.value);if(cl)setYear(String(yearOf(cl)));}} required><option value="">Pilih kelas</option>{classChoices.map(c=><option key={c.id} value={c.id}>{c.class_name}</option>)}</select></label>
     <label>Tahun angkatan<input type="number" required min={2000} max={2100} value={year} onChange={e=>setYear(e.target.value)}/></label>
     <button className="btn primary" type="submit" disabled={saving||busy||!classId}><Plus size={16}/> {saving?'Menyimpan...':'Tambahkan siswa'}</button>
    </form>
   </section>
   <section className="admin-data-card"><div className="admin-intake-heading"><span className="admin-intake-icon"><School2 size={20}/></span><div><h2>Tambah jurusan</h2><p>Daftarkan jurusan baru sebelum membuat kelas.</p></div></div>
    <form className="admin-intake-form" onSubmit={e=>void addMajor(e)}>
     <label>Nama jurusan<input required minLength={3} maxLength={100} value={majorName} onChange={e=>setMajorName(e.target.value)} placeholder="Contoh: Teknik Mesin"/></label>
     <label>Kode jurusan (opsional)<input maxLength={10} value={majorCode} onChange={e=>setMajorCode(e.target.value.toUpperCase())} placeholder="Contoh: TPM"/></label>
     <button className="btn secondary" type="submit" disabled={saving||busy||majorName.trim().length<3}><Plus size={16}/> Simpan jurusan</button>
    </form>
    <div className="admin-intake-hint"><strong>Selanjutnya:</strong> Buat kelas sesuai jurusan pada <Link href="/admin/kelas">Kelas & Jurusan</Link>. Data nilai dan akun siswa lama tidak berubah.</div>
   </section>
  </div>
  <section className="admin-data-card admin-intake-upload"><div className="admin-intake-heading"><span className="admin-intake-icon"><FileSpreadsheet size={20}/></span><div><h2>Impor data siswa dari Excel</h2><p>Unggah template, tinjau hasil dan validasi sebelum menyimpan. Maksimal 5 MB / 5.000 baris per file.</p></div></div>
   <div className="admin-intake-actions">
    <button type="button" className="btn secondary" onClick={()=>void downloadAdminRosterTemplate()}><Download size={17}/> Unduh template Excel</button>
    <input type="file" accept=".xlsx" aria-label="Pilih berkas Excel daftar siswa" ref={fileRef} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);}}/>
    <button type="button" className="btn secondary" onClick={()=>{setBusy(true);setRefresh(n=>n+1);}} disabled={saving||busy}><RefreshCw size={16}/> Segarkan acuan</button>
   </div>
   {fileName&&<p className="admin-intake-file">Berkas: <strong>{fileName}</strong></p>}
   {draft.length>0&&<>
    <div className="admin-intake-review"><span><CheckCircle2 size={18}/> {valid.length} valid</span><span><AlertTriangle size={18}/> {invalid.length} perlu diperbaiki</span><span>{draft.length} total baris</span></div>
    <p className="admin-intake-note">Baris yang bermasalah tidak akan disimpan. Perbaiki Excel lalu unggah ulang. Siswa baru berstatus belum terdaftar; impor ini tidak membuat password.</p>
    <div className="admin-workspace-table-wrap"><table><thead><tr><th>Baris</th><th>Nama</th><th>Username</th><th>Kelas</th><th>Angkatan</th><th>Validasi</th></tr></thead><tbody>{reviews.slice(0,showAll?reviews.length:20).map((r,i)=><tr key={r.line+'-'+i}><td>{r.line}</td><td><b>{r.full_name}</b></td><td>{r.username||'—'}</td><td>{classes.find(c=>c.id===r.class_id)?.class_name||'Tidak cocok'}</td><td>{r.admission_year||'—'}</td><td><span className={r.error?'admin-intake-invalid':'admin-intake-valid'}>{r.error||'Siap impor'}</span></td></tr>)}</tbody></table></div>
    {reviews.length>20&&<button className="admin-intake-more" onClick={()=>setShowAll(x=>!x)} type="button">{showAll?'Tampilkan 20 baris':'Tampilkan semua '+reviews.length+' baris'}</button>}
    <div className="admin-intake-save"><button className="btn primary" type="button" disabled={saving||valid.length===0||busy} onClick={()=>void saveRows(valid)}><Upload size={17}/>{saving?'Menyimpan...':'Impor '+valid.length+' siswa valid'}</button><button className="btn secondary" type="button" disabled={saving} onClick={()=>{setDraft([]);setFileName('');}}>Batalkan pratinjau</button></div>
   </>}
  </section>
 </main>
 </AppShell>;
}
