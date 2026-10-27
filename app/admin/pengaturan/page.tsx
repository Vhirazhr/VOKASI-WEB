'use client';

import {useEffect,useMemo,useState} from 'react';
import {CalendarDays,CheckCircle2,Clock3,LogOut,Mail,Plus,RefreshCw,Search,Send,ShieldCheck,ShieldOff,UserRound,Users,X} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {supabase} from '@/lib/supabase';
import '@/app/admin-workspace.css';
import '@/app/admin-students-ui.css';
import '@/app/admin-settings.css';

type Administrator={
 user_id:string;
 display_name:string;
 email:string;
 is_active:boolean;
 access_status:string;
 joined_at:string|null;
 last_sign_in_at:string|null;
 email_verified:boolean;
 is_current:boolean;
};

const displayDate=(value:string|null,includeTime=false)=>{
 if(!value)return 'Belum pernah';
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return 'Tidak tersedia';
 return new Intl.DateTimeFormat('id-ID',{
  day:'numeric',month:'short',year:'numeric',
  ...(includeTime?{hour:'2-digit',minute:'2-digit',hourCycle:'h23' as const}:{}),
  timeZone:'Asia/Jakarta'
 }).format(date)+(includeTime?' WIB':'');
};

export default function AdminSettingsPage(){
 const {loading,error,logout}=useSchoolAuth('admin');
 const [email,setEmail]=useState('');
 const [accountId,setAccountId]=useState('');
 const [members,setMembers]=useState<Administrator[]>([]);
 const [busy,setBusy]=useState(true);
 const [issue,setIssue]=useState('');
 const [query,setQuery]=useState('');
 const [refreshKey,setRefreshKey]=useState(0);
 const [signingOut,setSigningOut]=useState(false);
 const [createOpen,setCreateOpen]=useState(false);
 const [inviteName,setInviteName]=useState('');
 const [inviteEmail,setInviteEmail]=useState('');
 const [inviting,setInviting]=useState(false);
 const [inviteIssue,setInviteIssue]=useState('');
 const [inviteSuccess,setInviteSuccess]=useState('');

 useEffect(()=>{
  if(loading||error)return;
  let active=true;
  async function load(){
   try{
    const [session,result]=await Promise.all([
     supabase().auth.getUser(),
     supabase().rpc('vokasi_admin_list_administrators')
    ]);
    if(session.error)throw session.error;
    if(!active)return;
    setAccountId(session.data.user?.id||'');
    setEmail(session.data.user?.email||'');
    if(result.error)throw result.error;
    setMembers((result.data||[]) as Administrator[]);
    setIssue('');
   }catch(e){
    if(active)setIssue('Daftar administrator tidak dapat dimuat: '+(e instanceof Error?e.message:'Terjadi kesalahan.'));
   }finally{if(active)setBusy(false);}
  }
  void load();
  return()=>{active=false};
 },[loading,error,refreshKey]);

 useEffect(()=>{
  if(!createOpen)return;
  const html=document.documentElement,body=document.body;
  const prevHtml=html.style.overflow,prevBody=body.style.overflow;
  html.style.overflow='hidden';body.style.overflow='hidden';
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!inviting)setCreateOpen(false);
  };
  window.addEventListener('keydown',onKey);
  return()=>{
   html.style.overflow=prevHtml;body.style.overflow=prevBody;
   window.removeEventListener('keydown',onKey);
  };
 },[createOpen,inviting]);

 function openCreate(){
  setInviteName('');setInviteEmail('');setInviteIssue('');setCreateOpen(true);
 }
 async function inviteAdmin(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(inviting)return;
  const displayName=inviteName.trim().replace(/\s+/g,' ');
  const destination=inviteEmail.trim().toLowerCase();
  if(displayName.length<3||displayName.length>100){setInviteIssue('Isi nama lengkap minimal 3 karakter.');return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)){setInviteIssue('Masukkan alamat email yang valid.');return;}
  setInviting(true);setInviteIssue('');
  try{
   const {data,error:inviteError}=await supabase().functions.invoke('invite-school-admin',{
    body:{displayName,email:destination}
   });
   if(inviteError){
    let message=inviteError.message||'Tidak dapat mengirim undangan.';
    if(inviteError.context instanceof Response){
     const payload=await inviteError.context.clone().json().catch(()=>null);
     if(payload&&typeof payload.error==='string')message=payload.error;
    }
    throw new Error(message);
   }
   if(!data?.ok)throw new Error('Undangan tidak berhasil dibuat. Silakan coba lagi.');
   setInviteSuccess(data?.warning?destination+' · '+data.warning:'Undangan admin dikirim ke '+destination+'.');
   setCreateOpen(false);
   setBusy(true);setRefreshKey(v=>v+1);
  }catch(e){setInviteIssue(e instanceof Error?e.message:'Gagal mengundang administrator.');}
  finally{setInviting(false);}
 }

 const filtered=useMemo(()=>{
  const text=query.trim().toLocaleLowerCase('id-ID');
  return [...members].filter(member=>!text||[member.display_name,member.email,member.access_status].some(value=>value.toLocaleLowerCase('id-ID').includes(text)))
   .sort((a,b)=>Number(b.user_id===accountId)-Number(a.user_id===accountId)||a.display_name.localeCompare(b.display_name,'id'));
 },[members,query,accountId]);
 const activeCount=members.filter(member=>member.access_status==='Aktif').length;
 const inactiveCount=members.length-activeCount;

 async function handleSignOut(){
  if(signingOut||!window.confirm('Keluar dari akun administrator VOKASI?'))return;
  setSigningOut(true);
  try{await logout();}finally{setSigningOut(false);}
 }
 function refresh(){setBusy(true);setRefreshKey(key=>key+1);}

 if(loading)return <main className="page-loader">Memverifikasi akses admin...</main>;
 if(error)return <main className="page-loader">{error}</main>;

 return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
  <main className="admin-workspace admin-students-page admin-settings-page">
   <section className="admin-students-hero admin-settings-hero" aria-label="Ringkasan administrator">
    <header className="admin-workspace-header">
     <span className="section-kicker">PENGATURAN SEKOLAH</span>
     <h1>Pengaturan Admin</h1>
     <p>Daftar administrator, status akses, dan keamanan akun yang terdaftar pada VOKASI-WEB.</p>
    </header>
    <div className="admin-mini-stats">
     <div><Users size={20}/><span>Total administrator</span><strong>{busy?'—':members.length.toLocaleString('id-ID')}</strong></div>
     <div><ShieldCheck size={20}/><span>Akses aktif</span><strong>{busy?'—':activeCount.toLocaleString('id-ID')}</strong></div>
     <div><ShieldOff size={20}/><span>Akses nonaktif / dibatasi</span><strong>{busy?'—':inactiveCount.toLocaleString('id-ID')}</strong></div>
    </div>
   </section>

   <section className="admin-settings-panel admin-settings-directory" aria-labelledby="admin-directory-title">
    <div className="admin-settings-directory-heading">
     <div><span className="section-kicker">PENGELOLAAN AKSES</span><h2 id="admin-directory-title">Daftar administrator</h2><p>Administrator yang tercatat pada sistem sekolah, termasuk akun yang sedang digunakan.</p></div>
     <div className="admin-settings-heading-actions">
      <button type="button" className="admin-settings-refresh" onClick={refresh} disabled={busy}><RefreshCw size={16}/>{busy?'Memuat...':'Segarkan data'}</button>
      <button type="button" className="admin-settings-add-button" onClick={openCreate}><Plus size={17}/> Buat Admin Baru</button>
     </div>
    </div>
    {inviteSuccess&&<div className="admin-settings-invite-success" role="status"><Send size={17}/>{inviteSuccess}</div>}
    <div className="admin-settings-directory-tools">
     <label className="admin-settings-search"><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} aria-label="Cari administrator" placeholder="Cari nama, email, atau status akun..."/></label>
     <span className="admin-settings-count">{busy?'—':filtered.length} admin</span>
    </div>
    {issue&&<div className="alert danger" role="alert">{issue}<button type="button" className="admin-settings-retry" onClick={refresh}>Coba lagi</button></div>}
    {busy?<div className="admin-settings-empty" role="status">Memuat daftar administrator...</div>:
     filtered.length===0?<div className="admin-settings-empty">{members.length===0?'Belum ada administrator yang dapat ditampilkan.':'Tidak ada administrator yang sesuai pencarian.'}</div>:
     <div className="admin-settings-admin-grid">
      {filtered.map(member=><article key={member.user_id} className="admin-settings-admin-card">
       <div className="admin-settings-admin-main">
        <span className="admin-settings-person-icon"><ShieldCheck size={21}/></span>
        <div className="admin-settings-admin-identity">
         <div className="admin-settings-admin-name"><strong>{member.display_name||'Administrator'}</strong>{member.user_id===accountId&&<span className="admin-settings-self-tag">Anda</span>}</div>
         <span className="admin-settings-admin-email"><Mail size={13}/>{member.email||'Email tidak tersedia'}</span>
        </div>
        <span className={'admin-settings-access '+(member.access_status==='Aktif'?'enabled':'restricted')}>
         {member.access_status==='Aktif'?<CheckCircle2 size={13}/>:<ShieldOff size={13}/>}
         {member.access_status}
        </span>
       </div>
       <div className="admin-settings-admin-meta">
        <div><small>Hak akses</small><strong>Administrator sekolah</strong></div>
        <div><small>Terdaftar sejak</small><strong><CalendarDays size={13}/>{displayDate(member.joined_at)}</strong></div>
        <div><small>Terakhir login</small><strong><Clock3 size={13}/>{displayDate(member.last_sign_in_at,true)}</strong></div>
       </div>
       {member.access_status==='Menunggu aktivasi'&&<p className="admin-settings-verify-note">Menunggu penerima undangan membuat kata sandi.</p>}
       {!member.email_verified&&member.access_status!=='Menunggu aktivasi'&&<p className="admin-settings-verify-note">Email akun belum terverifikasi.</p>}
      </article>)}
     </div>
    }
   </section>

   {createOpen&&<div className="admin-modal-overlay" role="presentation" onMouseDown={()=>{if(!inviting)setCreateOpen(false);}}>
    <section role="dialog" aria-modal="true" aria-labelledby="invite-admin-title" className="admin-modal-card admin-settings-invite-modal" onMouseDown={event=>event.stopPropagation()}>
     <header className="admin-modal-top admin-settings-invite-heading">
      <div><span className="section-kicker">MANAJEMEN ADMINISTRATOR</span><h2 id="invite-admin-title">Buat Admin Baru</h2><p>Kirim undangan agar administrator baru dapat mengaktifkan akunnya.</p></div>
      <button type="button" onClick={()=>setCreateOpen(false)} disabled={inviting} aria-label="Tutup formulir"><X size={19}/></button>
     </header>
     <form className="admin-settings-invite-form" onSubmit={event=>void inviteAdmin(event)}>
      <label>Nama lengkap administrator<input autoFocus required minLength={3} maxLength={100} autoComplete="name" placeholder="Contoh: Budi Santoso" value={inviteName} onChange={event=>setInviteName(event.target.value)} disabled={inviting}/></label>
      <label>Email administrator<input required type="email" maxLength={254} autoComplete="email" placeholder="admin@sekolah.sch.id" value={inviteEmail} onChange={event=>setInviteEmail(event.target.value)} disabled={inviting}/></label>
      <div className="admin-settings-invite-info"><Mail size={17}/><span>Undangan dikirim ke alamat email di atas. Penerima membuat kata sandi sendiri melalui tautan aktivasi.</span></div>
      {inviteIssue&&<div className="alert danger" role="alert">{inviteIssue}</div>}
      <footer className="admin-settings-invite-actions">
       <button className="btn secondary small" type="button" onClick={()=>setCreateOpen(false)} disabled={inviting}>Batal</button>
       <button className="btn primary small" type="submit" disabled={inviting}><Send size={15}/>{inviting?'Mengirim...':'Kirim Undangan'}</button>
      </footer>
     </form>
    </section>
   </div>}
   <section className="admin-settings-panel admin-settings-current" aria-labelledby="admin-settings-session-title">
    <div className="admin-settings-section-heading"><ShieldCheck size={21}/><div><h2 id="admin-settings-session-title">Akun yang sedang digunakan</h2><p>Informasi sesi administrator di perangkat ini.</p></div></div>
    <div className="admin-settings-account">
     <div className="admin-settings-usericon"><UserRound size={26}/></div>
     <div><strong>{email||'Admin Sekolah'}</strong><span>Administrator · Sedang masuk di perangkat ini</span></div>
    </div>
    <div className="admin-settings-signout">
     <div><h3>Keluar dari akun</h3><p>Keluar dari sesi pada perangkat ini dan kembali ke halaman masuk.</p></div>
     <button type="button" onClick={()=>void handleSignOut()} disabled={signingOut} className="admin-settings-signout-button"><LogOut size={17}/>{signingOut?'Memproses...':'Keluar akun'}</button>
    </div>
   </section>
  </main>
 </AppShell>;
}
