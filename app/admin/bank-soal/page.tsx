'use client';

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {BookOpen,Clock3,FileQuestion,ImagePlus,Search,ShieldCheck} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {fetchBank} from '@/lib/quiz';
import type {BankQuestion} from '@/lib/types';
import '@/app/admin-workspace.css';

export default function AdminBankPage(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [bank,setBank]=useState<BankQuestion[]>([]),[busy,setBusy]=useState(true),[issue,setIssue]=useState('');
 const [search,setSearch]=useState(''),[category,setCategory]=useState(''),[code,setCode]=useState(''),[page,setPage]=useState(0),[selected,setSelected]=useState<BankQuestion|null>(null);
 useEffect(()=>{if(loading||error)return;let active=true;
  async function load(){try{const data=await fetchBank();if(active){setBank(data);setIssue('');setBusy(false);}}catch(e){if(active){setIssue(e instanceof Error?e.message:'Bank soal tidak dapat dimuat.');setBusy(false);}}}
  queueMicrotask(()=>void load());return()=>{active=false};
 },[loading,error]);
 const categories=useMemo(()=>[...new Set(bank.map(b=>b.category))].sort((a,b)=>a.localeCompare(b,'id')),[bank]);
 const codes=useMemo(()=>[...new Set(bank.filter(b=>!category||b.category===category).map(b=>b.difficultyCode))].sort(),[bank,category]);
 const filtered=useMemo(()=>bank.filter(b=>(!category||b.category===category)&&(!code||b.difficultyCode===code)&&(!search||[String(b.id),b.question,b.category,b.difficultyCode].some(x=>x.toLowerCase().includes(search.trim().toLowerCase())))),[bank,category,code,search]);
 const pages=Math.max(1,Math.ceil(filtered.length/30)),activePage=Math.min(page,pages-1);
 if(loading)return <main className="page-loader">Memverifikasi hak akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
  <div className="admin-workspace">
   <header className="admin-workspace-header"><div><span className="section-kicker">KONTEN LATIHAN</span><h1>Bank Soal</h1><p>Impor 500 soal baru bergambar sebagai draft, perbaiki butir bermasalah, lalu aktifkan untuk siswa web.</p></div><div className="panel-actions"><Link href="/admin/bank-soal/aktifkan" className="btn secondary small"><ShieldCheck size={17}/> Aktifkan bank baru</Link><Link href="/admin/bank-soal/impor" className="btn secondary small"><ImagePlus size={17}/> Impor 500 soal</Link><Link href="/admin/bank-soal/buat" className="btn primary small"><ImagePlus size={17}/> Tambah soal bergambar</Link></div></header>
   <div className="admin-mini-stats"><div><BookOpen size={20}/><span>Jumlah soal</span><strong>{busy?'—':bank.length}</strong></div><div><FileQuestion size={20}/><span>Kategori</span><strong>{busy?'—':categories.length}</strong></div><div><Clock3 size={20}/><span>Blueprint wajib</span><strong>100 soal</strong></div></div>
   <section className="admin-data-card">
    <div className="admin-data-title"><div><h2>Daftar pertanyaan</h2><p>Filter materi, kode kesulitan, atau cari pertanyaan.</p></div><span className="admin-workspace-pill">Bank soal resmi web</span></div>
    {issue&&<div className="alert danger" role="alert">{issue}</div>}
    <div className="admin-directory-controls admin-directory-controls-simple">
     <label className="admin-directory-search"><Search size={17}/><input value={search} aria-label="Cari soal" placeholder="Cari ID atau teks soal..." onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
     <label>Kategori<select value={category} onChange={e=>{setCategory(e.target.value);setCode('');setPage(0);}}><option value="">Semua materi</option>{categories.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
     <label>Kode<select value={code} onChange={e=>{setCode(e.target.value);setPage(0);}}><option value="">Semua kode</option>{codes.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
    </div>
    {busy?<div className="admin-workspace-empty">Memeriksa bank 500 soal...</div>:filtered.length===0?<div className="admin-workspace-empty">Tidak ada soal yang sesuai.</div>:
     <div className="admin-workspace-table-wrap"><table><thead><tr><th>ID</th><th>Kategori</th><th>Kode</th><th>Soal</th><th>Waktu</th><th>Detail</th></tr></thead><tbody>{filtered.slice(activePage*30,(activePage+1)*30).map(q=><tr key={q.id}><td><b>#{q.id}</b></td><td>{q.category}</td><td>{q.difficultyCode}</td><td>{q.question}</td><td>{q.timeLimitSeconds} detik</td><td><button type="button" className="admin-workspace-detail" onClick={()=>setSelected(q)}>Lihat</button></td></tr>)}</tbody></table></div>}
    <div className="admin-workspace-footer"><span>{filtered.length} soal sesuai filter</span><div><button type="button" onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={activePage===0}>Sebelumnya</button><span>{activePage+1} / {pages}</span><button type="button" onClick={()=>setPage(p=>p+1)} disabled={activePage>=pages-1}>Berikutnya</button></div></div>
   </section>
   <div className="admin-workspace-footnote">Soal lama sudah dihapus dari repo web. Bank aktif dimuat hanya dari snapshot 500 soal bergambar yang telah diterbitkan admin di Supabase. Riwayat nilai lama tetap tersimpan.</div>
   {selected&&<div role="presentation" className="admin-modal-overlay" onMouseDown={()=>setSelected(null)}><section role="dialog" aria-modal="true" aria-label="Detail soal" className="admin-modal-card admin-bank-modal" onMouseDown={e=>e.stopPropagation()}>
     <div className="admin-modal-top"><span className="admin-modal-avatar"><BookOpen size={25}/></span><button type="button" aria-label="Tutup detail" onClick={()=>setSelected(null)}>×</button></div>
     <span className="section-kicker">SOAL #{selected.id} · {selected.category} · {selected.difficultyCode}</span><h2>{selected.question}</h2><p>Waktu {selected.timeLimitSeconds} detik per soal</p>
     <div className="admin-bank-options">{selected.options.map((option,i)=><div key={i}><b>{String.fromCharCode(65+i)}</b><span>{option}</span></div>)}</div>
     <button type="button" className="btn primary" onClick={()=>setSelected(null)}>Tutup detail</button>
   </section></div>}
  </div>
 </AppShell>;
}