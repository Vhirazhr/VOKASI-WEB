'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {CheckCircle2,Eye,EyeOff,KeyRound,ShieldCheck} from 'lucide-react';
import {configured,supabase} from '@/lib/supabase';
import '@/app/admin-settings.css';

export default function AdminActivationPage(){
 const router=useRouter();
 const [checking,setChecking]=useState(true);
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [repeat,setRepeat]=useState('');
 const [visible,setVisible]=useState(false);
 const [busy,setBusy]=useState(false);
 const [issue,setIssue]=useState('');
 const [success,setSuccess]=useState(false);
 useEffect(()=>{
  let mounted=true;
  async function check(){
   try{
    if(!configured())throw new Error('Koneksi Supabase belum tersedia.');
    const {data,error}=await supabase().auth.getUser();
    if(error||!data.user)throw new Error('Tautan undangan tidak valid atau kedaluwarsa. Hubungi administrator sekolah.');
    const {data:isAdmin,error:roleError}=await supabase().rpc('is_school_admin');
    if(roleError||isAdmin!==true)throw new Error('Akun ini belum memiliki akses administrator sekolah.');
    if(mounted)setEmail(data.user.email||'');
   }catch(e){if(mounted)setIssue(e instanceof Error?e.message:'Undangan tidak dapat diproses.');}
   finally{if(mounted)setChecking(false);}
  }
  void check();
  return()=>{mounted=false;};
 },[]);
 async function activate(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setIssue('');
  if(password.length<10){setIssue('Kata sandi minimal 10 karakter.');return;}
  if(password!==repeat){setIssue('Konfirmasi kata sandi belum sama.');return;}
  setBusy(true);
  try{
   const {error}=await supabase().auth.updateUser({password});
   if(error)throw error;
   setSuccess(true);
   setPassword('');setRepeat('');
   router.replace('/admin/pengaturan');
  }catch(e){setIssue(e instanceof Error?e.message:'Gagal membuat kata sandi.');}
  finally{setBusy(false);}
 }
 return <main className="admin-activation-screen">
  <section className="admin-activation-card">
   <span className="admin-activation-icon"><ShieldCheck size={26}/></span>
   <span className="admin-activation-kicker">VOKASI · ADMINISTRATOR</span>
   <h1>Aktivasi akun admin</h1>
   <p>Atur kata sandi pribadi untuk mengaktifkan akses administrator sekolah.</p>
   {checking?<div className="admin-activation-note">Memeriksa undangan...</div>:
    success?<div className="admin-activation-success"><CheckCircle2 size={18}/> Kata sandi tersimpan. Membuka Pengaturan...</div>:
    email?<form className="admin-activation-form" onSubmit={e=>void activate(e)}>
     <label>Email administrator<input value={email} readOnly autoComplete="username"/></label>
     <label>Kata sandi baru (minimal 10 karakter)
      <span className="admin-activation-password"><input minLength={10} required type={visible?'text':'password'} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Masukkan kata sandi baru"/>
       <button type="button" aria-label={visible?'Sembunyikan sandi':'Tampilkan sandi'} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button>
      </span>
     </label>
     <label>Ulangi kata sandi baru
      <span className="admin-activation-password"><input minLength={10} required type={visible?'text':'password'} autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)} placeholder="Ulangi kata sandi"/>
      </span>
     </label>
     {issue&&<div className="admin-activation-error" role="alert">{issue}</div>}
     <button type="submit" disabled={busy}><KeyRound size={17}/>{busy?'Menyimpan...':'Aktifkan akun admin'}</button>
    </form>:
    <div className="admin-activation-error" role="alert">{issue||'Undangan tidak dapat digunakan.'}</div>}
   <Link href="/login?role=admin">Kembali ke halaman login</Link>
  </section>
 </main>;
}
