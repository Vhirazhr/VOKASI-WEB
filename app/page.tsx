'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import {
  ArrowRight, ArrowUpRight, BookOpen, CalendarDays, ChartNoAxesCombined, CheckCircle2,
  ChevronDown, CircleCheck, Clock3, GraduationCap, LayoutDashboard, LockKeyhole, Menu,
  MonitorSmartphone, Play, School2, ShieldCheck, Sparkles, Target, Trophy, Users, X
} from 'lucide-react';
import './landing-premium.css';

const navigation = [
  { label: 'Fitur', href: '#fitur' },
  { label: 'Cara kerja', href: '#cara-kerja' },
  { label: 'Peringkat', href: '#peringkat' },
  { label: 'Untuk sekolah', href: '#sekolah' },
  { label: 'Bantuan', href: '#bantuan' }
];

const highlights = [
  { number: '500', unit: 'soal', label: 'Bank soal numerasi' },
  { number: '100', unit: 'soal', label: 'Setiap sesi wajib' },
  { number: '30', unit: 'menit', label: 'Batas waktu sesi' },
  { number: '4', unit: 'materi', label: 'Area latihan' }
];

const features = [
  { icon: BookOpen, tone: 'blue', label: 'Latihan yang fokus', description: 'Latihan numerasi terstruktur dengan pilihan jawaban dan batas waktu yang jelas.' },
  { icon: Target, tone: 'mint', label: 'Penilaian terukur', description: 'Hasil benar, salah, dan soal yang terlewat dirangkum dalam satu tampilan.' },
  { icon: ChartNoAxesCombined, tone: 'violet', label: 'Riwayat kemajuan', description: 'Siswa dapat meninjau perkembangan dari latihan yang sudah dikerjakan.' },
  { icon: Trophy, tone: 'amber', label: 'Peringkat berdasarkan nilai', description: 'Pencapaian akademik menjadi fokus utama, bukan sekadar poin aktivitas.' },
  { icon: MonitorSmartphone, tone: 'blue', label: 'Nyaman di setiap layar', description: 'Dirancang untuk browser HP, tablet, dan komputer sekolah.' },
  { icon: ShieldCheck, tone: 'mint', label: 'Panel sekolah', description: 'Admin mengelola pemantauan dan laporan dalam area yang terlindungi.' }
];

const steps = [
  { number: '01', icon: LockKeyhole, title: 'Masuk ke akun', detail: 'Gunakan akun siswa atau admin yang disediakan sekolah.' },
  { number: '02', icon: Play, title: 'Mulai latihan', detail: 'Kerjakan numerasi dengan alokasi waktu sesuai tingkat soal.' },
  { number: '03', icon: ChartNoAxesCombined, title: 'Lihat hasil', detail: 'Baca nilai, ringkasan jawaban, dan riwayat latihanmu.' },
  { number: '04', icon: Trophy, title: 'Terus berkembang', detail: 'Pantau performa dan posisi peringkat dari hasil belajar.' }
];

type PreviewTab = 'Dashboard' | 'Latihan' | 'Hasil';
type DemoClass = 'X' | 'XI';

