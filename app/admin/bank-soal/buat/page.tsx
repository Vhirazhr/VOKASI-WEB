'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {ArrowLeft,ImagePlus,Plus,Save,Trash2,UploadCloud} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {supabase} from '@/lib/supabase';
import '@/app/admin-visual-questions.css';

const BUCKET='vokasi-question-figures';
type Answer={text:string;image_path:string|null;file:File|null};
type SavedAnswer={text:string;image_path:string|null};
type Draft={id:string;source_number:number|null;category:string;question:string;question_image_path:string|null;
 options:SavedAnswer[];correct_index:number;time_limit_seconds:number;explanation:string;created_at:string};
const blank=():Answer=>({text:'',image_path:null,file:null});
function UploadField({title,file,path,setImage,remove}:{title:string;file:File|null;path:string|null;setImage:(f:File)=>void;remove:()=>void}){
 const [url,setUrl]=useState('');
 useEffect(()=>{let active=true;let objectUrl:string|null=null;
  async function load(){
   if(file){objectUrl=URL.createObjectURL(file);if(active)setUrl(objectUrl);}
   else if(path){const r=await supabase().storage.from(BUCKET).createSignedUrl(path,1200);if(active)setUrl(r.data?.signedUrl||'');}
   else if(active)setUrl('');
  }
  void load();return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[file,path]);
 return <div className="vqe-image">
   <label className="vqe-upload"><UploadCloud size={17}/><span>{title}: {file?.name||'Pilih file JPG/PNG/WEBP (maks. 3 MB)'}</span>
    <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={title} onChange={e=>{
      const f=e.target.files?.[0];e.target.value='';
      if(!f)return;
      if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>3145728){window.alert('Gunakan gambar JPG, PNG, atau WEBP maksimal 3 MB.');return;}
      setImage(f);
    }}/></label>
   {url&&<div className="vqe-image-preview"><img src={url} alt={'Pratinjau '+title}/><button type="button" onClick={remove} aria-label={'Hapus '+title}>Hapus gambar</button></div>}
   {(file||path)&&!url&&<button type="button" onClick={remove}>Hapus gambar</button>}
 </div>;
}
export default function CreatePictureQuestion(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [drafts,setDrafts]=useState<Draft[]>([]);
 const [busy,setBusy]=useState(true),[saving,setSaving]=useState(false);
 const [issue,setIssue]=useState(''),[notice,setNotice]=useState('');
 const [editing,setEditing]=useState<string|null>(null);
 const [sourceNo,setSourceNo]=useState(''),[category,setCategory]=useState('Pola Gambar');
 const [question,setQuestion]=useState(''),[image,setImage]=useState<File|null>(null),[imagePath,setImagePath]=useState<string|null>(null);
 const [options,setOptions]=useState<Answer[]>([blank(),blank(),blank()]);
 const [correct,setCorrect]=useState(0),[seconds,setSeconds]=useState(20),[explanation,setExplanation]=useState('');
 const [showPreview,setShowPreview]=useState(false);
 async function refresh(){
   setBusy(true);
   const {data,error:dbError}=await supabase().from('vokasi_question_drafts')
     .select('id,source_number,category,question,question_image_path,options,correct_index,time_limit_seconds,explanation,created_at')
     .order('created_at',{ascending:false}).limit(1000);
   if(dbError){setIssue(dbError.message);setDrafts([]);}else{setIssue('');setDrafts((data||[]) as Draft[]);}
   setBusy(false);
 }
 useEffect(()=>{if(!loading&&!error)queueMicrotask(()=>void refresh());},[loading,error]);
 const setOption=(i:number,patch:Partial<Answer>)=>setOptions(a=>a.map((v,j)=>j===i?{...v,...patch}:v));
 function clear(){
   setEditing(null);setSourceNo('');setCategory('Pola Gambar');setQuestion('');setImage(null);setImagePath(null);
   setOptions([blank(),blank(),blank()]);setCorrect(0);setSeconds(20);setExplanation('');setShowPreview(false);
 }
 function edit(d:Draft){
   setEditing(d.id);setSourceNo(d.source_number?.toString()||'');setCategory(d.category);setQuestion(d.question);
   setImage(null);setImagePath(d.question_image_path);setOptions(d.options.map(o=>({text:o.text,image_path:o.image_path,file:null})));
   setCorrect(d.correct_index);setSeconds(d.time_limit_seconds);setExplanation(d.explanation);setNotice('');
   window.scrollTo({top:0,behavior:'smooth'});
 }
 async function upload(f:File,userId:string){
   if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>3145728)throw new Error('File gambar tidak valid (maks. 3 MB).');
   const extension=f.type==='image/png'?'png':f.type==='image/webp'?'webp':'jpg';
   const location=userId+'/'+crypto.randomUUID()+'.'+extension;
   const {error:err}=await supabase().storage.from(BUCKET).upload(location,f,{upsert:false,contentType:f.type});
   if(err)throw err;
   return location;
 }
 async function save(e:React.FormEvent){
   e.preventDefault();setNotice('');
   if(!question.trim()&&!image&&!imagePath){setNotice('Isi teks atau gambar soal.');return;}
   if(!category.trim()){setNotice('Kategori wajib diisi.');return;}
   if(options.length<2||options.length>6||options.some(o=>!o.text.trim()&&!o.file&&!o.image_path)){setNotice('Isi 2–6 pilihan, masing-masing perlu teks atau gambar.');return;}
   if(!Number.isInteger(seconds)||seconds<5||seconds>180){setNotice('Waktu soal harus 5–180 detik.');return;}
   const no=sourceNo.trim()?Number(sourceNo):null;
   if(no!==null&&(!Number.isInteger(no)||no<1||no>100000)){setNotice('Nomor soal dokumen tidak valid.');return;}
   setSaving(true);
   const uploaded:string[]=[];
   try{
     const {data:{user},error:authError}=await supabase().auth.getUser();
     if(authError||!user)throw new Error('Login admin perlu diulang.');
     const imageLocation=image?await upload(image,user.id):imagePath;
     if(image&&imageLocation)uploaded.push(imageLocation);
     const saved:SavedAnswer[]=[];
     for(const option of options){
       const path=option.file?await upload(option.file,user.id):option.image_path;
       if(option.file&&path)uploaded.push(path);
       saved.push({text:option.text.trim(),image_path:path});
     }
     const values={source_number:no,category:category.trim(),question:question.trim(),question_image_path:imageLocation,
       options:saved,correct_index:correct,time_limit_seconds:seconds,explanation:explanation.trim()};
     const request=editing?
       await supabase().from('vokasi_question_drafts').update(values).eq('id',editing):
       await supabase().from('vokasi_question_drafts').insert({...values,created_by:user.id});
     if(request.error)throw request.error;
     clear();await refresh();setNotice('Berhasil! Draft soal tersimpan. Belum muncul dalam latihan siswa.');
   }catch(e){
     if(uploaded.length)await supabase().storage.from(BUCKET).remove(uploaded);
     setNotice('Gagal menyimpan: '+(e instanceof Error?e.message:String(e)));
   }finally{setSaving(false);}
 }
 async function discard(d:Draft){
   if(!window.confirm('Yakin hapus draft ini?'))return;
   setSaving(true);
   const {error:err}=await supabase().from('vokasi_question_drafts').delete().eq('id',d.id);
   if(err)setNotice('Gagal menghapus: '+err.message);
   else{
     const paths=[d.question_image_path,...d.options.map(v=>v.image_path)].filter((p):p is string=>!!p);
     if(paths.length)await supabase().storage.from(BUCKET).remove(paths);
     if(editing===d.id)clear();
     setNotice('Draft berhasil dihapus.');await refresh();
   }
   setSaving(false);
 }
 if(loading)return <main className="page-loader">Memeriksa akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;
 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
  <div className="vqe">
   <Link href="/admin/bank-soal" className="vqe-back"><ArrowLeft size={17}/> Kembali ke bank soal</Link>
   <div className="vqe-heading"><div><span className="section-kicker">BANK SOAL BARU</span><h1>Editor soal bergambar</h1><p>Teks, gambar soal, gambar pilihan A–C atau A–D, dan kunci jawaban.</p></div><span className="admin-workspace-pill">Khusus admin</span></div>
   <div className="vqe-note"><b>Mode draft:</b> bank lama, timer dan nilai siswa tidak berubah. Soal baru baru dapat dipakai setelah seluruh bank dan aturan sesi diperiksa.</div>
   {issue&&<div role="alert" className="vqe-alert">Penyimpanan draft belum siap: {issue}. Jalankan berkas SQL <code>supabase/migrations/202610250001_vokasi_visual_question_drafts.sql</code> melalui SQL Editor Supabase sekolah.</div>}
   {notice&&<div role="status" className="vqe-alert">{notice}</div>}
   <form className="vqe-card" onSubmit={save}>
    <div className="vqe-row-heading"><h2>{editing?'Sunting draft soal':'Tambah soal'}</h2>{editing&&<button className="btn secondary small" type="button" onClick={clear}>Batal sunting</button>}</div>
    <div className="vqe-grid">
     <label>Nomor dari dokumen (opsional)<input type="number" min="1" value={sourceNo} onChange={e=>setSourceNo(e.target.value)} placeholder="451"/></label>
     <label>Kategori<input value={category} onChange={e=>setCategory(e.target.value)} list="vqe-categories" required/>
      <datalist id="vqe-categories">{['Pola Gambar','Penalaran Visual','Perkalian','Pembagian','Penjumlahan','Pengurangan','Campuran'].map(v=><option key={v} value={v}/>)}</datalist></label>
     <label>Waktu per soal (detik)<input type="number" min="5" max="180" value={seconds} onChange={e=>setSeconds(Number(e.target.value))}/></label>
    </div>
    <label className="vqe-label">Pertanyaan<textarea rows={3} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Perhatikan urutan gambar. Bentuk apa yang melanjutkan pola?"/></label>
    <UploadField title="Gambar soal" file={image} path={imagePath} setImage={setImage} remove={()=>{setImage(null);setImagePath(null);}}/>
    <div className="vqe-row-heading"><h3>Pilihan jawaban ({options.length})</h3><p>Pilih tombol radio sebagai kunci jawaban.</p></div>
    {options.map((o,i)=><div className="vqe-option" key={i}>
      <div className="vqe-option-header"><b>{String.fromCharCode(65+i)}</b>
       <label><input type="radio" name="correct" checked={correct===i} onChange={()=>setCorrect(i)}/> Jawaban benar</label>
       {options.length>2&&<button type="button" onClick={()=>{setOptions(v=>v.filter((_,j)=>j!==i));setCorrect(v=>v===i?0:v>i?v-1:v);}}><Trash2 size={15}/> Hapus</button>}
      </div>
      <input aria-label={'Teks jawaban '+String.fromCharCode(65+i)} value={o.text} onChange={e=>setOption(i,{text:e.target.value})} placeholder="Teks jawaban (opsional jika menggunakan gambar)"/>
      <UploadField title={'Gambar jawaban '+String.fromCharCode(65+i)} file={o.file} path={o.image_path} setImage={f=>setOption(i,{file:f})} remove={()=>setOption(i,{file:null,image_path:null})}/>
    </div>)}
    {options.length<6&&<button className="vqe-add" type="button" onClick={()=>setOptions(v=>[...v,blank()])}><Plus size={17}/> Tambah pilihan</button>}
    <label className="vqe-label">Pembahasan (opsional)<textarea rows={2} value={explanation} onChange={e=>setExplanation(e.target.value)}/></label>
    <div className="vqe-actions"><button type="button" className="btn secondary" onClick={()=>setShowPreview(v=>!v)}><ImagePlus size={16}/>{showPreview?'Tutup pratinjau':'Pratinjau soal'}</button>
      <button type="submit" className="btn primary" disabled={saving||busy||!!issue}><Save size={16}/>{saving?'Menyimpan...':'Simpan draft'}</button></div>
   </form>
   {showPreview&&<section className="vqe-card vqe-preview"><span className="section-kicker">PRATINJAU</span><h2>{question||'Pertanyaan dengan gambar'}</h2>
     <UploadField title="Pratinjau gambar soal" file={image} path={imagePath} setImage={setImage} remove={()=>{setImage(null);setImagePath(null);}}/>
     {options.map((o,i)=><div key={i} className="vqe-preview-choice"><b>{String.fromCharCode(65+i)}</b><span>{o.text||'Pilihan berupa gambar'}</span>
       <UploadField title={'Pratinjau gambar '+String.fromCharCode(65+i)} file={o.file} path={o.image_path} setImage={f=>setOption(i,{file:f})} remove={()=>setOption(i,{file:null,image_path:null})}/>
     </div>)}
     <p>Pratinjau tidak memengaruhi hasil atau waktu ujian.</p></section>}
   <section className="vqe-card vqe-list"><div className="vqe-row-heading"><h2>Draft tersimpan ({drafts.length})</h2><button type="button" className="btn secondary small" disabled={busy} onClick={()=>void refresh()}>Segarkan</button></div>
    {busy?<p>Mengambil data...</p>:drafts.length===0?<p>Belum ada soal baru tersimpan.</p>:
     drafts.map(d=><article key={d.id}><div><b>{d.source_number?('No. '+d.source_number+' · '):''}{d.question||'Soal bergambar'}</b>
       <p>{d.category} · {d.options.length} pilihan · {d.time_limit_seconds} detik {d.question_image_path?'· Ada gambar':''}</p></div>
       <div><button type="button" onClick={()=>edit(d)}>Sunting</button><button type="button" onClick={()=>void discard(d)}><Trash2 size={15}/> Hapus</button></div>
     </article>)}
   </section>
  </div>
 </AppShell>;
}
