'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowLeft,ArrowRight,BookOpen,Eye,EyeOff,LockKeyhole,ShieldCheck,UserRound} from 'lucide-react';
import {configured} from '@/lib/supabase';
import {signIn,currentRole} from '@/lib/auth';
import type {UserRole} from '@/lib/types';

export default function LoginPage(){
  const router=useRouter();const [role,setRole]=useState<UserRole>('student');const [embed,setEmbed]=useState(false);
  const [identity,setIdentity]=useState('');const [password,setPassword]=useState('');const [visible,setVisible]=useState(false);
  const [pending,setPending]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{
    const qs=new URLSearchParams(window.location.search);
    queueMicrotask(()=>{setRole(qs.get('role')==='admin'?'admin':'student');setEmbed(qs.get('embed')==='1');});
    if(configured()){void currentRole().then(s=>{if(s) router.replace((s.role==='admin'?'/admin':'/siswa')+(qs.get('embed')==='1'?'?embed=1':''));}).catch(()=>{});}
  },[router]);
  async function submit(e:React.FormEvent){e.preventDefault();setError('');setPending(true);
    try{await signIn(identity,password,role);router.replace((role==='admin'?'/admin':'/siswa')+(embed?'?embed=1':''));}
    catch(e){setError(e instanceof Error?e.message:'Login gagal.');}finally{setPending(false);}
  }
  return <div className={'login-page '+(embed?'login-embedded':'')}><section className="login-aside"><Link href="/" className="brand"><span className="brand-mark">V</span><span>VOKASI<span className="brand-dot">.</span></span></Link>
    <div className="login-aside-inner"><div className="login-emblem"><BookOpen size={39}/></div><h1>Ruang belajar<br/>untuk masa depan.</h1><p>Belajar numerasi, tingkatkan kemampuan, dan pantau perkembanganmu dalam satu tempat.</p><span>VOKASI LEARNING PLATFORM • 2026/2027</span></div></section>
    <main className="login-main"><div className="login-card"><Link className="back-link" href="/"><ArrowLeft size={15}/> Kembali ke beranda</Link>
      <div className="login-mobile-brand brand"><span className="brand-mark">V</span> VOKASI.</div>
      <div className="login-intro"><span className="login-kicker">SELAMAT DATANG KEMBALI</span><h2>Masuk ke akunmu<span className="accent-dot">.</span></h2><p>Pilih akses yang sesuai untuk melanjutkan.</p></div>
      <div className="role-switch"><button type="button" className={role==='student'?'active':''} onClick={()=>{setRole('student');setError('');}}><UserRound size={18}/> Siswa</button><button type="button" className={role==='admin'?'active':''} onClick={()=>{setRole('admin');setError('');}}><ShieldCheck size={18}/> Admin</button></div>
      {!configured()&&<div className="alert danger">Supabase belum disetel. Isi <code>.env.local</code> sesuai README sebelum login.</div>}
      <form onSubmit={submit} className="login-form"><label>{role==='student'?'Nama lengkap / username':'Email admin'}<div className="input-icon"><UserRound size={18}/><input value={identity} onChange={e=>setIdentity(e.target.value)} required autoComplete="username" placeholder={role==='student'?'Masukkan nama lengkapmu':'nama@sekolah.sch.id'}/></div></label>
      {role==='student'&&<p className="form-help">Jika nama sama dengan siswa lain: <b>Nama Lengkap | Kelas</b></p>}
      <label>Password<div className="input-icon"><LockKeyhole size={18}/><input value={password} onChange={e=>setPassword(e.target.value)} type={visible?'text':'password'} required autoComplete="current-password" placeholder="Masukkan password"/><button type="button" className="reveal" aria-label={visible?'Sembunyikan password':'Lihat password'} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
      {error&&<div className="alert danger" role="alert">{error}</div>}
      <button className="btn primary login-submit" type="submit" disabled={pending||!configured()}>{pending?'Memeriksa akun...':'Masuk ke VOKASI'} <ArrowRight size={18}/></button></form>
      <p className="login-note">Akun siswa dikelola sekolah. Hubungi admin jika mengalami kendala masuk.</p>
    </div></main>
  </div>;
}
