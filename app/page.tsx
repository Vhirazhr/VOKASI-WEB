import Link from 'next/link';
import InteractiveLogo from '@/components/landing/InteractiveLogo';
import SchoolMark from '@/components/landing/SchoolMark';
import LandingRanking from '@/components/landing/LandingRanking';
import './landing-3d.css';

const questions = [
  ['Apa itu VOKASI?', 'VOKASI adalah platform pembelajaran numerasi untuk siswa SMKN 1 Singosari. Siswa dapat berlatih soal, melihat hasil, dan mengikuti perkembangan belajarnya.'],
  ['Bagaimana cara mulai belajar?', 'Pilih Mulai Belajar, lalu masuk melalui halaman login siswa menggunakan akun yang sudah terdaftar. Setelah masuk, latihan tersedia di dashboard siswa.'],
  ['Bagaimana peringkat dihitung?', 'Peringkat mengikuti nilai rata-rata latihan wajib yang terverifikasi pada sistem sekolah, dari yang tertinggi. XP bukan dasar pemeringkatan. Masuk untuk melihat nama dan nilai siswa.'],
  ['Di mana saya melihat hasil latihan?', 'Hasil dan riwayat latihan tersedia di dashboard siswa setelah masuk. Penilaian latihan diverifikasi oleh server.'],
];
export default function Home() {
  return <main className="vkw-page">
    <a className="vkw-skip" href="#tentang">Lewati animasi</a>
    <div className="vkw-journey">
      <div className="vkw-stage"><InteractiveLogo /></div>
      <header className="vkw-nav">
        <Link href="/" className="vkw-brand" aria-label="VOKASI beranda"><SchoolMark compact /><span>VOKASI</span></Link>
        <nav aria-label="Navigasi utama"><a href="#tentang">Tentang</a><a href="#faq">FAQ</a></nav>
        <Link href="/login?role=student" className="vkw-nav-login">Login <span aria-hidden="true">↗</span></Link>
      </header>
      <section className="vkw-hero" aria-labelledby="vkw-title">
        <p className="vkw-school">SMKN 1 SINGOSARI <span>·</span> RUANG BELAJAR NUMERASI</p>
        <div className="vkw-hero-bottom"><h1 id="vkw-title">VOKASI</h1>
          <div className="vkw-hero-caption"><p>Langkah kecil. Kemampuan besar.</p><a href="#tentang">Gulir untuk mengenal <span aria-hidden="true">↓</span></a></div>
        </div>
      </section>
      <section className="vkw-about" id="tentang" aria-labelledby="vkw-about-title">
        <div className="vkw-about-copy"><p className="vkw-kicker">01 / MENGENAL VOKASI</p><h2 id="vkw-about-title">Lebih dekat<br />dengan <em>angka.</em></h2>
          <p>Ruang belajar numerasi untuk siswa SMKN 1 Singosari. Berlatih, pahami hasilmu, dan bangun kemampuan lewat setiap soal.</p>
          <div className="vkw-features"><span>Latihan terarah</span><span>Riwayat belajar</span><span>Peringkat nilai</span></div>
          <Link href="/login?role=student" className="vkw-primary">Mulai Belajar <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </div>
    <div className="vkw-content"><LandingRanking />
      <section className="vkw-faq" id="faq" aria-labelledby="vkw-faq-title"><div><p className="vkw-kicker">02 / SEBELUM MULAI</p><h2 id="vkw-faq-title">Ada pertanyaan?</h2></div><div className="vkw-questions">{questions.map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
      <footer className="vkw-footer"><div><Link href="/" className="vkw-footer-brand">VOKASI</Link><p>Platform Pembelajaran Numerasi<br />SMKN 1 Singosari</p></div><nav aria-label="Navigasi footer"><a href="#tentang">Tentang VOKASI</a><a href="#peringkat">Peringkat nilai</a><a href="#faq">FAQ</a><Link href="/login?role=admin">Masuk sebagai Admin ↗</Link></nav><p className="vkw-footer-note">Belajar. Berlatih. Berkembang.</p></footer>
    </div>
  </main>;
}
