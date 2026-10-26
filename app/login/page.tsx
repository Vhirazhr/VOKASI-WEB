'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {useRouter} from 'next/navigation';
import {ArrowRight,Eye,EyeOff,LockKeyhole,ShieldCheck,UserRound} from 'lucide-react';
import {configured} from '@/lib/supabase';
import {signIn,currentRole} from '@/lib/auth';
import type {UserRole} from '@/lib/types';
import '@/app/login-visual.css';

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
  return <div className={'login-page login-photo '+(embed?'login-embedded':'')}>
    <div className="login-photo-overlay" aria-hidden="true"/>
    <header className="login-photo-header">
      <Link href="/" className="login-photo-brand" aria-label="VOKASI - Beranda">
        <span className="login-photo-brand-mark"><Image src="/assets/smkn1sgs-166x166-1.png" alt="Logo resmi SMKN 1 Singosari" width={166} height={159} unoptimized priority className="login-photo-brand-logo-image"/></span>
        <span><strong>VOKASI</strong><small>LEARNING PLATFORM</small></span>
      </Link>
    </header>

    <section className="login-photo-copy" aria-label="Tentang VOKASI">
      <span className="login-photo-eyebrow">SMKN 1 SINGOSARI</span>
      <h1>Belajar<br/><span>lebih mudah</span></h1>
      <p>Platform pembelajaran digital<br/>untuk siswa dan admin sekolah.</p>
    </section>

    <main className="login-photo-main">
      <div className="login-photo-card">
        <h2>Selamat Datang!</h2>
        <div className="login-photo-tabs" role="group" aria-label="Pilih jenis akun">
          <button type="button" aria-pressed={role==='student'} className={role==='student'?'active':''} onClick={()=>{setRole('student');setError('');}}><UserRound size={23}/> Siswa</button>
          <button type="button" aria-pressed={role==='admin'} className={role==='admin'?'active':''} onClick={()=>{setRole('admin');setError('');}}><ShieldCheck size={23}/> Admin</button>
        </div>
        {!configured()&&<div className="alert danger" role="alert">Supabase belum disetel. Isi <code>.env.local</code> terlebih dahulu.</div>}
        <form onSubmit={submit} className="login-photo-form">
          <label htmlFor="vokasi-login-identity">{role==='student'?'Username':'Email Admin'}</label>
          <div className="login-photo-field">
            <UserRound size={23} aria-hidden="true"/>
            <input id="vokasi-login-identity" value={identity} onChange={e=>setIdentity(e.target.value)} required autoComplete="username" placeholder={role==='student'?'Nama lengkap atau username':'Email admin sekolah'} />
          </div>
          {role==='student'&&<p className="login-photo-help">Jika nama sama, gunakan format <b>Nama Lengkap | Kelas</b>.</p>}
          <label htmlFor="vokasi-login-password">Password</label>
          <div className="login-photo-field">
            <LockKeyhole size={22} aria-hidden="true"/>
            <input id="vokasi-login-password" value={password} onChange={e=>setPassword(e.target.value)} type={visible?'text':'password'} required autoComplete="current-password" placeholder="Masukkan password"/>
            <button type="button" className="login-photo-reveal" aria-label={visible?'Sembunyikan password':'Lihat password'} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={23}/>:<Eye size={23}/>}</button>
          </div>
          {error&&<div className="alert danger" role="alert">{error}</div>}
          <button className="login-photo-submit" type="submit" disabled={pending||!configured()}>
            {pending?'Memeriksa akun...':'Masuk'} <ArrowRight size={23}/>
          </button>
        </form>
        {embed&&<div className="alert info" role="note"><b>Login di website sekolah bermasalah?</b> Sebagian browser membatasi login melalui iframe. <a href={'/login?role='+role} target="_blank" rel="noopener noreferrer">Buka di tab baru.</a></div>}
        <div className="login-photo-footer"><span>Akun dikelola oleh sekolah</span></div>
      </div>
    </main>
  </div>;
}
