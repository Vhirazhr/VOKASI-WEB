import Link from 'next/link';
import InteractiveLogo from '@/components/landing/InteractiveLogo';
import SchoolMark from '@/components/landing/SchoolMark';
import './landing-3d.css';

export default function Home() {
  return <main className="vkl3-page">
    <header className="vkl3-header">
      <Link href="/" className="vkl3-brand" aria-label="VOKASI — Beranda">
        <span className="vkl3-brand-logo"><SchoolMark compact /></span>
        <span>VOKASI<span className="vkl3-brand-dot">.</span></span>
      </Link>
      <Link href="/login?role=student" className="vkl3-login">Login <span aria-hidden="true">↗</span></Link>
    </header>
    <section className="vkl3-hero" aria-labelledby="vkl3-title">
      <div className="vkl3-copy">
        <p className="vkl3-eyebrow"><span aria-hidden="true" /> SMKN 1 SINGOSARI</p>
        <h1 id="vkl3-title">Selamat Datang<br />di <span>VOKASI</span></h1>
        <p className="vkl3-description">Platform Pembelajaran Numerasi<br />SMKN 1 Singosari</p>
        <div className="vkl3-actions">
          <Link href="/login?role=student" className="vkl3-primary">Mulai Belajar <span aria-hidden="true">↗</span></Link>
          <Link href="/login?role=admin" className="vkl3-admin">Masuk sebagai Admin <span aria-hidden="true">→</span></Link>
        </div>
      </div>
      <InteractiveLogo />
    </section>
    <footer className="vkl3-footer"><span>Belajar. Berlatih. Berkembang.</span><span>VOKASI / SMKN 1 Singosari</span></footer>
  </main>;
}
