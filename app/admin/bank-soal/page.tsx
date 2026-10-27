'use client';

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {BookOpen,Clock3,FileQuestion,Plus,Search,FileUp,PenLine,AlertCircle,FileText,CheckCircle2,UploadCloud,Trash2} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {fetchBank} from '@/lib/quiz';
import {supabase} from '@/lib/supabase';
import {APPROVED_BLUEPRINT,APPROVED_GROUPS,approvedGroup} from '@/lib/new-bank-blueprint';
import BankFilterDropdown from '@/components/BankFilterDropdown';
import type {BankQuestion} from '@/lib/types';
import '@/app/admin-workspace.css';
import '@/app/admin-students-ui.css';
import '@/app/admin-bank-ui.css';

// User-facing labels. Database codes remain unchanged for exam selection and timing.
const GROUP_LABELS:Record<string,string>={
 HITUNG_DASAR:'Hitungan Dasar',
 HITUNG_MENENGAH:'Hitungan Menengah',
 HITUNG_LANJUT:'Hitungan Lanjutan',
 NUMERASI_CAMPURAN:'Numerasi Campuran',
 FISIKA_DASAR:'Fisika Dasar',
 LOGIKA:'Logika & Penalaran',
 POLA_GAMBAR:'Pola Gambar'
};
const MATERIAL_GROUPS:Record<string,string[]>={
 Perkalian:['HITUNG_DASAR','HITUNG_MENENGAH','HITUNG_LANJUT'],
 Pembagian:['HITUNG_DASAR','HITUNG_MENENGAH','HITUNG_LANJUT'],
 'Numerasi Campuran':['NUMERASI_CAMPURAN'],
 'Fisika Dasar':['FISIKA_DASAR'],
 'Logika dan Penalaran':['LOGIKA'],
 'Pola Gambar':['POLA_GAMBAR']
};
const EDIT_MATERIALS=Object.keys(MATERIAL_GROUPS);
const groupLabel=(key:string)=>GROUP_LABELS[key]||key.replaceAll('_',' ').toLocaleLowerCase('id-ID').replace(/^./,c=>c.toLocaleUpperCase('id-ID'));

