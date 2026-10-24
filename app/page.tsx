import Link from 'next/link';
import { ArrowRight, BookOpen, ChartNoAxesCombined, ShieldCheck, CheckCircle2, PlayCircle, MonitorSmartphone } from 'lucide-react';

export default function Home() {
  return <main className="landing">
    <nav className="land-nav"><div className="brand"><span className="brand-mark">V</span><span>VOKASI<span className="brand-dot">.</span></span></div>
      <Link href="/login" className="nav-login">Masuk <ArrowRight size={16}/></Link></nav>
    <section className="hero">
      <div className="hero-left">
        <div className="eyebrow"><span className="pulse"/> PLATFORM BELAJAR DIGITAL • 2026/2027</div>
        <h1>Belajar lebih <span className="gradient-text">cerdas.</span><br/>Hasil lebih <span className="gradient-text">nyata.</span></h1>
        <p>Latihan numerasi untuk siswa vokasi, pantauan perkembangan nilai secara langsung, dan dashboard sekolah—semuanya dalam satu website.</p>
        <div className="hero-actions"><Link className="btn primary" href="/login">Mulai belajar <ArrowRight size={18}/></Link><Link className="btn ghost" href="/login?role=admin">Panel admin <ShieldCheck size={17}/></Link></div>
        <div className="hero-mini"><span><CheckCircle2 size={16}/> Bisa di HP & laptop</span><span><CheckCircle2 size={16}/> Terhubung Supabase</span></div>
      </div>
      <div className="hero-preview"><div className="halo halo-one"/><div className="halo halo-two"/>
        <div className="preview-browser"><div className="preview-header"><div className="dots"><i/><i/><i/></div><span>vokasi / dashboard</span><span className="status-dot"/></div>
          <div className="preview-content"><div className="preview-greet"><div><small>SELAMAT DATANG DI VOKASI</small><h3>Siap berkembang hari ini?</h3><p>Latihan sedikit demi sedikit. Hasil terus meningkat.</p></div><div className="preview-illustration"><BookOpen size={54}/></div></div>
            <div className="preview-metrics"><div><small>LATIHAN WAJIB</small><b>100 <em>soal</em></b><span>Per sesi</span></div><div><small>DURASI LATIHAN</small><b>30 <em>menit</em></b><span>Waktu terukur</span></div></div>
            <div className="preview-chart"><span>Perjalanan belajarmu</span><div className="chart-bars">{[42,56,50,72,68,85,92].map((h,i)=><i key={i} style={{height:`${h}%`}} />)}</div></div>
          </div></div><div className="floating-note"><div className="floating-icon"><ChartNoAxesCombined size={18}/></div><div><b>Nilai tercatat</b><small>Tersinkron dengan sekolah</small></div></div>
      </div>
    </section>
    <section className="feature-section"><div className="feature-heading"><small>DIRANCANG UNTUK SEKOLAH</small><h2>Satu platform. Banyak kemudahan.</h2></div><div className="features">
      <div className="feature"><span className="feature-icon blue"><BookOpen/></span><h3>Latihan interaktif</h3><p>100 soal latihan wajib dengan timer serta latihan tambahan yang lebih singkat.</p></div>
      <div className="feature"><span className="feature-icon purple"><ChartNoAxesCombined/></span><h3>Nilai transparan</h3><p>Hasil belajar tersimpan di akun siswa dan dipantau oleh admin sekolah.</p></div>
      <div className="feature"><span className="feature-icon green"><MonitorSmartphone/></span><h3>Website responsif</h3><p>Akses dari laptop, tablet, atau smartphone tanpa instal APK.</p></div>
    </div></section><footer className="footer">© 2026 VOKASI • Platform Pembelajaran Vokasi <span>Versi web</span></footer>
  </main>;
}
