'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, ChartColumnIncreasing, GraduationCap, History, LayoutDashboard, LogOut, ShieldCheck, Trophy, UserRound, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import '@/app/school-shell.css';

type ShellProps = {
  children: ReactNode;
  role: 'student' | 'admin';
  onLogout: () => void;
  displayName: string;
  embed?: boolean;
  navigationBlocked?: boolean;
};

export default function AppShell({children,role,onLogout,displayName,embed=false,navigationBlocked=false}:ShellProps) {
  const isAdmin=role==='admin';
  const pathname=usePathname();
  const suffix=embed?'?embed=1':'';
  const studentLinks=[
    {href:'/siswa',label:'Beranda',icon:LayoutDashboard},
    {href:'/siswa/riwayat',label:'Riwayat',icon:History},
    {href:'/siswa/peringkat',label:'Peringkat',icon:Trophy},
    {href:'/siswa/profil',label:'Profil',icon:UserRound}
  ];
  const adminLinks=[
    {href:'/admin',label:'Ringkasan sekolah',icon:LayoutDashboard},
    {href:'/admin#hasil',label:'Nilai & laporan',icon:ChartColumnIncreasing},
    {href:'/admin#siswa',label:'Data siswa',icon:Users}
  ];
  const items=isAdmin?adminLinks:studentLinks;
  function askBeforeLeave(e:React.MouseEvent<HTMLAnchorElement>) {
    if(navigationBlocked&&!window.confirm('Keluar dari layar latihan? Sesi yang sedang berlangsung belum selesai.')) e.preventDefault();
  }
  const active=(href:string)=>href.startsWith('/admin')?pathname==='/admin':pathname===href;
  return <div className={'shell school-shell '+(embed?'shell-embed':'')}>
    <aside className="sidebar" aria-label={isAdmin?'Menu admin':'Menu siswa'}>
      <Link onClick={askBeforeLeave} href="/" className="brand"><span className="brand-mark">V</span><span>VOKASI<span className="brand-dot">.</span></span></Link>
      <div className="side-label">{isAdmin?'PANEL SEKOLAH':'AREA BELAJAR'}</div>
      <nav className="side-menu" aria-label="Navigasi dashboard">
        {items.map(({href,label,icon:Icon})=><Link key={href} onClick={askBeforeLeave} href={href+(href.includes('#')?'':suffix)} aria-current={active(href)&&!href.includes('#')?'page':undefined} className={'side-link '+(active(href)&&!href.includes('#')?'selected':'')}>
          <Icon size={19}/><span>{label}</span>
        </Link>)}
      </nav>
      <div className="side-bottom">
        <div className="side-user"><span className="user-badge">{displayName.slice(0,1).toUpperCase()||'V'}</span><span><b>{displayName}</b><small>{isAdmin?'Administrator':'Siswa VOKASI'}</small></span></div>
        <button type="button" onClick={onLogout} className="side-link signout"><LogOut size={18}/><span>Keluar akun</span></button>
      </div>
    </aside>
    <div className="shell-main">
      <header className="topbar">
        <div><span className="topbar-title">{isAdmin?'Dashboard Admin':pathname.endsWith('/riwayat')?'Riwayat Latihan':pathname.endsWith('/peringkat')?'Peringkat Siswa':pathname.endsWith('/profil')?'Profil Siswa':'Dashboard Siswa'}</span><small>SMK Negeri 1 Singosari</small></div>
        <div className="top-actions">
          <button type="button" className="top-logout" title="Keluar akun" onClick={onLogout}><LogOut size={16}/> Keluar</button>
          <span className="topbar-tag">{isAdmin?<ShieldCheck size={15}/>:<GraduationCap size={15}/>} {isAdmin?'Admin':'Siswa'}</span>
        </div>
      </header>
      <div className="shell-body">{children}</div>
    </div>
    {!isAdmin&&!embed&&!navigationBlocked&&<nav className="student-bottom-nav" aria-label="Navigasi siswa seluler">
      {studentLinks.map(({href,label,icon:Icon})=><Link key={href} href={href} className={pathname===href?'active':''} aria-current={pathname===href?'page':undefined}>
        <Icon size={21}/><span>{label}</span>
      </Link>)}
    </nav>}
  </div>;
}