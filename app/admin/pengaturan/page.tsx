'use client';

import {useEffect,useState} from 'react';
import {LogOut,Settings,ShieldCheck,UserRound} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {supabase} from '@/lib/supabase';
import '@/app/admin-settings.css';

export default function AdminSettingsPage(){
  const {loading,error,logout}=useSchoolAuth('admin');
  const [email,setEmail]=useState('');
  const [signingOut,setSigningOut]=useState(false);
  useEffect(()=>{
    if(loading||error)return;
    let active=true;
    void supabase().auth.getUser().then(({data,error:authError})=>{
      if(active&&!authError)setEmail(data.user?.email||'');
    }).catch(()=>{});
    return()=>{active=false};
  },[loading,error]);
  async function handleSignOut(){
    if(signingOut||!window.confirm('Keluar dari akun administrator VOKASI?'))return;
    setSigningOut(true);
    try{await logout();}finally{setSigningOut(false);}
  }
  if(loading)return <main className="page-loader">Memverifikasi akses admin...</main>;
  if(error)return <main className="page-loader">{error}</main>;
  return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
    <main className="admin-settings">
      <header className="admin-settings-header">
        <span className="section-kicker"><Settings size={14}/> PREFERENSI AKUN</span>
        <h1>Pengaturan</h1>
        <p>Kelola sesi administrator yang sedang masuk ke VOKASI-WEB.</p>
      </header>
      <section className="admin-settings-panel" aria-labelledby="admin-settings-session-title">
        <div className="admin-settings-section-heading"><ShieldCheck size={21}/><div><h2 id="admin-settings-session-title">Akun aktif</h2><p>Informasi sesi administrator.</p></div></div>
        <div className="admin-settings-account">
          <div className="admin-settings-usericon"><UserRound size={26}/></div>
          <div><strong>{email||'Admin Sekolah'}</strong><span>Administrator · Sedang masuk</span></div>
        </div>
        <div className="admin-settings-signout">
          <div><h3>Keluar dari akun</h3><p>Keluar dari sesi pada perangkat ini dan kembali ke halaman masuk.</p></div>
          <button type="button" onClick={()=>void handleSignOut()} disabled={signingOut} className="admin-settings-signout-button"><LogOut size={17}/>{signingOut?'Memproses...':'Keluar akun'}</button>
        </div>
      </section>
    </main>
  </AppShell>;
}
