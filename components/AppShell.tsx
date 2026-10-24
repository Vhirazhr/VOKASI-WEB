'use client';
import Link from 'next/link';
import { BookOpen,ChartColumnIncreasing,GraduationCap,LogOut,LayoutDashboard,ShieldCheck } from 'lucide-react';
import type {ReactNode} from 'react';

export default function AppShell({children,role,onLogout,displayName,embed=false}:{children:ReactNode;role:'student'|'admin';onLogout:()=>void;displayName:string;embed?:boolean}){
 const isAdmin=role==='admin';
 return <div className={'shell '+(embed?'shell-embed':'')}>
   <aside className="sidebar"><Link href="/" className="brand"><span className="brand-mark">V</span><span>VOKASI<span className="brand-dot">.</span></span></Link>
    <div className="side-label">{isAdmin?'PANEL SEKOLAH':'AREA BELAJAR'}</div>
    <div className="side-menu"><div className="side-link selected">{isAdmin?<LayoutDashboard size={19}/>:<GraduationCap size={19}/>} {isAdmin?'Ringkasan sekolah':'Beranda belajar'}</div>
       <div className="side-link muted">{isAdmin?<ChartColumnIncreasing size={19}/>:<BookOpen size={19}/>} {isAdmin?'Nilai & statistik':'Latihan & hasil'}</div></div>
    <div className="side-bottom"><div className="side-user"><span className="user-badge">{displayName.slice(0,1).toUpperCase()||'V'}</span><span><b>{displayName}</b><small>{isAdmin?'Administrator':'Siswa VOKASI'}</small></span></div><button onClick={onLogout} className="side-link signout"><LogOut size={18}/> Keluar akun</button></div>
   </aside>
   <div className="shell-main"><header className="topbar"><div><span className="topbar-title">{isAdmin?'Dashboard Admin':'Dashboard Siswa'}</span><small>SMK Negeri 1 Singosari</small></div><div className="top-actions"><button className="top-logout" title="Keluar akun" onClick={onLogout}><LogOut size={16}/> Keluar</button><span className="topbar-tag">{isAdmin?<ShieldCheck size={15}/>:<GraduationCap size={15}/>} {isAdmin?'Admin':'Siswa'}</span></div></header>
    <div className="shell-body">{children}</div></div>
 </div>;
}
