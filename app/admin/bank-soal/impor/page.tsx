'use client';

import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,BookOpen,CheckCircle2,ChevronDown,FileUp,ImagePlus,Plus,RefreshCw,Save,ShieldAlert,Trash2,UploadCloud,XCircle} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {supabase} from '@/lib/supabase';
import {IMPORT_CATEGORIES,QUESTION_GROUPS,emptyQuestion,inspectQuestionRows,parseQuestionFile,type ImportedQuestion,type QuestionGroup} from '@/lib/question-import';
import '@/app/admin-question-import.css';

type Mode='append'|'replace';
type Stored={id:string;file_name:string;mode:Mode;payload:ImportedQuestion[];created_at:string};
const LIMIT=10;
export default function UnifiedQuestionImport(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [fileName,setFileName]=useState('');const [mode,setMode]=useState<Mode>('append');
 const [rows,setRows]=useState<ImportedQuestion[]>([]);
 const [pendingImages,setPendingImages]=useState<Record<number,File>>({});
 const [warnings,setWarnings]=useState<string[]>([]);
 const [reading,setReading]=useState(false);const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState('');const [confirm,setConfirm]=useState(false);
 const [expanded,setExpanded]=useState<number|null>(0);const [page,setPage]=useState(0);
 const [saved,setSaved]=useState<Stored[]>([]);const [activeCount,setActiveCount]=useState<number|null>(null);
 const [savedId,setSavedId]=useState<string|null>(null);
 const problems=useMemo(()=>inspectQuestionRows(rows.map((row,i)=>pendingImages[i]?{...row,question_image_path:row.question_image_path||'[local-upload]'}:row)),[rows,pendingImages]);
 const imagesCount=Object.keys(pendingImages).length;
 async function refresh(){
  try{
   const [drafts,bank]=await Promise.all([
    supabase().from('vokasi_web_import_drafts').select('id,file_name,mode,payload,created_at')
      .order('created_at',{ascending:false}).limit(12),
    supabase().from('vokasi_web_published_questions').select('source_number',{count:'exact',head:true})
   ]);
   if(drafts.error)throw drafts.error;
   setSaved((drafts.data||[]) as Stored[]);
   if(!bank.error)setActiveCount(bank.count);
  }catch(e){setNotice('Gagal memuat draft impor: '+(e instanceof Error?e.message:'Kesalahan tidak diketahui'));}
 }
 useEffect(()=>{if(!loading&&!error)queueMicrotask(()=>void refresh());},[loading,error]);
 async function handleFile(file?:File){
  if(!file)return;
  setReading(true);setNotice('');setWarnings([]);setRows([]);setPendingImages({});
  setSavedId(null);setFileName(file.name);setPage(0);setExpanded(0);
  try{
   const data=await parseQuestionFile(file);
   setRows(data.questions);
   setWarnings(data.warnings);
   if(data.imageFile)setPendingImages({0:data.imageFile});
   setNotice('Berhasil membaca '+data.questions.length+' soal dari '+file.name+'. Periksa pertanyaan dan kunci sebelum diterbitkan.');
  }catch(e){setNotice('File tidak berhasil diproses: '+(e instanceof Error?e.message:'Gagal membaca isi file.'));}
  finally{setReading(false);}
 }
 function update(i:number,patch:Partial<ImportedQuestion>){
  setRows(old=>old.map((q,j)=>j===i?{...q,...patch}:q));
 }
 function updateChoice(i:number,j:number,value:string){
  setRows(old=>old.map((q,k)=>k===i?{...q,options:q.options.map((o,n)=>n===j?{...o,text:value}:o)}:q));
 }
 function addQuestion(){
  setRows(old=>[...old,emptyQuestion()]);
  setPage(Math.floor(rows.length/LIMIT));setExpanded(rows.length);
  setNotice('');
 }
 function dropQuestion(i:number){
  setRows(old=>old.filter((_,j)=>j!==i));
  setPendingImages(old=>Object.fromEntries(Object.entries(old).filter(([k])=>Number(k)!==i).map(([k,v])=>[Number(k)>i?Number(k)-1:Number(k),v])));
  setExpanded(null);setPage(Math.max(0,Math.floor(Math.max(0,rows.length-2)/LIMIT)));
 }
 async function withStorageUploads():Promise<ImportedQuestion[]>{
  const uploads=Object.entries(pendingImages);
  if(!uploads.length)return rows;
  const {data,error:authError}=await supabase().auth.getUser();
  if(authError||!data.user)throw new Error('Login admin perlu diulang.');
  const complete=rows.map(q=>({...q}));
  for(const [idxStr,file] of uploads){
   const idx=Number(idxStr);
   if(!complete[idx])continue;
   if(file.size>3*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))
    throw new Error('Gambar maksimal 3 MB dan harus PNG/JPG/WEBP.');
   const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
   const path=data.user.id+'/'+crypto.randomUUID()+'.'+ext;
   const {error:uploadError}=await supabase().storage.from('vokasi-question-figures')
     .upload(path,file,{upsert:false,contentType:file.type});
   if(uploadError)throw new Error('Gagal mengunggah gambar untuk soal '+(idx+1)+': '+uploadError.message);
   complete[idx]={...complete[idx],question_image_path:path};
  }
  setRows(complete);setPendingImages({});
  return complete;
 }
 async function saveDraft(){
  if(saving||!rows.length)return;
  setSaving(true);setNotice('');
  try{
   const data=await withStorageUploads();
   const {data:{user},error:e}=await supabase().auth.getUser();
   if(e||!user)throw new Error('Login admin perlu diulang.');
   const result=await supabase().from('vokasi_web_import_drafts')
     .insert({file_name:(fileName||'Buat soal manual').slice(0,250),mode,payload:data,owner_id:user.id});
   if(result.error)throw result.error;
   setNotice('Draft '+data.length+' soal tersimpan. Bank aktif belum diubah. Buka kembali dari daftar draft di bawah.');
   setConfirm(false);await refresh();
  }catch(e){setNotice('Gagal menyimpan draft: '+(e instanceof Error?e.message:'Kesalahan tidak diketahui'));}
  finally{setSaving(false);}
 }
 async function publish(){
  if(saving||!rows.length)return;
  if(problems.length){setNotice('Perbaiki '+problems.length+' masalah sebelum menerbitkan. Kamu tetap bisa simpan sebagai draft.');setConfirm(false);return;}
  if(mode==='replace'&&rows.length!==500){setNotice('Ganti seluruh bank membutuhkan tepat 500 soal yang valid. Bank lama aman dan tidak diubah.');setConfirm(false);return;}
  setSaving(true);setNotice('');
  try{
   const data=await withStorageUploads();
   const {data:result,error:rpcError}=await supabase().rpc('vokasi_admin_import_questions',{p_questions:data,p_mode:mode});
   if(rpcError)throw rpcError;
    setNotice('Berhasil! '+data.length+' soal '+(mode==='replace'?'menggantikan bank lama':'ditambahkan ke bank aktif')+'. Jumlah soal aktif: '+String((result as {after?:number})?.after??'tersinkron')+'.');
   if(savedId)await supabase().from('vokasi_web_import_drafts').delete().eq('id',savedId);
   setRows([]);setPendingImages({});setFileName('');setSavedId(null);setPage(0);setConfirm(false);await refresh();
  }catch(e){setNotice('Tidak ada perubahan pada bank aktif: '+(e instanceof Error?e.message:'Impor ditolak.'));}
  finally{setSaving(false);}
 }
 function restore(item:Stored){
  setRows(item.payload);setFileName(item.file_name);setMode(item.mode);setSavedId(item.id);
  setPendingImages({});setWarnings([]);setPage(0);setExpanded(0);
  setNotice('Draft "'+item.file_name+'" dibuka kembali. Tinjau lalu pilih Tambahkan atau Ganti seluruh bank.');
  window.scrollTo({top:0,behavior:'smooth'});
 }
 async function discard(item:Stored){
  if(!window.confirm('Hapus draft "'+item.file_name+'"? Bank soal aktif tidak terpengaruh.'))return;
  const {error:e}=await supabase().from('vokasi_web_import_drafts').delete().eq('id',item.id);
  if(e)setNotice('Gagal menghapus draft: '+e.message);
  else{setNotice('Draft dihapus. Bank aktif tidak berubah.');await refresh();}
 }
 if(loading)return <main className="page-loader">Memverifikasi akses administrator...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 const totalPages=Math.max(1,Math.ceil(rows.length/LIMIT));
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
  <main className="unified-import">
   <Link className="unified-import-back" href="/admin/bank-soal"><ArrowLeft size={17}/> Kembali ke Bank Soal</Link>
   <header className="unified-import-header">
     <div><span className="section-kicker">KELOLA SOAL</span><h1>Impor soal</h1>
     <p>Satu alur: pilih file, periksa soal, lalu tambahkan atau ganti bank. Tak perlu membuka halaman aktivasi terpisah.</p></div>
     <span className="unified-import-active"><BookOpen size={16}/> Bank aktif: {activeCount===null?'—':activeCount.toLocaleString('id-ID')} soal</span>
   </header>
   {notice&&<div className="unified-import-feedback" role="status">{notice}</div>}
   <section className="unified-import-panel" aria-label="Unggah soal">
     <div className="unified-import-title"><div><span className="section-kicker">LANGKAH 01</span><h2>Unggah sumber soal</h2></div><Link href="/admin/bank-soal/impor/zip" className="unified-import-minilink">Impor ZIP bergambar lama</Link></div>
     <label className="unified-import-drop"><FileUp size={25}/><strong>{reading?'Sedang membaca file...':fileName||'Pilih file atau seret berkas di sini'}</strong><span>Excel (.xlsx), Word (.docx), PDF, atau TXT · maksimal 25 MB</span>
      <input type="file" accept=".xlsx,.docx,.pdf,.txt" disabled={saving||reading} onChange={e=>{void handleFile(e.target.files?.[0]);e.target.value='';}}/>
     </label>
     <p className="unified-import-hint">Untuk dokumen teks: gunakan format <b>1. Pertanyaan</b>, lalu <b>A. Pilihan</b>, <b>B. Pilihan</b>, dan <b>Kunci: A</b>. PDF hasil scan perlu diubah ke teks. File gambar tidak dapat diimpor sendirian; lampirkan lewat editor pertanyaan.</p>
     {warnings.length>0&&<div className="unified-import-warnings">{warnings.map((w,i)=><p key={i}><ShieldAlert size={15}/>{w}</p>)}</div>}
   </section>
   <section className="unified-import-panel" aria-label="Mode impor">
     <div className="unified-import-title"><div><span className="section-kicker">LANGKAH 02</span><h2>Pilih tindakan</h2></div></div>
     <div className="unified-import-modes">
       <button type="button" className={'unified-import-mode '+(mode==='append'?'active':'')} aria-pressed={mode==='append'} onClick={()=>setMode('append')}>
         <Plus size={21}/><strong>Tambahkan soal</strong><span>Soal baru masuk ke bank aktif. Soal lama tetap ada.</span>
       </button>
       <button type="button" className={'unified-import-mode replace '+(mode==='replace'?'active':'')} aria-pressed={mode==='replace'} onClick={()=>setMode('replace')}>
         <RefreshCw size={21}/><strong>Ganti seluruh bank</strong><span>Membutuhkan 500 soal valid dan konfirmasi. Bank sebelumnya tersimpan sebagai audit.</span>
       </button>
     </div>
   </section>
   <section className="unified-import-panel" aria-label="Pratinjau dan edit soal">
    <div className="unified-import-title"><div><span className="section-kicker">LANGKAH 03</span><h2>Pratinjau dan perbaiki soal</h2><p>{rows.length} soal terbaca · {problems.length} masalah perlu perbaikan</p></div>
      <button type="button" className="unified-import-add" disabled={rows.length>=500} onClick={addQuestion}><Plus size={16}/> Buat soal</button>
    </div>
    {rows.length===0?<div className="unified-import-empty"><UploadCloud size={30}/><p>Unggah file atau pilih <b>Buat soal</b> untuk memulai. Editor soal bergambar lebih lengkap tersedia di <Link href="/admin/bank-soal/buat">Buat soal visual</Link>.</p></div>:<>
      {problems.length>0&&<div className="unified-import-problems" role="status"><strong>{problems.length} hal harus diperbaiki sebelum terbit:</strong>{problems.slice(0,5).map((t,i)=><p key={i}>{t}</p>)}{problems.length>5&&<small>…dan {problems.length-5} lainnya.</small>}</div>}
      <div className="unified-import-question-list">
      {rows.slice(page*LIMIT,(page+1)*LIMIT).map((q,index)=>{
       const idx=page*LIMIT+index;
       return <article className="unified-import-question" key={idx}>
        <div className="unified-import-question-top">
          <button type="button" onClick={()=>setExpanded(v=>v===idx?null:idx)} aria-expanded={expanded===idx}>
            <span className="unified-import-qnumber">{idx+1}</span><span><strong>{q.question.trim()||'Soal bergambar (belum diisi)'}</strong><small>{q.category} · {QUESTION_GROUPS[q.difficulty_code].seconds} detik · {q.correct_index===null?'Kunci belum dipilih':'Kunci '+String.fromCharCode(65+q.correct_index)}</small></span><ChevronDown size={18}/>
          </button>
          <button type="button" aria-label={'Hapus soal '+(idx+1)} className="unified-import-remove" onClick={()=>dropQuestion(idx)}><Trash2 size={16}/></button>
        </div>
        {expanded===idx&&<div className="unified-import-edit">
          <label>Pertanyaan<textarea rows={2} value={q.question} placeholder="Tulis pertanyaan..." onChange={e=>update(idx,{question:e.target.value})}/></label>
          <div className="unified-import-edit-grid">
            <label>Kategori<select value={q.category} onChange={e=>update(idx,{category:e.target.value})}>{IMPORT_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
            <label>Kelompok & durasi<select value={q.difficulty_code} onChange={e=>{const group=e.target.value as QuestionGroup;update(idx,{difficulty_code:group,time_limit_seconds:QUESTION_GROUPS[group].seconds});}}>{Object.entries(QUESTION_GROUPS).map(([key,v])=><option key={key} value={key}>{v.label} · {v.seconds} detik</option>)}</select></label>
          </div>
          <label className="unified-import-image-input"><ImagePlus size={18}/>{pendingImages[idx]?.name||q.question_image_path?'Ganti gambar soal (PNG/JPG/WEBP)':'Lampirkan gambar soal'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f){setPendingImages(v=>({...v,[idx]:f}));}e.target.value='';}}/></label>
          {(pendingImages[idx]||q.question_image_path)&&<p className="unified-import-image-note"><CheckCircle2 size={14}/> {pendingImages[idx]?'Gambar '+pendingImages[idx].name+' akan diunggah saat menyimpan.':'Gambar sudah tersimpan pada draft.'}</p>}
          <fieldset><legend>Pilihan jawaban · pilih bulatan sebagai kunci</legend>
           {q.options.map((o,j)=><label className="unified-import-choice" key={j}><input type="radio" name={'correct-'+idx} checked={q.correct_index===j} onChange={()=>update(idx,{correct_index:j})}/><b>{String.fromCharCode(65+j)}</b><input type="text" value={o.text} placeholder={'Pilihan '+String.fromCharCode(65+j)} onChange={e=>updateChoice(idx,j,e.target.value)}/></label>)}
           <div className="unified-import-option-buttons">
            <button type="button" disabled={q.options.length>=6} onClick={()=>update(idx,{options:[...q.options,{text:'',image_path:null}]})}><Plus size={14}/> Tambah opsi</button>
            <button type="button" disabled={q.options.length<=2} onClick={()=>update(idx,{options:q.options.slice(0,-1),correct_index:q.correct_index!==null&&q.correct_index>=q.options.length-1?null:q.correct_index})}>Kurangi opsi</button>
           </div>
          </fieldset>
          <label>Pembahasan (opsional)<textarea rows={2} value={q.explanation} onChange={e=>update(idx,{explanation:e.target.value})}/></label>
        </div>}
       </article>;
      })}
      </div>
      {totalPages>1&&<div className="unified-import-pagination"><button type="button" disabled={page===0} onClick={()=>{setPage(v=>v-1);setExpanded(null);}}>Sebelumnya</button><span>Halaman {page+1} / {totalPages}</span><button type="button" disabled={page>=totalPages-1} onClick={()=>{setPage(v=>v+1);setExpanded(null);}}>Berikutnya</button></div>}
      <div className="unified-import-actions">
       <button type="button" className="unified-import-save" disabled={saving||reading} onClick={()=>void saveDraft()}><Save size={17}/> Simpan draft</button>
       <button type="button" className="unified-import-publish" disabled={saving||reading||problems.length>0} onClick={()=>setConfirm(true)}><CheckCircle2 size={17}/> {mode==='replace'?'Ganti bank soal':'Tambahkan ke bank aktif'}</button>
      </div>
    </>}
   </section>
   <section className="unified-import-panel" aria-label="Draft impor">
    <div className="unified-import-title"><div><span className="section-kicker">BELUM DITERBITKAN</span><h2>Draft tersimpan</h2></div><button type="button" className="unified-import-reload" onClick={()=>void refresh()}><RefreshCw size={15}/> Segarkan</button></div>
    {saved.length===0?<p className="unified-import-hint">Belum ada draft impor tersimpan.</p>:<div className="unified-import-saved">{saved.map(d=><div key={d.id}><div><strong>{d.file_name}</strong><small>{d.payload.length} soal · {d.mode==='replace'?'Rencana ganti bank':'Rencana tambah soal'} · {new Date(d.created_at).toLocaleDateString('id-ID')}</small></div><button type="button" onClick={()=>restore(d)}>Buka</button><button type="button" aria-label={'Hapus draft '+d.file_name} onClick={()=>void discard(d)}><Trash2 size={15}/></button></div>)}</div>}
   </section>
   {confirm&&<div className="unified-import-modal-backdrop" role="presentation" onMouseDown={()=>setConfirm(false)}><section className="unified-import-modal" role="alertdialog" aria-modal="true" aria-labelledby="unified-import-modal-title" aria-describedby="unified-import-modal-description" onMouseDown={e=>e.stopPropagation()}>
    <div className="unified-import-modal-icon"><ShieldAlert size={27}/></div>
    <h2 id="unified-import-modal-title">{mode==='replace'?'Yakin ganti seluruh bank soal?':'Terbitkan soal baru sekarang?'}</h2>
    <p id="unified-import-modal-description">{mode==='replace'
    ?'Seluruh bank aktif akan diganti dengan '+rows.length+' soal hasil impor. Operasi hanya berhasil jika paket memenuhi 500 soal dan blueprint ujian. Nilai siswa dan riwayat tetap tersimpan; cadangan bank sebelumnya dicatat.'
    :'Sebanyak '+rows.length+' soal akan langsung ditambahkan ke bank aktif, tanpa menghapus '+(activeCount??'soal')+' soal sebelumnya.'}</p>
    <div className="unified-import-modal-actions">
      <button type="button" disabled={saving} onClick={()=>setConfirm(false)}><XCircle size={16}/> Batal</button>
      <button type="button" disabled={saving} onClick={()=>void saveDraft()}><Save size={16}/> Simpan draft saja</button>
      <button type="button" className="confirm" disabled={saving||problems.length>0} onClick={()=>void publish()}>{saving?'Memproses...':mode==='replace'?'Ya, ganti bank':'Ya, tambahkan'}</button>
    </div>
   </section></div>}
  </main>
 </AppShell>;
}
