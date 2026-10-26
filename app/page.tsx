import {
  BookOpenCheck,
  ChartNoAxesCombined,
  ClipboardCheck,
  Medal,
  ArrowUpRight,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import InteractiveLogo from "@/components/landing/InteractiveLogo";
import SchoolMark from "@/components/landing/SchoolMark";
import LandingRanking from "@/components/landing/LandingRanking";
import LandingAccess, { AccessLink } from "@/components/landing/LandingAccess";
import MotionSettings from "@/components/landing/MotionSettings";
import "./landing-3d.css";
const features = [
  {
    icon: BookOpenCheck,
    title: "Latihan Numerasi Interaktif",
    text: "Mengasah kemampuan numerasi melalui latihan soal yang dirancang untuk mendukung pemahaman dan penerapan konsep matematika.",
  },
  {
    icon: ClipboardCheck,
    title: "Evaluasi Otomatis",
    text: "Memberikan hasil penilaian secara langsung setelah siswa menyelesaikan latihan.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Pemantauan Progres",
    text: "Memudahkan siswa dalam melihat perkembangan dan riwayat hasil pembelajaran.",
  },
  {
    icon: Medal,
    title: "Peringkat Siswa",
    text: "Menampilkan pencapaian berdasarkan nilai tertinggi sebagai bentuk apresiasi terhadap hasil belajar.",
  },
];
const steps = [
  [
    "Masuk ke Platform",
    "Gunakan akun yang terdaftar untuk mengakses pembelajaran.",
  ],
  ["Pilih Latihan", "Akses materi dan latihan numerasi yang tersedia."],
  [
    "Kerjakan Soal",
    "Selesaikan latihan sesuai petunjuk dan waktu yang ditentukan.",
  ],
  [
    "Tinjau Hasil",
    "Lihat nilai dan perkembangan hasil belajar secara langsung.",
  ],
];
export default function Home() {
  return (
    <LandingAccess>
      <main className="vkw-page" id="beranda">
        <a className="vkw-skip" href="#tentang">
          Lewati animasi
        </a>
        <div className="vkw-journey">
          <div className="vkw-stage">
            <InteractiveLogo />
          </div>
          <header className="vkw-nav">
            <a
              href="#beranda"
              className="vkw-brand"
              aria-label="VOKASI beranda"
            >
              <SchoolMark compact />
              <span>VOKASI</span>
            </a>
            <nav aria-label="Navigasi utama">
              <a href="#beranda">Beranda</a>
              <a href="#tentang">Tentang</a>
              <a href="#leaderboard">Leaderboard</a>
              <a href="#fitur">Fitur Unggulan</a>
            </nav>
            <AccessLink className="vkw-nav-login">
              Login <ArrowUpRight size={15} />
            </AccessLink>
          </header>
          <section
            className="vkw-hero"
            data-scene-stop
            aria-labelledby="vkw-title"
          >
            <div className="vkw-hero-bottom">
              <h1 id="vkw-title">VOKASI</h1>
              <p>Platform Pembelajaran Numerasi</p>
            </div>
          </section>
          <section
            className="vkw-about vkw-section"
            data-scene-stop
            id="tentang"
            aria-labelledby="vkw-about-title"
          >
            <div className="vkw-about-copy vkw-glass-panel">
              <p className="vkw-kicker">01 / TENTANG PLATFORM</p>
              <h2 id="vkw-about-title">
                Tentang <em>VOKASI</em>
              </h2>
              <p>
                VOKASI merupakan platform pembelajaran digital yang dikembangkan
                untuk mendukung peningkatan kompetensi numerasi siswa SMK Negeri
                1 Singosari.
              </p>
              <p>
                Melalui latihan interaktif dan evaluasi berbasis digital, VOKASI
                membantu siswa mengembangkan kemampuan berpikir logis, analitis,
                dan pemecahan masalah secara mandiri.
              </p>
              <AccessLink className="vkw-primary">
                Latihan <ArrowUpRight size={18} />
              </AccessLink>
            </div>
          </section>
          <LandingRanking />
          <section
            className="vkw-features-section vkw-section"
            data-scene-stop
            id="fitur"
            aria-labelledby="vkw-features-title"
          >
            <div className="vkw-feature-heading">
              <p className="vkw-kicker">03 / DUKUNGAN PEMBELAJARAN</p>
              <h2 id="vkw-features-title">
                Fitur <em>Unggulan</em>
              </h2>
              <p>
                Terintegrasi untuk mendukung proses belajar dan evaluasi siswa.
              </p>
            </div>
            <div className="vkw-feature-grid">
              {features.map(({ icon: Icon, title, text }, i) => (
                <article className="vkw-feature-card" key={title}>
                  <div>
                    <Icon size={26} strokeWidth={1.4} />
                    <span>0{i + 1}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </section>
          <section
            className="vkw-guide vkw-section"
            data-scene-stop
            id="panduan"
            aria-labelledby="vkw-guide-title"
          >
            <div className="vkw-guide-heading">
              <p className="vkw-kicker">04 / PANDUAN PENGGUNAAN</p>
              <h2 id="vkw-guide-title">
                Mulai Pembelajaran
                <br />
                <em>dengan Mudah</em>
              </h2>
            </div>
            <ol className="vkw-steps">
              {steps.map(([title, text], i) => (
                <li key={title}>
                  <span className="vkw-step-number">0{i + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <AccessLink className="vkw-primary">
              Masuk ke Platform <ArrowUpRight size={18} />
            </AccessLink>
          </section>
        </div>
        <footer className="vkw-footer">
          <div className="vkw-footer-intro">
            <a href="#beranda" className="vkw-brand">
              <SchoolMark compact />
              <span>VOKASI</span>
            </a>
            <p>
              Platform Pembelajaran Numerasi
              <br />
              SMK Negeri 1 Singosari
            </p>
          </div>
          <nav aria-label="Tautan cepat">
            <h2>Tautan Cepat</h2>
            <a href="#beranda">Beranda</a>
            <a href="#tentang">Tentang VOKASI</a>
            <a href="#leaderboard">Leaderboard</a>
            <a href="#fitur">Fitur Unggulan</a>
            <a href="#panduan">Panduan Penggunaan</a>
            <AccessLink role="admin">Login Admin ↗</AccessLink>
          </nav>
          <address>
            <h2>Hubungi Sekolah</h2>
            <a
              href="https://referensi.data.kemendikdasmen.go.id/pendidikan/npsn/20517766"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin size={17} />
              <span>
                Jl. Raya Mondoroko No. 3, Banjararum,
                <br />
                Singosari, Kabupaten Malang, Jawa Timur
              </span>
            </a>
            <a href="mailto:smkn1sgsmalang@gmail.com">
              <Mail size={17} />
              <span>smkn1sgsmalang@gmail.com</span>
            </a>
            <a href="tel:+62341458138">
              <Phone size={17} />
              <span>(0341) 458138</span>
            </a>
            <a
              className="vkw-school-link"
              href="https://smkn1singosari.sch.id/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Website resmi sekolah ↗
            </a>
          </address>
          <div className="vkw-footer-bottom">
            <p>© 2026 VOKASI. Seluruh hak cipta dilindungi.</p>
            <MotionSettings />
          </div>
        </footer>
      </main>
    </LandingAccess>
  );
}
