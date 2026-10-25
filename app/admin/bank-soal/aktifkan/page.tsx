'use client';
import Link from 'next/link';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowLeft,CheckCircle2,RefreshCw,ShieldCheck,UploadCloud,XCircle} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {supabase} from '@/lib/supabase';
import {APPROVED_BLUEPRINT,APPROVED_GROUPS,inspectApprovedBank,type BlueprintInspection,type TimedDraft} from '@/lib/new-bank-blueprint';
import '@/app/admin-visual-questions.css';

type DraftRow={
 source_number:number|null;category:string;difficulty_code:string|null;time_limit_seconds:number;
 question:string;question_image_path:string|null;
 options:{text:string;image_path:string|null}[];correct_index:number;
};
type BankRelease={active:boolean;version:string;published_at:string|null};
export default function PublishQuestionBank(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [busy,setBusy]=useState(true),[saving,setSaving]=useState(false);
 const [problem,setProblem]=useState(''),[message,setMessage]=useState('');
 const [release,setRelease]=useState<BankRelease|null>(null);
 const [report,setReport]=useState<BlueprintInspection|null>(null);
 const refresh=useCallback(async()=>{
   setBusy(true);setProblem('');
   try{
     const [drafts,metadata]=await Promise.all([
       supabase().from('vokasi_question_drafts')
        .select('source_number,category,difficulty_code,question,question_image_path,options,correct_index,time_limit_seconds')
        .gte('source_number',1).lte('source_number',500).order('source_number',{ascending:true}).limit(1000),
       supabase().from('vokasi_web_bank_release')
        .select('active,version,published_at').eq('id',1).maybeSingle()
     ]);
     if(drafts.error)throw new Error('Draft belum dapat dibaca: '+drafts.error.message);
     if(metadata.error)throw new Error('Migrasi aktivasi belum dijalankan: '+metadata.error.message);
     const source=(drafts.data||[]) as DraftRow[];
     const inspection=inspectApprovedBank(source.map((q):TimedDraft=>({
       source_number:q.source_number||0,
       blueprint_group:q.difficulty_code||'',time_limit_seconds:q.time_limit_seconds,
       correct_index:q.correct_index,question:q.question,
       question_image_files:q.question_image_path?[q.question_image_path]:[],
       options:(q.options||[]).map(o=>({text:o.text||'',image_file:o.image_path||null}))
     })));
     setReport(inspection);setRelease((metadata.data||null) as BankRelease|null);
   }catch(e){setProblem(e instanceof Error?e.message:'Gagal mengambil status database.');}
   finally{setBusy(false);}
 },[]);
 useEffect(()=>{if(!loading&&!error)queueMicrotask(()=>void refresh());},[loading,error,refresh]);
 const canPublish=useMemo(()=>!!report&&report.count===500&&report.errors.length===0&&report.warnings.length===0,[report]);
 async function publish(){
   if(!canPublish||saving)return;
   if(!window.confirm('Aktifkan 500 soal BARU untuk seluruh siswa VOKASI-WEB? Soal lama tidak akan dipulihkan.'))return;
   setSaving(true);setMessage('');
   const {data,error:failure}=await supabase().rpc('vokasi_web_publish_new_bank');
   if(failure)setMessage('AKTIVASI DITOLAK: '+failure.message);
   else{setMessage('Berhasil! Bank versi '+String(data)+' aktif untuk siswa di VOKASI-WEB.');await refresh();}
   setSaving(false);
 }
 async function pause(){
   if(saving)return;
   if(!window.confirm('Tutup latihan sementara untuk seluruh siswa web? Nilai yang sudah ada tetap aman.'))return;
   setSaving(true);setMessage('');
   const {error:failure}=await supabase().rpc('vokasi_web_pause_bank');
   if(failure)setMessage('Tidak dapat menutup latihan: '+failure.message);
   else{setMessage('Latihan baru berhasil dijeda.');await refresh();}
   setSaving(false);
 }
 if(loading)return <main className="page-loader">Memeriksa akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
  <main className="vqe">
   <Link href="/admin/bank-soal" className="vqe-back"><ArrowLeft size={16}/> Kembali ke Bank Soal</Link>
   <div className="vqe-heading"><div>
     <span className="section-kicker">PENERBITAN SOAL WEB</span><h1>Aktifkan 500 soal baru</h1>
     <p>Periksa seluruh draft, kuota, gambar, dan timer. Setelah dipublikasikan, siswa web memakai salinan bank baru dari Supabase.</p>
   </div><span className="admin-workspace-pill"><ShieldCheck size={15}/> Khusus admin</span></div>
   <div className="vqe-alert" role="alert"><b>Gambar soal matriks 479–484 perlu diganti.</b> File gambar dari dokumen Word hanya berisi bagian atas pola. Latihan telah dijeda untuk menghindari penilaian dari soal yang tidak lengkap. Buka <Link href="/admin/bank-soal/buat">Editor soal</Link>, cari setiap nomor 479 hingga 484, lalu unggah gambar utuh dan terbitkan ulang. Nilai lama tidak dihapus.</div>
   <div className="vqe-note">
     Pengaktifan ini <b>hanya untuk VOKASI-WEB</b>, tidak mengubah Android atau nilai siswa. Data aktif merupakan salinan tetap dari draft saat tombol Aktifkan ditekan.
   </div>
   {problem&&<div className="vqe-alert" role="alert"><XCircle size={16}/> {problem}
      <p>Jalankan kedua file migrasi SQL pada project Supabase sekolah: <code>202610250001_vokasi_visual_question_drafts.sql</code> dan <code>202610260001_vokasi_web_publish_new_bank.sql</code>.</p></div>}
   {message&&<div role="status" className="vqe-alert">{message}</div>}
   <section className="vqe-card">
     <div className="vqe-row-heading"><h2>Status bank di website</h2>
       <button className="btn secondary small" disabled={busy||saving} onClick={()=>void refresh()}><RefreshCw size={16}/> Perbarui</button></div>
     <div className={'vqe-publication-state '+(release?.active?'is-active':'')}>
       {release?.active?<CheckCircle2 size={25}/>:<UploadCloud size={25}/>}
       <div><strong>{release?.active?'Bank baru SUDAH AKTIF':'Bank baru BELUM AKTIF'}</strong>
        <p>{release?.active?'Siswa dapat memulai latihan web.':'Siswa masih melihat tombol latihan dinonaktifkan.'}</p>
        {release?.published_at&&<small>Terakhir diterbitkan: {new Date(release.published_at).toLocaleString('id-ID')}</small>}
       </div>
     </div>
     {busy?<p>Memeriksa draft ...</p>:report&&<>
       <div className="vqe-import-stats">
         <div><strong>{report.count}</strong><span>Draft terbaca</span></div>
         <div><strong>{report.images}</strong><span>Referensi gambar</span></div>
         <div><strong>{report.sessionSeconds/60} menit</strong><span>100 soal wajib</span></div>
       </div>
       <div className="vqe-blueprint-scroll"><table className="vqe-publish-table"><thead><tr><th>Kelompok</th><th>Stok</th><th>Kuota</th><th>Detik/soal</th></tr></thead>
        <tbody>{APPROVED_GROUPS.map(group=>{
          const rule=APPROVED_BLUEPRINT.groups[group];
          return <tr key={group}><td>{rule.label}</td><td>{report.available[group]}</td><td>{rule.quota}</td><td>{rule.seconds}</td></tr>;
        })}</tbody></table></div>
       {(report.errors.length>0||report.warnings.length>0)&&<div className="vqe-alert" role="alert">
        <b>Perbaiki dulu sebelum aktivasi:</b>
        {[...report.errors,...report.warnings].slice(0,25).map((v,i)=><p key={i}>{v}</p>)}
        <p>Jika ada opsi duplikat, buka <Link href="/admin/bank-soal/buat">Editor soal</Link> dan perbaiki (terutama nomor 339).</p>
       </div>}
       {!report.errors.length&&!report.warnings.length&&<div className="vqe-note">
         Pemeriksaan struktur dan kuota berhasil. Tetap tinjau kebenaran isi, kunci, serta gambar secara manual sebelum ujian resmi.
       </div>}
     </>}
     <div className="vqe-actions"><Link className="btn secondary" href="/admin/bank-soal/impor">Impor ZIP 500 soal</Link>
       {release?.active&&<button type="button" className="btn secondary" disabled={saving} onClick={()=>void pause()}>Jeda latihan</button>}
       <button type="button" className="btn primary" disabled={!canPublish||saving||busy} onClick={()=>void publish()}>
         <CheckCircle2 size={17}/>{saving?'Memproses...':release?.active?'Terbitkan ulang hasil revisi':'Aktifkan bank baru'}
       </button></div>
   </section>
   <p className="vqe-note">Pengamanan: migrasi Supabase juga mengulangi validasi 500 nomor, tujuh kelompok, kunci, pilihan duplikat, timer, dan file gambar di Storage. Jika ada yang salah, transaksi dibatalkan tanpa memengaruhi bank yang sudah aktif.</p>
  </main>
 </AppShell>;
}
