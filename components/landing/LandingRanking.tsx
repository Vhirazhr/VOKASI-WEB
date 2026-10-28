"use client";

import { ArrowUpRight, Trophy } from "lucide-react";
import { AccessLink } from "./LandingAccess";

const examples = [
  { rank: 1, name: "Siswa A", classroom: "Kelas X", score: 95 },
  { rank: 2, name: "Siswa B", classroom: "Kelas XI", score: 92 },
  { rank: 3, name: "Siswa C", classroom: "Kelas X", score: 89 },
];

export default function LandingRanking() {
  return (
    <section className="vkw-ranking vkw-section" data-scene-stop id="leaderboard" aria-labelledby="vkw-ranking-title">
      <div className="vkw-ranking-heading">
        <p className="vkw-kicker">02 / PENCAPAIAN SISWA</p>
        <h2 id="vkw-ranking-title">Leaderboard <em>VOKASI</em></h2>
        <p>Apresiasi bagi pencapaian numerasi siswa SMK Negeri 1 Singosari.</p>
      </div>
      <p className="vkw-ranking-status" role="status">
        DEMO / ILUSTRASI — Nama, kelas, dan nilai berikut hanya data contoh, bukan data siswa asli.
      </p>
      <ol className="vkw-podium-cards" aria-label="Contoh tampilan tiga peringkat terbaik">
        {[2, 1, 3].map((rank) => {
          const row = examples.find((item) => item.rank === rank)!;
          return (
            <li key={rank} className={`vkw-champion vkw-champion-${rank}`} aria-label={`Contoh peringkat ${rank}`}>
              <div className="vkw-champion-top">
                <span>DATA CONTOH</span>
                <span className="vkw-rank-badge">0{rank}</span>
              </div>
              <strong className="vkw-champion-score">{row.score}</strong>
              <span className="vkw-score-caption">nilai ilustrasi / 100</span>
              <Trophy className="vkw-cup" strokeWidth={1} aria-hidden="true" />
              <div className="vkw-champion-person">
                <span>PERINGKAT {rank}</span>
                <h3>{row.name}</h3>
                <p>{row.classroom} · Data contoh</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="vkw-ranking-access">
        <AccessLink className="vkw-primary">
          Masuk untuk melihat fitur peringkat <ArrowUpRight size={18} />
        </AccessLink>
      </div>
      <p className="vkw-ranking-footnote">Peringkat aktual tersedia sesuai akses akun sekolah. Privasi siswa tetap dijaga.</p>
    </section>
  );
}