const demoRankings: Record<DemoClass, { id: string; score: number; grade: string }[]> = {
  X: [
    { id: 'Siswa A', score: 95, grade: 'Kelas X' },
    { id: 'Siswa B', score: 92, grade: 'Kelas X' },
    { id: 'Siswa C', score: 89, grade: 'Kelas X' }
  ],
  XI: [
    { id: 'Siswa D', score: 96, grade: 'Kelas XI' },
    { id: 'Siswa E', score: 93, grade: 'Kelas XI' },
    { id: 'Siswa F', score: 88, grade: 'Kelas XI' }
  ]
};

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('Dashboard');
  const [demoClass, setDemoClass] = useState<DemoClass>('X');
  const winners = demoRankings[demoClass];
  const podium = [winners[1], winners[0], winners[2]];

  return (
    <main className="vok-site" id="beranda">
      <div className="vok-topline"><span className="vok-topline-pulse" /> RUANG BELAJAR DIGITAL UNTUK GENERASI VOKASI</div>
      <header className="vok-header">
        <nav className="vok-nav" aria-label="Navigasi utama">
          <Link className="vok-brand" href="/" aria-label="VOKASI — Beranda">
            <span className="vok-brand-mark vok-brand-school-logo"><Image src="/assets/smkn1sgs-166x166-1.png" alt="Logo SMKN 1 Singosari" width={166} height={166} unoptimized className="vok-school-logo-image"/></span><span>VOKASI<span className="vok-brand-dot">.</span></span>
          </Link>
          <div className="vok-nav-links">
            {navigation.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}
          </div>
          <div className="vok-nav-actions">
            <Link href="/login" className="vok-nav-signin">Masuk <ArrowUpRight size={16} /></Link>
            <button type="button" className="vok-nav-menu" aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'} aria-expanded={menuOpen} aria-controls="vok-mobile-navigation" onClick={() => setMenuOpen(v => !v)}>{menuOpen ? <X size={22}/> : <Menu size={22}/>}</button>
          </div>
        </nav>
        {menuOpen && <div id="vok-mobile-navigation" className="vok-mobile-navigation">
          {navigation.map(item => <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label} <ArrowUpRight size={16}/></a>)}
          <Link href="/login" onClick={() => setMenuOpen(false)}>Masuk ke VOKASI <ArrowRight size={16}/></Link>
        </div>}
      </header>

      <section className="vok-hero" aria-labelledby="vok-hero-title">
        <div className="vok-hero-mesh" aria-hidden="true" />
        <div className="vok-container vok-hero-grid">
          <div className="vok-hero-copy">
            <div className="vok-pill"><Sparkles size={14}/> BEYOND THE CLASSROOM <span>•</span> VOKASI WEB</div>
            <h1 id="vok-hero-title">Belajar lebih <em>cerdas.</em><br/>Berkembang lebih <em>jauh.</em></h1>
            <p>Ruang belajar numerasi yang menyatukan latihan interaktif, hasil terukur, dan pemantauan prestasi sekolah—dalam satu pengalaman digital.</p>
            <div className="vok-hero-actions">
              <Link className="vok-action vok-action-primary" href="/login">Mulai belajar <ArrowRight size={18}/></Link>
              <a className="vok-action vok-action-outline" href="#fitur">Jelajahi VOKASI <ArrowUpRight size={17}/></a>
            </div>
            <div className="vok-hero-proof"><span><CheckCircle2 size={17}/> Akses lewat browser</span><span><CheckCircle2 size={17}/> Untuk siswa & sekolah</span></div>
          </div>

          <div className="vok-hero-art" aria-label="Ilustrasi antarmuka VOKASI">
            <div className="vok-orbit vok-orbit-one" aria-hidden="true"/><div className="vok-orbit vok-orbit-two" aria-hidden="true"/>
            <div className="vok-3d-figure vok-3d-figure-one" aria-hidden="true">+</div>
            <div className="vok-3d-figure vok-3d-figure-two" aria-hidden="true">×</div>
            <div className="vok-3d-figure vok-3d-figure-three" aria-hidden="true">÷</div>
            <div className="vok-floating-label vok-floating-label-top"><span className="vok-float-icon"><GraduationCap size={19}/></span><span><b>Numerasi terarah</b><small>Belajar sesuai kemampuan</small></span></div>
            <div className="vok-hero-window">
              <div className="vok-window-toolbar"><span className="vok-window-dots"><i/><i/><i/></span><span>VOKASI / DASHBOARD</span><span className="vok-window-live">PREVIEW</span></div>
              <div className="vok-window-content">
                <div className="vok-window-welcome"><span className="vok-window-badge">RUANG BELAJAR</span><h3>Selamat datang di VOKASI.</h3><p>Satu langkah lebih dekat menuju potensi terbaikmu.</p><span className="vok-window-orb" aria-hidden="true"><BookOpen size={39}/></span></div>
                <div className="vok-window-metrics"><div><span>SESI WAJIB</span><strong>100 <small>soal</small></strong><p>Latihan terstruktur</p></div><div><span>WAKTU MAKSIMAL</span><strong>30 <small>menit</small></strong><p>Terukur & fokus</p></div></div>
                <div className="vok-window-performance"><div className="vok-window-performance-head"><b>Progress belajar</b><span>Ilustrasi</span></div><div className="vok-mini-bars">{[35,53,47,72,58,81,96].map((height,index)=><i key={index} style={{height:height+'%'}}/>)}</div></div>
              </div>
            </div>
            <div className="vok-floating-label vok-floating-label-bottom"><span className="vok-float-check"><CircleCheck size={22}/></span><span><b>Terus bertumbuh</b><small>Setiap usaha berarti</small></span></div>
          </div>
        </div>
        <div className="vok-hero-rail" aria-hidden="true"><span>EXPLORE THE EXPERIENCE</span><span className="vok-rail-line"/><span>01 / 05</span></div>
      </section>

      <section className="vok-facts" aria-label="Fakta tentang latihan VOKASI">
        <div className="vok-container vok-facts-grid">
          {highlights.map(item => <div className="vok-fact" key={item.label}><strong>{item.number}<small> {item.unit}</small></strong><span>{item.label}</span></div>)}
        </div>
      </section>

      <section id="fitur" className="vok-section vok-features-section" aria-labelledby="vok-features-title">
        <div className="vok-container">
          <div className="vok-section-intro"><span className="vok-kicker">01 / KENALI VOKASI</span><h2 id="vok-features-title">Bukan sekadar mengerjakan soal.<br/><span>Ini tentang bertumbuh.</span></h2><p>Setiap fitur dirancang untuk membuat proses latihan lebih mudah dipahami, terukur, dan menyenangkan tanpa kehilangan fokus belajar.</p></div>
          <div className="vok-features-grid">
            {features.map((item,index) => { const Icon=item.icon; return <article className="vok-feature-card" key={item.label}>
              <div className="vok-feature-top"><span className={'vok-feature-icon vok-tone-'+item.tone}><Icon size={23}/></span><span className="vok-feature-index">0{index+1}</span></div>
              <h3>{item.label}</h3><p>{item.description}</p><span className="vok-feature-line" aria-hidden="true"/>
            </article>; })}
          </div>
        </div>
      </section>

      <section id="cara-kerja" className="vok-section vok-how-section" aria-labelledby="vok-how-title">
        <div className="vok-container">
          <div className="vok-section-intro vok-section-intro-center"><span className="vok-kicker">02 / MUDAH DIMULAI</span><h2 id="vok-how-title">Empat langkah menuju <span>kemajuan.</span></h2><p>Tidak rumit. Masuk, kerjakan, lihat hasilnya, lalu lanjutkan belajar dengan lebih percaya diri.</p></div>
          <div className="vok-steps">
            {steps.map((step,index) => {const Icon=step.icon; return <div className="vok-step" key={step.number}><div className="vok-step-icon"><Icon size={24}/></div><div className="vok-step-number">STEP {step.number}</div><h3>{step.title}</h3><p>{step.detail}</p>{index<steps.length-1&&<span className="vok-step-arrow" aria-hidden="true"><ArrowRight size={19}/></span>}</div>;})}
          </div>
          <div className="vok-how-note"><Clock3 size={17}/> Satu sesi latihan wajib terdiri dari 100 soal dengan batas keseluruhan maksimal 30 menit.</div>
        </div>
      </section>

      <section className="vok-section vok-showcase-section" aria-labelledby="vok-showcase-title">
        <div className="vok-container vok-showcase-grid">
          <div className="vok-showcase-copy"><span className="vok-kicker">03 / PENGALAMAN BELAJAR</span><h2 id="vok-showcase-title">Satu dashboard.<br/><span>Banyak pencapaian.</span></h2><p>Dari memulai latihan hingga melihat hasil, semuanya hadir dalam tampilan yang sederhana, cepat, dan nyaman dipakai setiap hari.</p>
            <ul className="vok-check-list"><li><CheckCircle2 size={18}/> Tampilan nyaman di HP maupun komputer</li><li><CheckCircle2 size={18}/> Rekap hasil yang mudah dipahami</li><li><CheckCircle2 size={18}/> Progres belajar tetap menjadi fokus</li></ul>
            <Link href="/login" className="vok-inline-link">Lihat dashboard siswa <ArrowUpRight size={18}/></Link>
          </div>
          <div className="vok-showcase-screen">
            <div className="vok-showcase-head"><span className="vok-screen-logo"><Image src="/assets/smkn1sgs-166x166-1.png" alt="Logo SMKN 1 Singosari" width={166} height={166} unoptimized className="vok-school-logo-image"/></span><div className="vok-showcase-tabs" role="group" aria-label="Pilihan preview dashboard">{(['Dashboard','Latihan','Hasil'] as PreviewTab[]).map(tab=><button key={tab} type="button" aria-pressed={previewTab===tab} className={previewTab===tab?'active':''} onClick={()=>setPreviewTab(tab)}>{tab}</button>)}</div></div>
            <div className="vok-showcase-body" key={previewTab}>
              {previewTab==='Dashboard'&&<><div className="vok-demo-greet"><span>HALO, SISWA VOKASI!</span><h3>Siap berkembang hari ini?</h3><p>Ayo lanjutkan perjalanan belajarmu.</p></div><div className="vok-demo-double"><div><small>LATIHAN WAJIB</small><strong>100 soal</strong><p>Waktu maksimal 30 menit</p></div><div><small>PROGRES BELAJAR</small><strong>4 materi</strong><p>Perkalian hingga konversi</p></div></div><div className="vok-demo-row"><span>Mulai latihan numerasi</span><span><ArrowRight size={17}/></span></div></>}
              {previewTab==='Latihan'&&<><div className="vok-demo-quiz-head"><span>CONTOH TAMPILAN SOAL</span><span>01 / 100</span></div><div className="vok-demo-quiz-progress"><i/></div><h3 className="vok-demo-question">Berapakah hasil dari 12 × 8?</h3><div className="vok-demo-choices"><span>A. 86</span><span className="selected">B. 96</span><span>C. 108</span><span>D. 112</span></div><p className="vok-demo-caption">Simulasi tampilan, bukan sesi ujian yang aktif.</p></>}
              {previewTab==='Hasil'&&<><div className="vok-demo-results"><span className="vok-demo-result-ring">85<small>/100</small></span><div><span>CONTOH HASIL BELAJAR</span><h3>Terus tingkatkan kemampuanmu.</h3><p>Rangkuman hasil latihan membantu kamu memahami langkah berikutnya.</p></div></div><div className="vok-demo-double"><div><small>JAWABAN BENAR</small><strong>85 soal</strong><p>Ilustrasi hasil</p></div><div><small>PERLU EVALUASI</small><strong>15 soal</strong><p>Ilustrasi hasil</p></div></div></>}
            </div>
            <div className="vok-demo-disclaimer">Preview interaktif · Seluruh angka contoh bukan nilai siswa asli</div>
          </div>
        </div>
      </section>

      <section id="peringkat" className="vok-section vok-ranking-section" aria-labelledby="vok-ranking-title">
        <div className="vok-container">
          <div className="vok-ranking-top"><div><span className="vok-kicker">04 / HALL OF ACHIEVEMENT</span><h2 id="vok-ranking-title">Setiap usaha layak <span>diapresiasi.</span></h2><p>Peringkat VOKASI menonjolkan hasil latihan, bukan jumlah XP. Tampilan berikut adalah contoh anonim untuk memperkenalkan fitur.</p></div><div className="vok-demo-filter"><label htmlFor="vok-class-demo">Contoh peringkat</label><select id="vok-class-demo" value={demoClass} onChange={e=>setDemoClass(e.target.value as DemoClass)}><option value="X">Simulasi kelas X</option><option value="XI">Simulasi kelas XI</option></select></div></div>
          <div className="vok-ranking-note"><ShieldCheck size={17}/> DEMO / ILUSTRASI — Tidak menampilkan nama, kelas spesifik, atau nilai siswa sesungguhnya.</div>
          <div className="vok-podium">
            {podium.map((winner,index)=>{const rank=index===0?2:index===1?1:3;return <div className={'vok-podium-card vok-podium-'+rank} key={winner.id}>
              <div className="vok-podium-medal"><Trophy size={rank===1?28:24}/></div>
              <div className="vok-podium-avatar">{winner.id.slice(-1)}</div><span className="vok-podium-rank">PERINGKAT {rank}</span><h3>{winner.id}</h3><p>{winner.grade} · Data contoh</p><strong>{winner.score}<small> /100</small></strong><div className="vok-podium-base">#{rank}</div>
            </div>;})}
          </div>
          <div className="vok-ranking-bottom"><div><b>Prestasi siswa, dengan privasi tetap terjaga.</b><p>Peringkat aktual hanya dapat diakses sesuai izin akun dan kebijakan sekolah.</p></div><Link href="/login" className="vok-action vok-action-dark">Lihat peringkat setelah masuk <ArrowRight size={17}/></Link></div>
        </div>
      </section>

      <section id="sekolah" className="vok-section vok-school-section" aria-labelledby="vok-school-title">
        <div className="vok-container vok-school-grid">
          <div className="vok-school-copy"><span className="vok-kicker">05 / UNTUK SEKOLAH</span><h2 id="vok-school-title">Sekolah punya kendali.<br/><span>Siswa punya arah.</span></h2><p>Halaman administrasi membantu sekolah meninjau aktivitas latihan, menyaring hasil berdasarkan tanggal dan kelas, serta mengunduh laporan sesuai data yang tersedia.</p>
            <div className="vok-school-benefits"><span><Users size={18}/> Pantau hasil per kelas</span><span><CalendarDays size={18}/> Filter laporan berdasarkan tanggal</span><span><LayoutDashboard size={18}/> Data dalam satu panel</span></div>
            <Link href="/login?role=admin" className="vok-action vok-action-primary">Masuk sebagai admin <ArrowRight size={18}/></Link>
          </div>
          <div className="vok-school-preview"><div className="vok-school-head"><span className="vok-school-icon"><School2 size={18}/></span><div><b>Panel monitoring</b><small>Preview antarmuka admin</small></div><span className="vok-school-demo-badge">ILUSTRASI</span></div><div className="vok-school-preview-inner"><div className="vok-school-summary"><div><small>FILTER DATA</small><strong>Per kelas & tanggal</strong></div><span><CalendarDays size={19}/></span></div><div className="vok-school-table"><div className="vok-school-table-head"><span>Data siswa</span><span>Nilai</span><span>Status</span></div>{[{name:'Siswa A',score:'95',state:'Selesai'},{name:'Siswa B',score:'82',state:'Selesai'},{name:'Siswa C',score:'—',state:'Belum'}].map(row=><div className="vok-school-table-row" key={row.name}><span><i className="vok-student-dot"/>{row.name}</span><b>{row.score}</b><small className={row.state==='Selesai'?'vok-state-done':'vok-state-pending'}>{row.state}</small></div>)}</div><div className="vok-school-download"><span>Contoh tata letak laporan harian</span><span>Excel (.xlsx) <ArrowUpRight size={14}/></span></div></div></div>
        </div>
      </section>

      <section id="bantuan" className="vok-section vok-faq-section" aria-labelledby="vok-faq-title"><div className="vok-container vok-faq-grid"><div><span className="vok-kicker">PUNYA PERTANYAAN?</span><h2 id="vok-faq-title">Hal kecil yang sering <span>ditanyakan.</span></h2><p>Penjelasan singkat sebelum mulai menggunakan platform.</p></div><div className="vok-faq-items">
        <details><summary>Apa itu VOKASI?<ChevronDown size={20}/></summary><p>VOKASI adalah platform latihan numerasi dan pemantauan hasil belajar berbasis web untuk siswa dan administrasi sekolah.</p></details>
        <details><summary>Bagaimana cara masuk?<ChevronDown size={20}/></summary><p>Gunakan akun yang telah diberikan oleh sekolah. Akses siswa dan admin memiliki izin yang berbeda.</p></details>
        <details><summary>Berapa lama latihan wajib berlangsung?<ChevronDown size={20}/></summary><p>Setiap sesi berisi 100 soal, dengan batas keseluruhan maksimal 30 menit serta alokasi waktu per soal.</p></details>
        <details><summary>Apakah peringkat didasarkan pada XP?<ChevronDown size={20}/></summary><p>Tidak. Peringkat akademik ditampilkan berdasarkan nilai latihan. XP adalah elemen gamifikasi tambahan, bukan penentu utama peringkat.</p></details>
        <details><summary>Apakah siswa harus memasang aplikasi?<ChevronDown size={20}/></summary><p>Tidak. VOKASI Web dapat digunakan melalui browser HP, tablet, atau laptop dengan koneksi internet.</p></details>
      </div></div></section>

      <section className="vok-final-section"><div className="vok-container"><div className="vok-final-card"><div className="vok-final-decoration" aria-hidden="true"/><span className="vok-final-label"><Sparkles size={15}/> WAKTUNYA BERKEMBANG</span><h2>Potensi besar dimulai<br/>dari satu langkah.</h2><p>Jadikan setiap latihan sebagai kesempatan untuk belajar lebih baik hari ini.</p><Link href="/login" className="vok-action vok-action-light">Masuk ke VOKASI <ArrowRight size={19}/></Link></div></div></section>

      <footer className="vok-footer"><div className="vok-container vok-footer-main"><div><Link className="vok-brand" href="/"><span className="vok-brand-mark vok-brand-school-logo"><Image src="/assets/smkn1sgs-166x166-1.png" alt="Logo SMKN 1 Singosari" width={166} height={166} unoptimized className="vok-school-logo-image"/></span><span>VOKASI<span className="vok-brand-dot">.</span></span></Link><p>Platform belajar numerasi dan pemantauan perkembangan untuk generasi vokasi.</p></div><div className="vok-footer-links"><a href="#fitur">Fitur</a><a href="#peringkat">Peringkat</a><a href="#sekolah">Untuk sekolah</a><a href="#bantuan">Bantuan</a><Link href="/login">Masuk</Link></div></div><div className="vok-container vok-footer-bottom"><span>© 2026 VOKASI. Belajar • Berlatih • Berkembang.</span><span>Dirancang untuk pengalaman belajar yang lebih baik.</span></div></footer>
    </main>
  );
}