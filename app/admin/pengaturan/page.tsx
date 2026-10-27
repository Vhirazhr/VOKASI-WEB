'use client';

import {useEffect,useMemo,useState} from 'react';
import {CalendarDays,CheckCircle2,Clock3,LogOut,Mail,RefreshCw,Search,Settings,ShieldCheck,ShieldOff,UserRound,Users} from 'lucide-react';
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
    if(result.error)throw result.error;
    if(!active)return;
    setAccountId(session.data.user?.id||'');
    setEmail(session.data.user?.email||'');
    setMembers((result.data||[]) as Administrator[]);
    setIssue('');
   }catch(e){
    if(active)setIssue('Daftar administrator tidak dapat dimuat: '+(e instanceof Error?e.message:'Terjadi kesalahan.'));
   }finally{if(active)setBusy(false);}
  }
  void load();
  return()=>{active=false};
 },[loading,error,refreshKey]);

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
     <button type="button" className="admin-settings-refresh" onClick={refresh} disabled={busy}><RefreshCw size={16}/>{busy?'Memuat...':'Segarkan data'}</button>
    </div>
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
       {!member.email_verified&&<p className="admin-settings-verify-note">Email akun belum terverifikasi.</p>}
      </article>)}
     </div>
    }
    <p className="admin-settings-access-note">Status aktif berarti akun memiliki izin administrator, bukan berarti sedang online. Data administrator hanya dapat dilihat oleh admin sekolah aktif.</p>
   </section>

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
