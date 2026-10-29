'use client';

import Link from 'next/link';
import {useState} from 'react';
import {ArrowLeft,Archive,CheckCircle2,FileUp,RefreshCw,ShieldCheck} from 'lucide-react';
import JSZip from 'jszip';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {currentUser} from '@/lib/auth';
import {deleteStorageFiles,uploadStorageFile} from '@/lib/storage-client';
import {getZipDrafts,insertQuestionDraftBatch,updateDraftTimers} from '@/lib/admin-question-data';
import {APPROVED_BLUEPRINT,APPROVED_GROUPS,inspectApprovedBank,type BlueprintInspection} from '@/lib/new-bank-blueprint';
import '@/app/admin-visual-questions.css';

const BUCKET='vokasi-question-figures';
type IncomingChoice={text:string;image_file:string|null};
type Incoming={
 source_number:number;category:string;question:string;question_image_files:string[];blueprint_group:string;review_notes?:string[];
 options:IncomingChoice[];correct_index:number|null;time_limit_seconds:number;explanation:string;
};
type Bundle={zip:JSZip;questions:Incoming[];images:number;inspection:BlueprintInspection};
const textError=(e:unknown)=>e instanceof Error?e.message:String(e);
const safePath=(s:string)=>/^gambar\/[A-Za-z0-9_.-]+\.(png|jpe?g|webp)$/i.test(s);
function validate(raw:unknown,zip:JSZip):Incoming[]{
 if(!Array.isArray(raw)||raw.length<1||raw.length>1000)throw new Error('Paket JSON harus berisi 1–1000 soal.');
 const seen=new Set<number>();
 return raw.map((item:unknown,index:number)=>{
   if(!item||typeof item!=='object')throw new Error('Format soal ke-'+(index+1)+' tidak valid.');
   const q=item as Incoming;
   if(!Number.isInteger(q.source_number)||q.source_number<1||q.source_number>100000||seen.has(q.source_number))
     throw new Error('Nomor soal kosong/duplikat: posisi '+(index+1));
   seen.add(q.source_number);
   if(typeof q.category!=='string'||!q.category.trim()||typeof q.question!=='string')throw new Error('Kategori atau teks soal tidak valid: '+q.source_number);
   if(!Array.isArray(q.question_image_files)||q.question_image_files.length>5)
     throw new Error('Data gambar soal tidak valid: '+q.source_number);
   if(!Array.isArray(q.options)||q.options.length<2||q.options.length>6)
     throw new Error('Pilihan jawaban harus 2–6: soal '+q.source_number);
   if(!Number.isInteger(q.correct_index)||q.correct_index===null||q.correct_index<0||q.correct_index>=q.options.length)
     throw new Error('Kunci jawaban tidak tersedia: soal '+q.source_number);
   if(!q.question.trim()&&!q.question_image_files.length)throw new Error('Soal kosong: nomor '+q.source_number);
   const picturePaths=[...q.question_image_files];
   for(const c of q.options){
     if(!c||typeof c.text!=='string'||(c.image_file!==null&&typeof c.image_file!=='string')||(!c.text.trim()&&!c.image_file))
       throw new Error('Pilihan kosong: nomor '+q.source_number);
     if(c.image_file)picturePaths.push(c.image_file);
   }
   for(const path of picturePaths)if(!safePath(path)||!zip.file(path))throw new Error('Gambar tidak ditemukan atau path tidak aman: '+path);
   return q;
 });
}
export default function ImportQuestionBundle(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [bundle,setBundle]=useState<Bundle|null>(null);
 const [reading,setReading]=useState(false),[saving,setSaving]=useState(false);
 const [notice,setNotice]=useState(''),[progress,setProgress]=useState({done:0,total:0});
 async function inspect(file:File|undefined){
   if(!file)return;
   setReading(true);setNotice('');setBundle(null);setProgress({done:0,total:0});
   try{
     if(!file.name.toLowerCase().endsWith('.zip')||file.size>25*1024*1024)throw new Error('Gunakan berkas ZIP maksimal 25 MB.');
     const zip=await JSZip.loadAsync(file);
     const entry=zip.file('soal_baru_500_DRAFT.json');
     if(!entry)throw new Error('Paket ZIP harus mempunyai soal_baru_500_DRAFT.json.');
     const parsed:unknown=JSON.parse(await entry.async('string'));
     const questions=validate(parsed,zip);
     const inspection=inspectApprovedBank(questions);
     if(inspection.errors.length)throw new Error('Blueprint 100 soal / 30 menit tidak sesuai: '+inspection.errors.slice(0,5).join(' • '));
     const images=questions.reduce((n,q)=>n+q.question_image_files.length+q.options.filter(x=>!!x.image_file).length,0);
     setBundle({zip,questions,images,inspection});
     setNotice('Paket tervalidasi: '+inspection.sessionQuestions+' soal per sesi, '+inspection.sessionSeconds+' detik (30 menit).'+
       (inspection.warnings.length?' Ada '+inspection.warnings.length+' soal yang wajib dikoreksi sebelum aktivasi.':' Semua opsi dan timer lolos pemeriksaan struktur.'));
   }catch(e){setNotice('Paket tidak dapat dibaca: '+textError(e));}
   finally{setReading(false);}
 }
 async function uploadImage(zip:JSZip,path:string,owner:string,batchId:string){
   const entry=zip.file(path);
   if(!entry)throw new Error('Gambar hilang: '+path);
   const data=await entry.async('uint8array');
   if(data.length>3*1024*1024)throw new Error('Gambar lebih dari 3 MB: '+path);
   const mime=/\.png$/i.test(path)?'image/png':/\.webp$/i.test(path)?'image/webp':'image/jpeg';
   const location=owner+'/'+batchId+'/'+crypto.randomUUID()+'.'+(mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg');
   const file=new File([data as BlobPart],location.split('/').pop()||'question-image',{type:mime});
   await uploadStorageFile(BUCKET,location,file);
   return location;
 }
 async function importDrafts(){
   if(!bundle||saving)return;
   setSaving(true);setNotice('');
   let done=0;
   try{
     const user=await currentUser();
     if(!user||(user.role!=='admin'&&user.role!=='super_admin'))throw new Error('Harus login sebagai admin.');
     const existing=await getZipDrafts();
     const oldRows=new Map(existing.map(d=>[Number(d.source_number),d]));
     const conflicts=bundle.questions.filter(q=>{
       const old=oldRows.get(q.source_number);
       return old&&old.question.trim()!==q.question.trim();
     });
     if(conflicts.length)throw new Error('Terdapat '+conflicts.length+' nomor draft yang sudah digunakan untuk teks berbeda (contoh no. '+conflicts[0].source_number+'). Tinjau manual untuk mencegah data tertimpa.');
     const pending=bundle.questions.filter(q=>!oldRows.has(q.source_number));
     const toRetiming=bundle.questions.filter(q=>{
       const old=oldRows.get(q.source_number);
       return old&&(old.time_limit_seconds!==q.time_limit_seconds||old.difficulty_code!==q.blueprint_group);
     });
     setProgress({done:0,total:pending.length});
     let retimed=0;
     // Existing draft from the older package may have received 20 seconds by default.
     // Correct ONLY its timer and approved group. Never overwrite its image, options or key.
     for(const group of APPROVED_GROUPS){
       const numbers=toRetiming.filter(q=>q.blueprint_group===group).map(q=>q.source_number);
       if(!numbers.length)continue;
       await updateDraftTimers(group,numbers,APPROVED_BLUEPRINT.groups[group].seconds);
       retimed+=numbers.length;
     }
     if(!pending.length){setNotice('Semua nomor sudah ada: '+retimed+' draft diperbarui timer dan kelompoknya saja. Tidak ada soal yang ditimpa.');return;}
     const importId=crypto.randomUUID();
     for(let i=0;i<pending.length;i+=25){
       const batch=pending.slice(i,i+25);
       const uploaded:string[]=[];
       try{
         const rows=[];
         for(const q of batch){
           const images=[];
           for(const img of q.question_image_files){
             const path=await uploadImage(bundle.zip,img,user.id,importId);
             uploaded.push(path);images.push(path);
           }
           const choices=[];
           for(const o of q.options){
             let path:string|null=null;
             if(o.image_file){path=await uploadImage(bundle.zip,o.image_file,user.id,importId);uploaded.push(path);}
             choices.push({text:o.text.trim(),image_path:path});
           }
           rows.push({
             source_number:q.source_number,category:q.category.trim(),question:q.question.trim(),
             // Every source figure stays accessible in Storage. Question UI currently displays the first.
             question_image_path:images[0]||null,options:choices,
             difficulty_code:q.blueprint_group,correct_index:q.correct_index,time_limit_seconds:q.time_limit_seconds,
             explanation:q.explanation||'',created_by:user.id
           });
         }
         await insertQuestionDraftBatch(rows);
         done+=batch.length;setProgress({done,total:pending.length});
       }catch(e){
         if(uploaded.length)await deleteStorageFiles(BUCKET,uploaded).catch(()=>undefined);
         throw new Error('Batch soal '+batch[0].source_number+'–'+batch[batch.length-1].source_number+' gagal: '+textError(e));
       }
     }
     setNotice('Selesai: '+done+' draft baru tersimpan, '+retimed+' draft lama disinkronkan timernya. '+(bundle.questions.length-pending.length)+' nomor sudah ada. Konten dan kunci lama tidak ditimpa; soal belum dipublikasikan.');
   }catch(e){
     setNotice('Impor berhenti: '+textError(e)+'. '+done+' soal sebelumnya sudah tersimpan. Jalankan ulang paket untuk melanjutkan; nomor yang sudah ada dilewati.');
   }finally{setSaving(false);}
 }
 if(loading)return <main className="page-loader">Memeriksa akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
  <main className="vqe">
   <Link href="/admin/bank-soal" className="vqe-back"><ArrowLeft size={17}/> Kembali ke bank soal</Link>
   <div className="vqe-heading"><div><span className="section-kicker">IMPOR SOAL BARU</span><h1>Impor paket soal Word</h1>
    <p>Impor paket ZIP hasil ekstraksi Word: nomor, teks, gambar, pilihan A–C, dan kunci jawaban. Seluruhnya menjadi draft admin.</p></div>
    <span className="admin-workspace-pill"><ShieldCheck size={14}/> Khusus admin</span>
   </div>
   <div className="vqe-note"><b>Penting:</b> jangan unggah DOCX mentah ke sini. Gunakan paket ZIP berisi <code>soal_baru_500_DRAFT.json</code> dan folder gambar. Semua impor disimpan sebagai draft. Waktu soal sudah ditentukan dalam 7 kelompok (5–40 detik). Total sesi wajib tetap 100 soal / 30 menit. Paket lama tanpa timer final akan ditolak.</div>
   <section className="vqe-card vqe-import">
     <h2>Pilih paket ZIP</h2><label className="vqe-upload"><FileUp size={20}/><span>Unggah file paket ZIP (maks. 25 MB)</span>
       <input type="file" accept=".zip,application/zip" disabled={saving||reading} onChange={e=>{void inspect(e.target.files?.[0]);e.target.value='';}}/>
     </label>
     {reading&&<p className="vqe-import-wait"><RefreshCw size={16}/> Membaca dan memeriksa isi paket...</p>}
     {bundle&&<div className="vqe-import-stats">
       <div><Archive size={18}/><strong>{bundle.questions.length}</strong><span>Soal terbaca</span></div>
       <div><CheckCircle2 size={18}/><strong>{bundle.questions.filter(x=>x.correct_index!==null).length}</strong><span>Kunci jawaban</span></div>
       <div><FileUp size={18}/><strong>{bundle.images}</strong><span>Gambar pada paket</span></div>
     </div>}
     {bundle&&<div className="vqe-blueprint-summary">
       <h3>Blueprint sesi wajib • {bundle.inspection.sessionQuestions} soal / {bundle.inspection.sessionSeconds/60} menit</h3>
       <div className="vqe-blueprint-scroll"><table><thead><tr><th>Jenis soal</th><th>Jumlah</th><th>Detik/soal</th><th>Total</th><th>Stok</th></tr></thead><tbody>
         {APPROVED_GROUPS.map(group=>{const rule=APPROVED_BLUEPRINT.groups[group];
           return <tr key={group}><td>{rule.label}</td><td>{rule.quota}</td><td>{rule.seconds} dtk</td>
             <td>{rule.quota*rule.seconds} dtk</td><td>{bundle.inspection.available[group]} soal</td></tr>;
         })}</tbody></table></div>
       {bundle.inspection.warnings.length>0&&<div className="vqe-blueprint-warning" role="alert">
         <b>{bundle.inspection.warnings.length} soal perlu ditinjau manual.</b>
         {bundle.inspection.warnings.map((message,i)=><p key={i}>{message}</p>)}
         <p>Impor sebagai draft diperbolehkan, tetapi soal ini tidak boleh dipublikasikan sebelum diperbaiki.</p>
       </div>}
     </div>}
     {notice&&<p role="status" className="vqe-alert">{notice}</p>}
     {saving&&<div className="vqe-import-progress"><p>Impor {progress.done} dari {progress.total} soal...</p>
       <div><span style={{width:(progress.total?Math.round(progress.done/progress.total*100):0)+'%'}}/></div></div>}
     <div className="vqe-actions"><Link className="btn secondary" href="/admin/bank-soal/aktifkan">Periksa & aktifkan</Link><Link className="btn secondary" href="/admin/bank-soal/buat">Editor manual</Link>
       <button type="button" className="btn primary" disabled={!bundle||saving||reading} onClick={()=>void importDrafts()}>
         <FileUp size={16}/>{saving?'Mengimpor...':'Impor ke draft Supabase'}
       </button></div>
   </section>
   <div className="vqe-note">Nomor dokumen yang sudah ada tidak ditimpa. Jika pernah mengimpor versi awal dengan timer 20 detik, paket baru ini akan memperbarui kolom kelompok dan timer saja setelah teks soal terverifikasi sama. Konten soal dan jawaban tidak ditimpa. Bank aktif Android/web serta nilai siswa tetap tidak berubah.</div>
  </main>
 </AppShell>;
}
