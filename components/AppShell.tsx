'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BookOpen, BarChart3, CheckCircle2, GraduationCap, History, ScrollText, LayoutDashboard, LogOut, Settings, ShieldCheck, Trophy, UserRound, Users, School2, Bot, Bell, X, MessageCircle } from 'lucide-react';
import {supabase} from '@/lib/supabase';
import AdminNotificationBell from '@/components/AdminNotificationBell';
import StudentAvatar from '@/components/StudentAvatar';
import StudentAssistant from '@/components/StudentAssistant';
import '@/app/student-assistant.css';
import type { ReactNode } from 'react';
import '@/app/school-shell.css';

type ShellProps = {
  children: ReactNode;
  role: 'student' | 'admin';
  onLogout: () => void;
  displayName: string;
  studentAvatarUrl?:string;
  embed?: boolean;
  navigationBlocked?: boolean;
  quizFocusMode?: boolean;
  dashboardStyle?: boolean;
};

export default function AppShell({children,role,onLogout,displayName,studentAvatarUrl,embed=false,navigationBlocked=false,quizFocusMode=false,dashboardStyle=false}:ShellProps) {
  const isAdmin=role==='admin';
  const pathname=usePathname();
  const [urlEmbed,setUrlEmbed]=useState(false);
  const [adminEmail,setAdminEmail]=useState('');
  const [chatOpen,setChatOpen]=useState(false);
  useEffect(()=>{
    queueMicrotask(()=>{
      const params=new URLSearchParams(window.location.search);
      setUrlEmbed(params.get('embed')==='1');
      setChatOpen(params.get('chatbot')==='1');
    });
  },[pathname]);
  useEffect(()=>{
    if(!chatOpen)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setChatOpen(false);};
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[chatOpen]);
  useEffect(()=>{
    if(!isAdmin)return;
    let active=true;
    void supabase().auth.getUser().then(({data,error})=>{
      if(active&&!error)setAdminEmail(data.user?.email||'');
    }).catch(()=>{});
    return()=>{active=false;};
  },[isAdmin]);
  const embedMode=embed||urlEmbed;
  const suffix=embedMode?'?embed=1':'';
  const studentLinks=[
    {href:'/siswa',label:'Beranda',icon:LayoutDashboard},
    {href:'/siswa/riwayat',label:'Riwayat',icon:History},
    {href:'/siswa/peringkat',label:'Peringkat',icon:Trophy},
    {href:'/siswa/profil',label:'Profil',icon:UserRound},
    {href:'/siswa/notifikasi',label:'Notifikasi',icon:Bell}
  ];
  const adminLinks=[
    {href:'/admin',label:'Ringkasan sekolah',icon:LayoutDashboard},
    {href:'/admin/siswa',label:'Data siswa',icon:Users},
    {href:'/admin/kelas',label:'Kelas & jurusan',icon:School2},
    {href:'/admin/bank-soal',label:'Bank soal',icon:BookOpen},
    {href:'/admin/monitoring',label:'Monitoring nilai',icon:CheckCircle2},
    {href:'/admin/analitik',label:'Analitik',icon:BarChart3},
    {href:'/admin/logs',label:'Log aktivitas',icon:ScrollText},
    {href:'/admin/pengaturan',label:'Pengaturan',icon:Settings}
  ];
  const items=isAdmin?adminLinks:studentLinks;
  function askBeforeLeave(e:React.MouseEvent<HTMLAnchorElement>) {
    if(navigationBlocked&&!window.confirm('Keluar dari layar latihan? Sesi yang sedang berlangsung belum selesai.')) e.preventDefault();
  }
  const active=(href:string)=>href.includes('#')?false:pathname===href;
  const linkTo=(href:string)=>href.includes('#')?(embedMode?href.replace('#','?embed=1#'):href):href+suffix;
  return <div className={'shell school-shell '+(embedMode?'shell-embed ':'')+(isAdmin?'admin-shell ':'student-shell ')+(quizFocusMode&&!isAdmin?'quiz-focus-mode ':'')+(dashboardStyle?'admin-overview-shell':'')}>
    <aside className="sidebar" aria-label={isAdmin?'Menu admin':'Menu siswa'}>
      <Link onClick={askBeforeLeave} href="/" className="brand"><span className="brand-mark">V</span><span>VOKASI<span className="brand-dot">.</span></span></Link>
      <div className="side-label">{isAdmin?'PANEL SEKOLAH':'RUANG BELAJAR'}</div>
      <nav className="side-menu" aria-label="Navigasi dashboard">
        {items.map(({href,label,icon:Icon})=><Link key={href} onClick={askBeforeLeave} href={linkTo(href)} aria-current={active(href)?'page':undefined} className={'side-link '+(active(href)?'selected':'')}>
          <Icon size={19}/><span>{label}</span></Link>)}
      </nav>
      {!isAdmin&&<div className="side-bottom">
        <div className="side-user"><StudentAvatar className="user-badge" name={displayName} url={studentAvatarUrl} size={48}/><span><b>{displayName}</b><small>Siswa VOKASI</small></span></div>
        <button type="button" onClick={onLogout} className="side-link signout"><LogOut size={18}/><span>Keluar akun</span></button>
      </div>}
    </aside>
    <div className="shell-main">
      {embedMode&&!navigationBlocked&&<nav className="embed-shortcuts" aria-label="Menu VOKASI dalam website sekolah">{items.map(({href,label})=><Link key={href} href={linkTo(href)} className={active(href)?'active':''}>{label}</Link>)}</nav>}
      <header className="topbar">
        <div><span className="topbar-title">{isAdmin?(pathname==='/admin/pengaturan'?'Pengaturan Admin':pathname==='/admin/siswa'?'Data Siswa':pathname==='/admin/logs'?'Log Aktivitas':'Dashboard Admin'):pathname.endsWith('/riwayat')?'Riwayat Latihan':pathname.endsWith('/peringkat')?'Peringkat Siswa':pathname.endsWith('/profil')?'Profil Siswa':pathname.endsWith('/notifikasi')?'Notifikasi Siswa':'Dashboard Siswa'}</span><small>SMK Negeri 1 Singosari</small></div>
        <div className="top-actions">
          {isAdmin?<div className="admin-header-actions">
            <AdminNotificationBell/>
            <div className="admin-header-account" aria-label="Akun admin yang sedang masuk">
              <span className="admin-header-avatar"><ShieldCheck size={19}/></span>
              <span className="admin-header-identity"><strong>{adminEmail||displayName}</strong><small>Administrator · Aktif</small></span>
            </div>
          </div>:<div className="student-header-actions">
            <Link className="student-header-bell" title="Pemberitahuan siswa" aria-label="Buka pemberitahuan siswa" href={linkTo('/siswa/notifikasi')}><Bell size={19}/></Link>
            <div className="student-header-account" aria-label="Akun siswa yang sedang masuk">
              <StudentAvatar className="student-header-avatar" name={displayName} url={studentAvatarUrl} size={48}/>
              <span className="student-header-identity"><strong>{displayName}</strong><small>Siswa · SMK Negeri 1 Singosari</small></span>
            </div>
            <button type="button" className="top-logout student-header-logout" title="Keluar akun" onClick={onLogout}><LogOut size={16}/><span>Keluar</span></button>
          </div>}
        </div>
      </header>
      <div className="shell-body">{children}</div>
    </div>
    {!isAdmin&&!embedMode&&!navigationBlocked&&<nav className="student-bottom-nav" aria-label="Navigasi siswa seluler">
      {studentLinks.filter(item=>item.href!=='/siswa/notifikasi').map(({href,label,icon:Icon})=>
        <Link key={href} href={href} className={pathname===href?'active':''} aria-current={pathname===href?'page':undefined}><Icon size={21}/><span>{label}</span></Link>)}
    </nav>}
    {!isAdmin&&!navigationBlocked&&!quizFocusMode&&<button type="button" className={'vokasi-chatbot-fab '+(chatOpen?'is-open':'')} onClick={()=>setChatOpen(open=>!open)} aria-label={chatOpen?'Tutup Chatbot VOKASI':'Buka Chatbot VOKASI'} title={chatOpen?'Tutup Chatbot':'Chatbot VOKASI'} aria-expanded={chatOpen} aria-controls="vokasi-chatbot-dialog">
      {chatOpen?<X size={25} aria-hidden="true"/>:<MessageCircle size={27} strokeWidth={2.2} aria-hidden="true"/>}
      {!chatOpen&&<span className="vokasi-chatbot-fab-status" aria-hidden="true"/>}
      <span className="vokasi-chatbot-fab-tooltip" aria-hidden="true">{chatOpen?'Tutup chat':'Butuh bantuan?'}</span>
    </button>}
    {!isAdmin&&!navigationBlocked&&!quizFocusMode&&<div className="vokasi-chatbot-layer" hidden={!chatOpen}>
      <button type="button" className="vokasi-chatbot-backdrop" onClick={()=>setChatOpen(false)} aria-label="Tutup chatbot"/>
      <section id="vokasi-chatbot-dialog" className="vokasi-chatbot-dialog" role="dialog" aria-modal="true" aria-label="Chatbot VOKASI">
        <header className="vokasi-chatbot-dialog-header"><span className="vokasi-chatbot-dialog-mark"><Bot size={23}/></span><span><strong>Chatbot VOKASI</strong><small>Tanya materi dan panduan aplikasi</small></span><button type="button" className="vokasi-chatbot-close" onClick={()=>setChatOpen(false)} aria-label="Tutup chatbot"><X size={20}/></button></header>
        <StudentAssistant isOpen={chatOpen}/>
      </section>
    </div>}
    {isAdmin&&!embedMode&&!navigationBlocked&&<nav className="admin-bottom-nav" aria-label="Menu admin seluler">
      {adminLinks.filter(item=>['/admin','/admin/siswa','/admin/kelas','/admin/analitik','/admin/pengaturan'].includes(item.href)).map(({href,label,icon:Icon})=><Link key={href} href={linkTo(href)} className={pathname===href?'active':''} aria-current={pathname===href?'page':undefined}>
        <Icon size={20}/><span>{label}</span>
      </Link>)}
    </nav>}
  </div>;
}