type DraftRow={id:string;source_number:number|null;category:string;difficulty_code:string|null;question:string;question_image_path:string|null;options:{text:string;image_path:string|null}[];correct_index:number;time_limit_seconds:number;explanation:string;created_at:string};
type ImportDraft={id:string;file_name:string;mode:string;payload:unknown[];created_at:string};
type ReviewItem={number:number;reasons:string[]};
type DraftIssue={id:string;reasons:string[]};
type BankTab='published'|'review'|'drafts';
const blankOptions=():{text:string;image_path:string|null}[]=>[{text:'',image_path:null},{text:'',image_path:null},{text:'',image_path:null}];
type EditRow={source_number:number;category:string;difficulty_code:string;question:string;question_image_path:string|null;options:{text:string;image_path:string|null}[];correct_index:number;time_limit_seconds:number;explanation:string};
export default function AdminBankPage(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [bank,setBank]=useState<BankQuestion[]>([]),[busy,setBusy]=useState(true),[issue,setIssue]=useState('');
 const [tab,setTab]=useState<BankTab>('published');
 const [review,setReview]=useState<ReviewItem[]>([]),[draftProblems,setDraftProblems]=useState<DraftIssue[]>([]);
 const [drafts,setDrafts]=useState<DraftRow[]>([]),[importDrafts,setImportDrafts]=useState<ImportDraft[]>([]);
 const [createOpen,setCreateOpen]=useState(false),[createSaving,setCreateSaving]=useState(false),[createNotice,setCreateNotice]=useState('');
 const [draftEditing,setDraftEditing]=useState<string|null>(null);
 const [newCategory,setNewCategory]=useState('Perkalian'),[newGroup,setNewGroup]=useState('HITUNG_DASAR');
 const [newQuestion,setNewQuestion]=useState(''),[newOptions,setNewOptions]=useState(blankOptions);
 const [newCorrect,setNewCorrect]=useState(0),[newExplanation,setNewExplanation]=useState('');
 const [newImage,setNewImage]=useState<File|null>(null),[newImagePath,setNewImagePath]=useState<string|null>(null);
 const [newChoiceFiles,setNewChoiceFiles]=useState<Record<number,File>>({}),[publishNew,setPublishNew]=useState(false);
 
 function openNew(d?:DraftRow){
  setDraftEditing(d?.id||null);setNewCategory(d?.category||'Perkalian');
  setNewGroup(d?.difficulty_code||'HITUNG_DASAR');
  setNewQuestion(d?.question||'');setNewOptions(d?.options.map(o=>({...o}))||blankOptions());
  setNewCorrect(d?.correct_index||0);setNewExplanation(d?.explanation||'');
  setNewImage(null);setNewImagePath(d?.question_image_path||null);
  setNewChoiceFiles({});setPublishNew(false);setCreateNotice('');setCreateOpen(true);
 }
 function changeNewCategory(category:string){
  const options=MATERIAL_GROUPS[category]||[];
  setNewCategory(category);setNewGroup(g=>options.includes(g)?g:options[0]||'HITUNG_DASAR');
 }
 async function saveNew(){
  setCreateNotice('');
  if(!newQuestion.trim()&&!newImage&&!newImagePath){setCreateNotice('Pertanyaan atau gambar utama wajib tersedia.');return;}
  if(newOptions.length<2||newOptions.length>6||newOptions.some((o,i)=>!o.text.trim()&&!o.image_path&&!newChoiceFiles[i])){setCreateNotice('Lengkapi seluruh pilihan jawaban (2–6 opsi).');return;}
  if(newCorrect<0||newCorrect>=newOptions.length){setCreateNotice('Pilih kunci jawaban.');return;}
  if(newGroup==='POLA_GAMBAR'&&!newImage&&!newImagePath){setCreateNotice('Pola Gambar wajib memiliki gambar utama.');return;}
  if(!MATERIAL_GROUPS[newCategory]?.includes(newGroup)||!approvedGroup(newGroup)){setCreateNotice('Materi dan kelompok tidak sesuai.');return;}
  if(publishNew&&draftEditing){setCreateNotice('Simpan perubahan draft terlebih dahulu. Terbitkan soal baru lewat Tambah Soal.');return;}
  if(publishNew&&!window.confirm('Terbitkan soal langsung ke bank aktif? Soal lama tidak diganti.'))return;
  setCreateSaving(true);
  const uploaded:string[]=[];
  try{
   const {data:{user},error:authError}=await supabase().auth.getUser();
   if(authError||!user)throw new Error('Sesi admin perlu diperbarui.');
   async function upload(file:File){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3145728)throw new Error('Gambar harus PNG/JPG/WEBP maksimal 3 MB.');
    const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
    const path=user!.id+'/'+crypto.randomUUID()+'.'+ext;
    const {error:uploadError}=await supabase().storage.from('vokasi-question-figures').upload(path,file,{contentType:file.type,upsert:false});
    if(uploadError)throw uploadError;
    uploaded.push(path);return path;
   }
   const imagePath=newImage?await upload(newImage):newImagePath;
   const answers=[];
   for(let i=0;i<newOptions.length;i++)answers.push({text:newOptions[i].text.trim(),image_path:newChoiceFiles[i]?await upload(newChoiceFiles[i]):newOptions[i].image_path});
   const values={category:newCategory,difficulty_code:newGroup,time_limit_seconds:APPROVED_BLUEPRINT.groups[newGroup as keyof typeof APPROVED_BLUEPRINT.groups].seconds,
    question:newQuestion.trim(),question_image_path:imagePath,options:answers,correct_index:newCorrect,explanation:newExplanation.trim()};
   if(publishNew){
    const {error:publishError}=await supabase().rpc('vokasi_admin_import_questions',{p_questions:[values],p_mode:'append'});
    if(publishError)throw publishError;
   }else if(draftEditing){
    const {error:saveError}=await supabase().from('vokasi_question_drafts').update(values).eq('id',draftEditing);
    if(saveError)throw saveError;
   }else{
    const {error:saveError}=await supabase().from('vokasi_question_drafts').insert({...values,source_number:null,created_by:user.id});
    if(saveError)throw saveError;
   }
   setCreateOpen(false);setTab(publishNew?'published':'drafts');setBusy(true);setRefreshKey(v=>v+1);
  }catch(e){
   if(uploaded.length)await supabase().storage.from('vokasi-question-figures').remove(uploaded);
   setCreateNotice(e instanceof Error?e.message:'Gagal menyimpan soal.');
  }finally{setCreateSaving(false);}
 }
 async function deleteDraft(d:DraftRow){
  if(!window.confirm('Hapus draft ini? Soal aktif tetap aman.'))return;
  const {error}=await supabase().from('vokasi_question_drafts').delete().eq('id',d.id);
  if(error)setIssue(error.message);else{setBusy(true);setRefreshKey(v=>v+1);}
 }
 const [edit,setEdit]=useState<EditRow|null>(null),[original,setOriginal]=useState<EditRow|null>(null);
 const [editBusy,setEditBusy]=useState(false),[editIssue,setEditIssue]=useState(''),[refreshKey,setRefreshKey]=useState(0);
 async function startEdit(id:number){
  setEditBusy(true);setEditIssue('');
  const {data,error:err}=await supabase().rpc('vokasi_admin_get_edit_question',{p_source_number:id});
  if(err||!data){setIssue(err?.message||'Soal tidak ditemukan.');setEditBusy(false);return;}
  const row=data as EditRow;
  setOriginal(row);setEdit(structuredClone(row));setEditBusy(false);
 }
 function changeEditMaterial(next:string){
  if(!edit)return;
  const valid=MATERIAL_GROUPS[next]||[];
  const group=valid.includes(edit.difficulty_code)?edit.difficulty_code:valid[0];
  if(!group||!approvedGroup(group))return;
  setEdit({...edit,category:next,difficulty_code:group,time_limit_seconds:APPROVED_BLUEPRINT.groups[group].seconds});
  setEditIssue('');
 }
 function changeEditGroup(next:string){
  if(!edit||!approvedGroup(next)||!MATERIAL_GROUPS[edit.category]?.includes(next))return;
  setEdit({...edit,difficulty_code:next,time_limit_seconds:APPROVED_BLUEPRINT.groups[next].seconds});
  setEditIssue('');
 }
 async function saveEdit(){
  if(!edit||!original)return;
  if(!edit.question.trim()&&!edit.question_image_path){setEditIssue('Isi pertanyaan atau gambar soal.');return;}
  if(edit.options.some(o=>!o.text.trim()&&!o.image_path)){setEditIssue('Setiap pilihan harus berisi teks atau gambar.');return;}
  if(!MATERIAL_GROUPS[edit.category]?.includes(edit.difficulty_code)||!approvedGroup(edit.difficulty_code)){
   setEditIssue('Materi dan kelompok ujian tidak sesuai.');return;
  }
  if(edit.difficulty_code==='POLA_GAMBAR'&&!edit.question_image_path){
   setEditIssue('Kelompok Pola Gambar memerlukan gambar utama.');return;
  }
  if(edit.correct_index<0||edit.correct_index>=edit.options.length){setEditIssue('Pilih kunci yang valid.');return;}
  setEditBusy(true);setEditIssue('');
  const {error:err}=await supabase().rpc('vokasi_admin_edit_published_question',{
   p_source_number:edit.source_number,p_expected:original,
   p_change:{category:edit.category,difficulty_code:edit.difficulty_code,question:edit.question,question_image_path:edit.question_image_path,
    options:edit.options,correct_index:edit.correct_index,explanation:edit.explanation}
  });
  if(err){setEditIssue(err.message);setEditBusy(false);return;}
  setEdit(null);setOriginal(null);setSelected(null);setBusy(true);setRefreshKey(v=>v+1);setEditBusy(false);
 }
 const [search,setSearch]=useState(''),[category,setCategory]=useState(''),[code,setCode]=useState(''),[page,setPage]=useState(0),[selected,setSelected]=useState<BankQuestion|null>(null);
 useEffect(()=>{if(loading||error)return;let active=true;
  async function load(){try{
    const [bankResult,qualityResult,draftResult,importResult]=await Promise.allSettled([
     fetchBank({allowIncomplete:true}),
     supabase().rpc('vokasi_admin_question_health'),
     supabase().from('vokasi_question_drafts').select('id,source_number,category,difficulty_code,question,question_image_path,options,correct_index,time_limit_seconds,explanation,created_at').order('created_at',{ascending:false}).limit(1000),
     supabase().from('vokasi_web_import_drafts').select('id,file_name,mode,payload,created_at').order('created_at',{ascending:false}).limit(30)
    ]);
    if(bankResult.status==='rejected')throw bankResult.reason;
    const data=bankResult.value;
    const rawDrafts=draftResult.status==='fulfilled'&&!draftResult.value.error?(draftResult.value.data||[]) as DraftRow[]:[];
    const rowMap=new Map(data.map(x=>[x.id,x]));
    // Legacy migration kept 500 mirrored draft copies. Hide identical published records.
    const actualDrafts=rawDrafts.filter(d=>{
      const pub=d.source_number?rowMap.get(d.source_number):undefined;
      if(!pub)return true;
      return d.question!==pub.question||d.category!==pub.category||d.difficulty_code!==pub.difficultyCode||
       d.time_limit_seconds!==pub.timeLimitSeconds||d.explanation!==pub.explanation||
       d.correct_index!==pub.correctOption.charCodeAt(0)-65||
       Boolean(d.question_image_path)!==Boolean(pub.questionImageUrl)||
       JSON.stringify(d.options.map(o=>o.text))!==JSON.stringify(pub.options)||
       JSON.stringify(d.options.map(o=>Boolean(o.image_path)))!==JSON.stringify(pub.optionImageUrls?.map(Boolean));
    });
    const health=qualityResult.status==='fulfilled'&&!qualityResult.value.error?qualityResult.value.data as {published?:ReviewItem[];drafts?:DraftIssue[]}:null;
    if(active){
     setBank(data);setReview(health?.published||[]);
     setDraftProblems(health?.drafts||[]);setDrafts(actualDrafts);
     setImportDrafts(importResult.status==='fulfilled'&&!importResult.value.error?(importResult.value.data||[]) as ImportDraft[]:[]);
     setIssue(qualityResult.status==='fulfilled'&&qualityResult.value.error?'Pemeriksaan status belum tersedia: '+qualityResult.value.error.message:'');
     setBusy(false);
    }
   }catch(e){if(active){setIssue(e instanceof Error?e.message:'Bank soal tidak dapat dimuat.');setBusy(false);}}}
  queueMicrotask(()=>void load());return()=>{active=false};
 },[loading,error,refreshKey]);
 const categories=useMemo(()=>[...new Set(bank.map(b=>b.category))].sort((a,b)=>a.localeCompare(b,'id')),[bank]);
 const codes=useMemo(()=>[...new Set(bank.filter(b=>!category||b.category===category).map(b=>b.difficultyCode))]
  .sort((a,b)=>{const ai=APPROVED_GROUPS.findIndex(x=>x===a),bi=APPROVED_GROUPS.findIndex(x=>x===b);
   return (ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b,'id');}),[bank,category]);
 const materialItems=useMemo(()=>[
  {value:'',label:'Semua materi',count:bank.length},
  ...categories.map(name=>({value:name,label:name,count:bank.filter(q=>q.category===name).length}))
 ],[categories,bank]);
 const groupItems=useMemo(()=>{
  const available=bank.filter(q=>!category||q.category===category);
  return [
   {value:'',label:'Semua kelompok',count:available.length},
   ...codes.map(key=>({
    value:key,label:groupLabel(key),count:available.filter(q=>q.difficultyCode===key).length,
    note:approvedGroup(key)?APPROVED_BLUEPRINT.groups[key].seconds+' detik/soal · '+APPROVED_BLUEPRINT.groups[key].quota+' soal di ujian wajib':undefined
   }))
  ];
 },[bank,category,codes]);
 const filtered=useMemo(()=>bank.filter(b=>(!category||b.category===category)&&(!code||b.difficultyCode===code)&&(!search||[String(b.id),b.question,b.category,b.difficultyCode].some(x=>x.toLowerCase().includes(search.trim().toLowerCase())))),[bank,category,code,search]);
 const pages=Math.max(1,Math.ceil(filtered.length/30)),activePage=Math.min(page,pages-1);
 if(loading)return <main className="page-loader">Memverifikasi hak akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
  <div className="admin-workspace admin-students-page admin-bank-page">
   <section className="admin-students-hero" aria-label="Ringkasan bank soal">
    <header className="admin-workspace-header"><span className="section-kicker">KONTEN LATIHAN</span><h1>Bank Soal</h1><p>Cari dan kelola bank soal, impor, atau simpan draft.</p></header>
    <div className="admin-mini-stats"><div><BookOpen size={20}/><span>Jumlah soal</span><strong>{busy?'—':bank.length.toLocaleString('id-ID')}</strong></div><div><FileQuestion size={20}/><span>Kategori</span><strong>{busy?'—':categories.length}</strong></div><div><Clock3 size={20}/><span>Blueprint wajib</span><strong>100 soal</strong></div></div>
   </section>
   <section className="admin-data-card">
    <div className="admin-data-title"><div><h2>Daftar pertanyaan</h2><p>Cari berdasarkan materi atau kelompok ujian. Keduanya berbeda: materi adalah topik, kelompok menentukan pembagian soal dan waktu ujian.</p></div><div className="admin-bank-actions"><Link href="/admin/bank-soal/impor" className="btn secondary small"><FileUp size={16}/> Impor soal</Link><button type="button" className="btn primary small" onClick={()=>openNew()}><Plus size={17}/> Tambah soal</button></div></div>
    {issue&&<div className="alert danger" role="alert">{issue}</div>}
    <div className="admin-bank-workspace-tabs" role="tablist" aria-label="Status bank soal">
      <button role="tab" type="button" aria-selected={tab==='published'} className={tab==='published'?'active':''} onClick={()=>{setTab('published');setPage(0);}}><BookOpen size={15}/> Semua soal <span>{bank.length}</span></button>
      <button role="tab" type="button" aria-selected={tab==='review'} className={tab==='review'?'active':''} onClick={()=>{setTab('review');setPage(0);}}><AlertCircle size={15}/> Perlu ditinjau <span>{review.length}</span></button>
      <button role="tab" type="button" aria-selected={tab==='drafts'} className={tab==='drafts'?'active':''} onClick={()=>{setTab('drafts');setPage(0);}}><FileText size={15}/> Draft <span>{drafts.length+importDrafts.length}</span></button>
    </div>
    {tab!=='drafts'&&<div className="admin-directory-controls admin-directory-controls-simple">
     <label className="admin-directory-search"><Search size={17}/><input value={search} aria-label="Cari soal" placeholder="Cari ID atau teks soal..." onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
     <BankFilterDropdown label="Materi" value={category} items={materialItems} onChange={next=>{setCategory(next);setCode('');setPage(0);}}/>
     <BankFilterDropdown label="Kelompok ujian" value={code} items={groupItems} onChange={next=>{setCode(next);setPage(0);}}/>
    </div>}
    {tab==='drafts'?<div className="admin-bank-draft-list" role="tabpanel">
     {drafts.length===0&&importDrafts.length===0?<div className="admin-workspace-empty">Belum ada draft yang belum diterbitkan.</div>:<>
      {drafts.map(d=>{const problems=draftProblems.find(x=>x.id===d.id)?.reasons||[];return <article key={d.id} className="admin-bank-draft-card">
       <div className="admin-bank-draft-info"><span className="admin-bank-draft-tag">Draft soal</span>
        <strong>{d.question||'Soal bergambar'}</strong><p>{d.category} · {groupLabel(d.difficulty_code||'')} · {d.time_limit_seconds} detik</p>
        {problems.length>0?<span className="admin-bank-quality needs"><AlertCircle size={13}/> Perlu dilengkapi: {problems.join(', ')}</span>:<span className="admin-bank-quality draft"><FileText size={13}/> Belum diterbitkan</span>}
       </div><div className="admin-bank-row-actions"><button className="admin-workspace-detail" type="button" onClick={()=>openNew(d)}>Lanjutkan</button><button type="button" className="admin-bank-edit-button" onClick={()=>void deleteDraft(d)}><Trash2 size={13}/> Hapus draft</button></div>
      </article>})}
      {importDrafts.map(d=><article key={d.id} className="admin-bank-draft-card">
       <div className="admin-bank-draft-info"><span className="admin-bank-draft-tag">Draft impor</span><strong>{d.file_name}</strong>
        <p>{d.payload.length} soal · {d.mode==='replace'?'Ganti bank':'Tambahkan soal'}</p><span className="admin-bank-quality draft"><FileText size={13}/> Perlu ditinjau sebelum terbit</span></div>
       <Link className="admin-workspace-detail" href="/admin/bank-soal/impor">Buka impor</Link>
      </article>)}
     </>}
    </div>:busy?<div className="admin-workspace-empty">Mengambil bank soal aktif...</div>:filtered.filter(q=>tab==='published'||review.some(r=>r.number===q.id)).length===0?<div className="admin-workspace-empty">{tab==='review'?'Tidak ada soal aktif yang perlu ditinjau.':'Tidak ada soal yang sesuai.'}</div>:
     <div className="admin-workspace-table-wrap">
      <table className="admin-bank-table">
       <colgroup><col className="bank-width-id"/><col className="bank-width-category"/><col className="bank-width-code"/><col className="bank-width-question"/><col className="bank-width-time"/><col className="bank-width-status"/><col className="bank-width-actions"/></colgroup>
       <thead><tr><th scope="col">ID</th><th scope="col">Materi</th><th scope="col">Kelompok ujian</th><th scope="col">Soal</th><th scope="col">Waktu</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead>
       <tbody>{filtered.filter(q=>tab==='published'||review.some(r=>r.number===q.id)).slice(activePage*30,(activePage+1)*30).map(q=><tr key={q.id}>
        <td className="bank-cell-id"><b>#{q.id}</b></td>
        <td><span className="admin-bank-category">{q.category}</span></td>
        <td><span className="admin-bank-code" title={q.difficultyCode}>{groupLabel(q.difficultyCode)}</span></td>
        <td><span className="admin-bank-question" title={q.question||'Soal bergambar'}>{q.question||'Soal bergambar'}</span></td>
        <td className="bank-cell-time">{q.timeLimitSeconds} detik</td>
        <td>{review.some(x=>x.number===q.id)?<button type="button" className="admin-bank-quality needs" title={review.find(x=>x.number===q.id)?.reasons.join('; ')} onClick={()=>setSelected(q)}><AlertCircle size={13}/> Perlu ditinjau</button>:<span className="admin-bank-quality ok"><CheckCircle2 size={13}/> Lengkap</span>}</td>
        <td><div className="admin-bank-row-actions">
         <button type="button" className="admin-workspace-detail" onClick={()=>setSelected(q)}>Detail</button>
         <button type="button" className="admin-bank-edit-button" disabled={editBusy} onClick={()=>void startEdit(q.id)}><PenLine size={13}/> Edit</button>
        </div></td>
       </tr>)}</tbody>
      </table>
     </div>}
    {tab!=='drafts'&&<div className="admin-workspace-footer"><span>{tab==='review'?filtered.filter(q=>review.some(r=>r.number===q.id)).length:filtered.length} soal sesuai filter</span><div><button type="button" onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={activePage===0}>Sebelumnya</button><span>{activePage+1} / {tab==='review'?Math.max(1,Math.ceil(filtered.filter(q=>review.some(r=>r.number===q.id)).length/30)):pages}</span><button type="button" onClick={()=>setPage(p=>p+1)} disabled={activePage>=(tab==='review'?Math.max(1,Math.ceil(filtered.filter(q=>review.some(r=>r.number===q.id)).length/30)):pages)-1}>Berikutnya</button></div></div>}
   </section>
   
   {createOpen&&<div className="admin-modal-overlay" role="presentation" onMouseDown={()=>{if(!createSaving)setCreateOpen(false);}}>
    <section role="dialog" aria-modal="true" aria-label={draftEditing?'Lanjutkan draft':'Tambah soal'} className="admin-modal-card admin-bank-create-modal" onMouseDown={e=>e.stopPropagation()}>
     <div className="admin-modal-top"><div><span className="section-kicker">BANK SOAL</span><h2>{draftEditing?'Lanjutkan draft':'Tambah soal'}</h2></div><button aria-label="Tutup" type="button" disabled={createSaving} onClick={()=>setCreateOpen(false)}>×</button></div>
     {createNotice&&<div role="alert" className="alert danger">{createNotice}</div>}
     <div className="admin-bank-edit-classification"><label>Materi<select value={newCategory} onChange={e=>changeNewCategory(e.target.value)}>{EDIT_MATERIALS.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Kelompok ujian<select value={newGroup} onChange={e=>setNewGroup(e.target.value)}>{(MATERIAL_GROUPS[newCategory]||[]).map(x=><option key={x} value={x}>{groupLabel(x)}</option>)}</select></label>
      <label>Waktu<div className="admin-bank-edit-duration">{approvedGroup(newGroup)?APPROVED_BLUEPRINT.groups[newGroup].seconds:5} detik</div></label></div>
     <label>Pertanyaan<textarea rows={3} value={newQuestion} onChange={e=>setNewQuestion(e.target.value)} placeholder="Tulis pertanyaan..."/></label>
     <label className="admin-bank-create-upload"><UploadCloud size={17}/> {newImage?.name|| (newImagePath?'Gambar tersimpan · klik untuk mengganti':'Lampirkan gambar soal (PNG/JPG/WEBP)')}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setNewImage(e.target.files?.[0]||null)}/></label>
     {(newImage||newImagePath)&&<button type="button" className="admin-bank-file-remove" onClick={()=>{setNewImage(null);setNewImagePath(null);}}>Hapus gambar utama</button>}
     <fieldset><legend>Pilihan jawaban · tandai kunci yang benar</legend>{newOptions.map((o,i)=><div key={i} className="admin-bank-new-choice"><label><input type="radio" name="new-correct" checked={newCorrect===i} onChange={()=>setNewCorrect(i)}/>{String.fromCharCode(65+i)}</label>
      <input aria-label={'Pilihan '+String.fromCharCode(65+i)} placeholder="Teks jawaban atau lampirkan gambar" value={o.text} onChange={e=>setNewOptions(prev=>prev.map((v,j)=>j===i?{...v,text:e.target.value}:v))}/>
      <label className="admin-bank-option-upload"><UploadCloud size={15}/>{newChoiceFiles[i]?'Terpilih':o.image_path?'Tersimpan':'Gambar'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)setNewChoiceFiles(p=>({...p,[i]:file}));}}/></label>
      {newOptions.length>2&&<button type="button" className="admin-bank-mini-remove" aria-label={'Hapus pilihan '+String.fromCharCode(65+i)} onClick={()=>{setNewOptions(p=>p.filter((_,j)=>j!==i));setNewCorrect(p=>p===i?0:p>i?p-1:p);setNewChoiceFiles({});}}><Trash2 size={14}/></button>}
     </div>)}
      {newOptions.length<6&&<button type="button" className="admin-bank-add-choice" onClick={()=>setNewOptions(v=>[...v,{text:'',image_path:null}])}><Plus size={14}/> Tambah pilihan</button>}</fieldset>
     <label>Pembahasan (opsional)<textarea rows={2} value={newExplanation} onChange={e=>setNewExplanation(e.target.value)}/></label>
     {!draftEditing&&<label className="admin-bank-publish-check"><input type="checkbox" checked={publishNew} onChange={e=>setPublishNew(e.target.checked)}/><span><strong>Langsung terbitkan ke bank aktif</strong><small>Jika tidak dicentang, soal disimpan sebagai draft.</small></span></label>}
     <div className="admin-bank-edit-actions"><button type="button" className="btn secondary small" disabled={createSaving} onClick={()=>setCreateOpen(false)}>Batal</button><button type="button" className="btn primary small" disabled={createSaving} onClick={()=>void saveNew()}>{createSaving?'Menyimpan...':publishNew?'Terbitkan soal':'Simpan draft'}</button></div>
    </section></div>}
   {edit&&<div className="admin-modal-overlay" role="presentation" onMouseDown={()=>{if(!editBusy){setEdit(null);setOriginal(null);}}}><section className="admin-modal-card admin-bank-edit-modal" role="dialog" aria-modal="true" aria-label={'Edit soal '+edit.source_number} onMouseDown={e=>e.stopPropagation()}>
    <div className="admin-modal-top"><div><span className="section-kicker">EDIT SOAL #{edit.source_number}</span><h2>Sunting pertanyaan</h2></div><button type="button" aria-label="Tutup editor" disabled={editBusy} onClick={()=>{setEdit(null);setOriginal(null);}}>×</button></div>
    <div className="admin-bank-edit-classification">
     <label>Materi
      <select value={edit.category} disabled={editBusy} onChange={e=>changeEditMaterial(e.target.value)}>
       {EDIT_MATERIALS.map(name=><option key={name} value={name}>{name}</option>)}
      </select>
     </label>
     <label>Kelompok ujian
      <select value={edit.difficulty_code} disabled={editBusy} onChange={e=>changeEditGroup(e.target.value)}>
       {(MATERIAL_GROUPS[edit.category]||[]).map(key=><option key={key} value={key}>{groupLabel(key)}</option>)}
      </select>
     </label>
     <label>Waktu per soal
      <div className="admin-bank-edit-duration">{edit.time_limit_seconds} detik <Clock3 size={15}/></div>
     </label>
    </div>
    <p className="admin-bank-edit-note">Durasi otomatis mengikuti kelompok ujian. Perubahan diperiksa agar kuota ujian wajib dan latihan tetap aman.</p>
    {editIssue&&<div role="alert" className="alert danger">{editIssue}</div>}
    <label>Pertanyaan<textarea rows={3} value={edit.question} onChange={e=>setEdit({...edit,question:e.target.value})}/></label>
    {edit.question_image_path&&<p className="admin-bank-edit-note">Gambar soal yang sudah tersimpan tetap dipertahankan.</p>}
    <fieldset><legend>Pilihan dan kunci jawaban</legend>{edit.options.map((o,i)=><div className="admin-bank-edit-option" key={i}><label className="admin-bank-edit-radio"><input type="radio" name="correct-bank-option" checked={edit.correct_index===i} onChange={()=>setEdit({...edit,correct_index:i})}/>{String.fromCharCode(65+i)}</label><input aria-label={'Jawaban '+String.fromCharCode(65+i)} value={o.text} onChange={e=>setEdit({...edit,options:edit.options.map((item,j)=>j===i?{...item,text:e.target.value}:item)})}/>{o.image_path&&<small>Gambar tersimpan</small>}</div>)}</fieldset>
    <label>Pembahasan<textarea rows={2} value={edit.explanation} onChange={e=>setEdit({...edit,explanation:e.target.value})}/></label>
    <div className="admin-bank-edit-actions"><button type="button" className="btn secondary small" disabled={editBusy} onClick={()=>{setEdit(null);setOriginal(null);}}>Batal</button><button type="button" className="btn primary small" disabled={editBusy} onClick={()=>void saveEdit()}>{editBusy?'Menyimpan...':'Simpan perubahan'}</button></div>
   </section></div>}
   {selected&&<div role="presentation" className="admin-modal-overlay" onMouseDown={()=>setSelected(null)}><section role="dialog" aria-modal="true" aria-label="Detail soal" className="admin-modal-card admin-bank-modal" onMouseDown={e=>e.stopPropagation()}>
     <div className="admin-modal-top"><span className="admin-modal-avatar"><BookOpen size={25}/></span><button type="button" aria-label="Tutup detail" onClick={()=>setSelected(null)}>×</button></div>
     <span className="section-kicker">SOAL #{selected.id} · {selected.category} · {groupLabel(selected.difficultyCode)}</span><h2>{selected.question}</h2>
     {selected.questionImageUrl&&<img src={selected.questionImageUrl} alt={'Gambar pendukung soal '+selected.id} style={{maxWidth:'100%',maxHeight:380,objectFit:'contain'}}/>}
     <p>Waktu {selected.timeLimitSeconds} detik per soal</p>
     <div className="admin-bank-options">{selected.options.map((option,i)=><div key={i}><b>{String.fromCharCode(65+i)}</b><span>{option}{selected.optionImageUrls?.[i]&&<img src={selected.optionImageUrls[i]!} alt={'Gambar pilihan '+String.fromCharCode(65+i)} style={{display:'block',maxWidth:'100%',maxHeight:220,objectFit:'contain',marginTop:8}}/>}</span></div>)}</div>
     <button type="button" className="btn primary" onClick={()=>setSelected(null)}>Tutup detail</button>
   </section></div>}
  </div>
 </AppShell>;
}