'use client';

import { nativeRpc } from '@/lib/native-rpc';
import {useEffect,useMemo,useState} from 'react';
import {CalendarDays,CheckCircle2,Clock3,LogOut,Mail,Plus,RefreshCw,Search,Send,ShieldCheck,ShieldOff,UserRound,Users,X,PenLine,Trash2,LockKeyhole,UserCheck,UserX,Crown} from 'lucide-react';
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
 access_role:'super_admin'|'admin';
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
 const [editMember,setEditMember]=useState<Administrator|null>(null);
 const [editName,setEditName]=useState('');
 const [editIssue,setEditIssue]=useState('');
 const [managing,setManaging]=useState(false);
 const [manageNotice,setManageNotice]=useState('');

 useEffect(()=>{
  if(loading||error)return;
  let active=true;
  async function load(){
   try{
    const [session,result]=await Promise.all([
     supabase().auth.getUser(),
     nativeRpc('vokasi_admin_list_administrators')
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
  if(!createOpen&&!editMember)return;
  const html=document.documentElement,body=document.body;
  const prevHtml=html.style.overflow,prevBody=body.style.overflow;
  html.style.overflow='hidden';body.style.overflow='hidden';
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!inviting&&!managing){setCreateOpen(false);setEditMember(null);}
  };
  window.addEventListener('keydown',onKey);
  return()=>{
   html.style.overflow=prevHtml;body.style.overflow=prevBody;
   window.removeEventListener('keydown',onKey);
  };
 },[createOpen,inviting,editMember,managing]);

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

 const currentAdmin=members.find(member=>member.user_id===accountId);
 const isSuperAdmin=currentAdmin?.access_role==='super_admin'&&currentAdmin.is_active;

 function openEdit(member:Administrator){
  if(!isSuperAdmin||member.access_role==='super_admin'||managing)return;
  setEditMember(member);setEditName(member.display_name);setEditIssue('');
 }
 async function changeAdmin(member:Administrator,action:'edit'|'activate'|'deactivate'|'remove',name?:string){
  if(!isSuperAdmin||managing||member.access_role==='super_admin'||member.user_id===accountId)return;
  if(action==='remove'&&!window.confirm('Hapus hak akses administrator '+member.email+'? Akun login dan riwayat tidak ikut dihapus.'))return;
  if(action==='deactivate'&&!window.confirm('Nonaktifkan akses admin '+member.email+'?'))return;
  setManaging(true);setEditIssue('');setManageNotice('');
  try{
   const {error:changeError}=await nativeRpc('vokasi_super_admin_manage_account',{
    p_target:member.user_id,p_action:action,p_display_name:action==='edit'?name||'':null
   });
   if(changeError)throw changeError;
   setManageNotice(action==='remove'?'Akses administrator dicabut.':action==='edit'?'Profil administrator diperbarui.':action==='activate'?'Akun admin diaktifkan.':'Akun admin dinonaktifkan.');
   setEditMember(null);
   setBusy(true);setRefreshKey(value=>value+1);
  }catch(e){
   const message=e instanceof Error?e.message:'Gagal mengubah data administrator.';
   if(editMember)setEditIssue(message);else setIssue(message);
  }finally{setManaging(false);}
 }
 async function submitEdit(event:React.FormEvent){
  event.preventDefault();
  if(!editMember)return;
  await changeAdmin(editMember,'edit',editName.trim());
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
      {isSuperAdmin&&<button type="button" className="admin-settings-add-button" onClick={openCreate}><Plus size={17}/> Buat Admin Baru</button>}
     </div>
    </div>
    {inviteSuccess&&<div className="admin-settings-invite-success" role="status"><Send size={17}/>{inviteSuccess}</div>}
    {manageNotice&&<div className="admin-settings-invite-success" role="status"><CheckCircle2 size={17}/>{manageNotice}</div>}
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
         <div className="admin-settings-admin-name"><strong>{member.display_name||'Administrator'}</strong>{member.user_id===accountId&&<span className="admin-settings-self-tag">Anda</span>}{member.access_role==='super_admin'&&<span className="admin-settings-role-tag"><Crown size={12}/> Super Admin</span>}</div>
         <span className="admin-settings-admin-email"><Mail size={13}/>{member.email||'Email tidak tersedia'}</span>
        </div>
        <span className={'admin-settings-access '+(member.access_status==='Aktif'?'enabled':'restricted')}>
         {member.access_status==='Aktif'?<CheckCircle2 size={13}/>:<ShieldOff size={13}/>}
         {member.access_status}
        </span>
       </div>
       <div className="admin-settings-admin-meta">
        <div><small>Hak akses</small><strong>{member.access_role==='super_admin'?'Seluruh fitur & kelola admin':'Operasional sekolah'}</strong></div>
        <div><small>Terdaftar sejak</small><strong><CalendarDays size={13}/>{displayDate(member.joined_at)}</strong></div>
        <div><small>Terakhir login</small><strong><Clock3 size={13}/>{displayDate(member.last_sign_in_at,true)}</strong></div>
       </div>
       {member.access_status==='Menunggu aktivasi'&&<p className="admin-settings-verify-note">Menunggu penerima undangan membuat kata sandi.</p>}
       {!member.email_verified&&member.access_status!=='Menunggu aktivasi'&&<p className="admin-settings-verify-note">Email akun belum terverifikasi.</p>}
       {isSuperAdmin&&member.access_role==='admin'&&<div className="admin-settings-admin-actions">
        <button type="button" disabled={managing} onClick={()=>openEdit(member)}><PenLine size={14}/> Edit</button>
        <button type="button" disabled={managing} onClick={()=>void changeAdmin(member,member.is_active?'deactivate':'activate')} className={member.is_active?'admin-settings-stop':''}>{member.is_active?<UserX size={14}/>:<UserCheck size={14}/>} {member.is_active?'Nonaktifkan':'Aktifkan'}</button>
        <button type="button" className="admin-settings-delete" disabled={managing} onClick={()=>void changeAdmin(member,'remove')}><Trash2 size={14}/> Hapus akses</button>
       </div>}
      </article>)}
     </div>
    }
   </section>
   <section className="admin-settings-panel admin-settings-permissions" aria-label="Hak akses administrator">
    <div className="admin-settings-permission-heading"><LockKeyhole size={21}/><div><h2>Hak akses administrator</h2><p>Pembagian wewenang akun di VOKASI-WEB.</p></div></div>
    <div className="admin-settings-permission-grid">
     <div><Crown size={20}/><strong>Super Admin</strong><p>Akses seluruh fitur sekolah, termasuk membuat, mengedit, menonaktifkan, dan mencabut akses administrator.</p></div>
     <div><ShieldCheck size={20}/><strong>Admin</strong><p>Mengelola kelas, siswa, bank soal, analitik, dan log sekolah. Tidak dapat mengatur akun administrator.</p></div>
    </div>
   </section>

   {editMember&&<div className="admin-modal-overlay" role="presentation" onMouseDown={()=>{if(!managing)setEditMember(null);}}>
    <section role="dialog" aria-modal="true" aria-labelledby="edit-admin-title" className="admin-modal-card admin-settings-invite-modal" onMouseDown={event=>event.stopPropagation()}>
     <header className="admin-modal-top admin-settings-invite-heading"><div><span className="section-kicker">MANAJEMEN ADMINISTRATOR</span><h2 id="edit-admin-title">Edit Administrator</h2><p>Perbarui nama dan lihat status hak akses.</p></div><button type="button" aria-label="Tutup editor admin" onClick={()=>setEditMember(null)} disabled={managing}><X size={19}/></button></header>
     <form className="admin-settings-invite-form" onSubmit={event=>void submitEdit(event)}>
      <label>Nama lengkap<input autoFocus required minLength={3} maxLength={100} value={editName} onChange={event=>setEditName(event.target.value)} disabled={managing}/></label>
      <label>Email administrator<input value={editMember.email} readOnly/></label>
      <div className="admin-settings-edit-role"><ShieldCheck size={17}/><span>Hak akses: <b>Admin</b> · {editMember.is_active?'Aktif':'Nonaktif'}</span></div>
      {editIssue&&<div className="alert danger" role="alert">{editIssue}</div>}
      <footer className="admin-settings-invite-actions"><button type="button" className="btn secondary small" disabled={managing} onClick={()=>setEditMember(null)}>Batal</button><button type="submit" className="btn primary small" disabled={managing}>{managing?'Menyimpan...':'Simpan perubahan'}</button></footer>
     </form>
    </section>
   </div>}
   {createOpen&&<div className="admin-modal-overlay" role="presentation" onMouseDown={()=>{if(!inviting)setCreateOpen(false);}}>
    <section role="dialog" aria-modal="true" aria-labelledby="invite-admin-title" className="admin-modal-card admin-settings-invite-modal" onMouseDown={event=>event.stopPropagation()}>
     <header className="admin-modal-top admin-settings-invite-heading">
      <div><span className="section-kicker">MANAJEMEN ADMINISTRATOR</span><h2 id="invite-admin-title">Buat Admin Baru</h2><p>Kirim undangan agar administrator baru dapat mengaktifkan akunnya.</p></div>
      <button type="button" onClick={()=>setCreateOpen(false)} disabled={inviting} aria-label="Tutup formulir"><X size={19}/></button>
     </header>
     <form className="admin-settings-invite-form" onSubmit={event=>void inviteAdmin(event)}>
      <label>Nama lengkap administrator<input autoFocus required minLength={3} maxLength={100} autoComplete="name" placeholder="Contoh: Budi Santoso" value={inviteName} onChange={event=>setInviteName(event.target.value)} disabled={inviting}/></label>
      <label>Email administrator<input required type="email" maxLength={254} autoComplete="email" placeholder="admin@sekolah.sch.id" value={inviteEmail} onChange={event=>setInviteEmail(event.target.value)} disabled={inviting}/></label>
      
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
