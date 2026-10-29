'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {CheckCircle2,Eye,EyeOff,KeyRound,ShieldCheck} from 'lucide-react';
import '@/app/admin-settings.css';

export default function AdminActivationPage(){
 const router=useRouter();
 const [checking,setChecking]=useState(true);
 const [token,setToken]=useState('');
 const [email,setEmail]=useState('');
 const [displayName,setDisplayName]=useState('');
 const [password,setPassword]=useState('');
 const [repeat,setRepeat]=useState('');
 const [visible,setVisible]=useState(false);
 const [busy,setBusy]=useState(false);
 const [issue,setIssue]=useState('');
 const [success,setSuccess]=useState(false);

 useEffect(()=>{
  let mounted=true;
  async function check(){
   const inviteToken=new URLSearchParams(window.location.search).get('token')||'';
   if(!inviteToken){
    if(mounted){setIssue('Tautan undangan tidak valid atau kedaluwarsa. Hubungi Super Admin sekolah.');setChecking(false);}
    return;
   }
   setToken(inviteToken);
   try{
    const response=await fetch('/api/admin/invitations?token='+encodeURIComponent(inviteToken),{
     method:'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
    });
    const payload=await response.json().catch(()=>({})) as {data?:{email?:string;displayName?:string};error?:unknown};
    if(!response.ok)throw new Error(typeof payload.error==='string'?payload.error:'Tautan undangan tidak valid atau kedaluwarsa.');
    if(!payload.data?.email||!payload.data.displayName)throw new Error('Data undangan tidak lengkap.');
    if(mounted){setEmail(payload.data.email);setDisplayName(payload.data.displayName);}
   }catch(e){
    if(mounted)setIssue(e instanceof Error?e.message:'Undangan tidak dapat diverifikasi.');
   }finally{
    if(mounted)setChecking(false);
   }
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
   const response=await fetch('/api/admin/invitations/accept',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({token,password})
   });
   const payload=await response.json().catch(()=>({})) as {data?:{ok?:boolean};error?:unknown};
   if(!response.ok)throw new Error(typeof payload.error==='string'?payload.error:'Aktivasi akun admin tidak berhasil.');
   if(!payload.data?.ok)throw new Error('Aktivasi akun admin tidak berhasil.');
   setSuccess(true);setPassword('');setRepeat('');
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
    success?<div className="admin-activation-success"><CheckCircle2 size={18}/> Akun berhasil diaktifkan. Membuka Pengaturan...</div>:
    email?<form className="admin-activation-form" onSubmit={e=>void activate(e)}>
     <label>Nama administrator<input value={displayName} readOnly autoComplete="name"/></label>
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
