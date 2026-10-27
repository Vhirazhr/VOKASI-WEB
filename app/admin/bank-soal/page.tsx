'use client';

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {BookOpen,Clock3,FileQuestion,Plus,Search,FileUp,PenLine} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {fetchBank} from '@/lib/quiz';
import {supabase} from '@/lib/supabase';
import type {BankQuestion} from '@/lib/types';
import '@/app/admin-workspace.css';
import '@/app/admin-students-ui.css';
import '@/app/admin-bank-ui.css';

type EditRow={source_number:number;category:string;difficulty_code:string;question:string;question_image_path:string|null;options:{text:string;image_path:string|null}[];correct_index:number;time_limit_seconds:number;explanation:string};
export default function AdminBankPage(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [bank,setBank]=useState<BankQuestion[]>([]),[busy,setBusy]=useState(true),[issue,setIssue]=useState('');
 const [edit,setEdit]=useState<EditRow|null>(null),[original,setOriginal]=useState<EditRow|null>(null);
 const [editBusy,setEditBusy]=useState(false),[editIssue,setEditIssue]=useState(''),[refreshKey,setRefreshKey]=useState(0);
 async function startEdit(id:number){
  setEditBusy(true);setEditIssue('');
  const {data,error:err}=await supabase().rpc('vokasi_admin_get_edit_question',{p_source_number:id});
  if(err||!data){setIssue(err?.message||'Soal tidak ditemukan.');setEditBusy(false);return;}
  const row=data as EditRow;
  setOriginal(row);setEdit(structuredClone(row));setEditBusy(false);
 }
 async function saveEdit(){
  if(!edit||!original)return;
  if(!edit.question.trim()&&!edit.question_image_path){setEditIssue('Isi pertanyaan atau gambar soal.');return;}
  if(edit.options.some(o=>!o.text.trim()&&!o.image_path)){setEditIssue('Setiap pilihan harus berisi teks atau gambar.');return;}
  if(edit.correct_index<0||edit.correct_index>=edit.options.length){setEditIssue('Pilih kunci yang valid.');return;}
  setEditBusy(true);setEditIssue('');
  const {error:err}=await supabase().rpc('vokasi_admin_edit_published_question',{
   p_source_number:edit.source_number,p_expected:original,
   p_change:{question:edit.question,question_image_path:edit.question_image_path,
    options:edit.options,correct_index:edit.correct_index,explanation:edit.explanation}
  });
  if(err){setEditIssue(err.message);setEditBusy(false);return;}
  setEdit(null);setOriginal(null);setSelected(null);setBusy(true);setRefreshKey(v=>v+1);setEditBusy(false);
 }
 const [search,setSearch]=useState(''),[category,setCategory]=useState(''),[code,setCode]=useState(''),[page,setPage]=useState(0),[selected,setSelected]=useState<BankQuestion|null>(null);
 useEffect(()=>{if(loading||error)return;let active=true;
  async function load(){try{const data=await fetchBank();if(active){setBank(data);setIssue('');setBusy(false);}}catch(e){if(active){setIssue(e instanceof Error?e.message:'Bank soal tidak dapat dimuat.');setBusy(false);}}}
  queueMicrotask(()=>void load());return()=>{active=false};
 },[loading,error,refreshKey]);
 const categories=useMemo(()=>[...new Set(bank.map(b=>b.category))].sort((a,b)=>a.localeCompare(b,'id')),[bank]);
 const codes=useMemo(()=>[...new Set(bank.filter(b=>!category||b.category===category).map(b=>b.difficultyCode))].sort(),[bank,category]);
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
    <div className="admin-data-title"><div><h2>Daftar pertanyaan</h2><p>Filter materi, kode kesulitan, atau cari pertanyaan.</p></div><div className="admin-bank-actions"><Link href="/admin/bank-soal/impor" className="btn secondary small"><FileUp size={16}/> Impor soal</Link><Link href="/admin/bank-soal/buat" className="btn primary small"><Plus size={17}/> Tambah soal</Link></div></div>
    {issue&&<div className="alert danger" role="alert">{issue}</div>}
    <div className="admin-directory-controls admin-directory-controls-simple">
     <label className="admin-directory-search"><Search size={17}/><input value={search} aria-label="Cari soal" placeholder="Cari ID atau teks soal..." onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
     <label>Kategori<select value={category} onChange={e=>{setCategory(e.target.value);setCode('');setPage(0);}}><option value="">Semua materi</option>{categories.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
     <label>Kode<select value={code} onChange={e=>{setCode(e.target.value);setPage(0);}}><option value="">Semua kode</option>{codes.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
    </div>
    {busy?<div className="admin-workspace-empty">Mengambil bank soal aktif...</div>:filtered.length===0?<div className="admin-workspace-empty">Tidak ada soal yang sesuai.</div>:
     <div className="admin-workspace-table-wrap">
      <table className="admin-bank-table">
       <colgroup><col className="bank-width-id"/><col className="bank-width-category"/><col className="bank-width-code"/><col className="bank-width-question"/><col className="bank-width-time"/><col className="bank-width-actions"/></colgroup>
       <thead><tr><th scope="col">ID</th><th scope="col">Kategori</th><th scope="col">Kode</th><th scope="col">Soal</th><th scope="col">Waktu</th><th scope="col">Aksi</th></tr></thead>
       <tbody>{filtered.slice(activePage*30,(activePage+1)*30).map(q=><tr key={q.id}>
        <td className="bank-cell-id"><b>#{q.id}</b></td>
        <td><span className="admin-bank-category">{q.category}</span></td>
        <td><span className="admin-bank-code">{q.difficultyCode}</span></td>
        <td><span className="admin-bank-question" title={q.question||'Soal bergambar'}>{q.question||'Soal bergambar'}</span></td>
        <td className="bank-cell-time">{q.timeLimitSeconds} detik</td>
        <td><div className="admin-bank-row-actions">
         <button type="button" className="admin-workspace-detail" onClick={()=>setSelected(q)}>Detail</button>
         <button type="button" className="admin-bank-edit-button" disabled={editBusy} onClick={()=>void startEdit(q.id)}><PenLine size={13}/> Edit</button>
        </div></td>
       </tr>)}</tbody>
      </table>
     </div>
    <div className="admin-workspace-footer"><span>{filtered.length} soal sesuai filter</span><div><button type="button" onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={activePage===0}>Sebelumnya</button><span>{activePage+1} / {pages}</span><button type="button" onClick={()=>setPage(p=>p+1)} disabled={activePage>=pages-1}>Berikutnya</button></div></div>
   </section>
   
   {edit&&<div className="admin-modal-overlay" role="presentation" onMouseDown={()=>{if(!editBusy){setEdit(null);setOriginal(null);}}}><section className="admin-modal-card admin-bank-edit-modal" role="dialog" aria-modal="true" aria-label={'Edit soal '+edit.source_number} onMouseDown={e=>e.stopPropagation()}>
    <div className="admin-modal-top"><div><span className="section-kicker">EDIT SOAL #{edit.source_number}</span><h2>Sunting pertanyaan</h2></div><button type="button" aria-label="Tutup editor" disabled={editBusy} onClick={()=>{setEdit(null);setOriginal(null);}}>×</button></div>
    <p className="admin-bank-edit-note">{edit.category} · {edit.difficulty_code} · {edit.time_limit_seconds} detik. Kategori dan waktu tetap untuk menjaga blueprint ujian.</p>
    {editIssue&&<div role="alert" className="alert danger">{editIssue}</div>}
    <label>Pertanyaan<textarea rows={3} value={edit.question} onChange={e=>setEdit({...edit,question:e.target.value})}/></label>
    {edit.question_image_path&&<p className="admin-bank-edit-note">Gambar soal yang sudah tersimpan tetap dipertahankan.</p>}
    <fieldset><legend>Pilihan dan kunci jawaban</legend>{edit.options.map((o,i)=><div className="admin-bank-edit-option" key={i}><label className="admin-bank-edit-radio"><input type="radio" name="correct-bank-option" checked={edit.correct_index===i} onChange={()=>setEdit({...edit,correct_index:i})}/>{String.fromCharCode(65+i)}</label><input aria-label={'Jawaban '+String.fromCharCode(65+i)} value={o.text} onChange={e=>setEdit({...edit,options:edit.options.map((item,j)=>j===i?{...item,text:e.target.value}:item)})}/>{o.image_path&&<small>Gambar tersimpan</small>}</div>)}</fieldset>
    <label>Pembahasan<textarea rows={2} value={edit.explanation} onChange={e=>setEdit({...edit,explanation:e.target.value})}/></label>
    <div className="admin-bank-edit-actions"><button type="button" className="btn secondary small" disabled={editBusy} onClick={()=>{setEdit(null);setOriginal(null);}}>Batal</button><button type="button" className="btn primary small" disabled={editBusy} onClick={()=>void saveEdit()}>{editBusy?'Menyimpan...':'Simpan perubahan'}</button></div>
   </section></div>}
   {selected&&<div role="presentation" className="admin-modal-overlay" onMouseDown={()=>setSelected(null)}><section role="dialog" aria-modal="true" aria-label="Detail soal" className="admin-modal-card admin-bank-modal" onMouseDown={e=>e.stopPropagation()}>
     <div className="admin-modal-top"><span className="admin-modal-avatar"><BookOpen size={25}/></span><button type="button" aria-label="Tutup detail" onClick={()=>setSelected(null)}>×</button></div>
     <span className="section-kicker">SOAL #{selected.id} · {selected.category} · {selected.difficultyCode}</span><h2>{selected.question}</h2>
     {selected.questionImageUrl&&<img src={selected.questionImageUrl} alt={'Gambar pendukung soal '+selected.id} style={{maxWidth:'100%',maxHeight:380,objectFit:'contain'}}/>}
     <p>Waktu {selected.timeLimitSeconds} detik per soal</p>
     <div className="admin-bank-options">{selected.options.map((option,i)=><div key={i}><b>{String.fromCharCode(65+i)}</b><span>{option}{selected.optionImageUrls?.[i]&&<img src={selected.optionImageUrls[i]!} alt={'Gambar pilihan '+String.fromCharCode(65+i)} style={{display:'block',maxWidth:'100%',maxHeight:220,objectFit:'contain',marginTop:8}}/>}</span></div>)}</div>
     <button type="button" className="btn primary" onClick={()=>setSelected(null)}>Tutup detail</button>
   </section></div>}
  </div>
 </AppShell>;
}