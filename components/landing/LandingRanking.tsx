"use client";
import { Trophy, Medal } from "lucide-react";
import { useLandingRanking } from "./RankingPodium";
const score = (v: number | null | undefined) =>
  typeof v === "number"
    ? v.toLocaleString("id-ID", { maximumFractionDigits: 1 })
    : "—";
export default function LandingRanking() {
  const state = useLandingRanking(),
    ready = state.status === "ready";
  return (
    <section
      className="vkw-ranking vkw-section"
      data-scene-stop
      id="leaderboard"
      aria-labelledby="vkw-ranking-title"
    >
      <div className="vkw-ranking-heading">
        <p className="vkw-kicker">02 / PENCAPAIAN SISWA</p>
        <h2 id="vkw-ranking-title">
          Leaderboard <em>VOKASI</em>
        </h2>
        <p>Apresiasi bagi pencapaian numerasi siswa SMK Negeri 1 Singosari.</p>
      </div>
      <p className="vkw-ranking-status" role="status">
        {state.status === "loading"
          ? "Memuat peringkat terverifikasi…"
          : state.status === "error"
            ? "Data peringkat belum dapat dimuat. Silakan coba kembali nanti."
            : ready
              ? state.rows.length
                ? "Diurutkan berdasarkan nilai rata-rata latihan wajib terverifikasi tertinggi."
                : "Belum tersedia hasil latihan terverifikasi."
              : "Memuat peringkat…"}
      </p>
      <ol className="vkw-podium-cards" aria-label="Tiga peringkat terbaik">
        {[1, 2, 3].map((rank) => {
          const row = ready ? state.rows[rank - 1] : undefined;
          return (
            <li
              key={rank}
              className={`vkw-champion vkw-champion-${rank}`}
              aria-label={`Peringkat ${rank}`}
            >
              <div className="vkw-champion-top">
                <span>NILAI</span>
                <span className="vkw-rank-badge">0{rank}</span>
              </div>
              <strong className="vkw-champion-score">
                {score(row?.mandatory_average)}
              </strong>
              <span className="vkw-score-caption">rata-rata terverifikasi</span>
              <Trophy className="vkw-cup" strokeWidth={1} aria-hidden="true" />
              <div className="vkw-champion-person">
                <span>PERINGKAT {rank}</span>
                <h3>
                  {row?.display_name ||
                    (ready ? "Belum tersedia" : "Memuat…")}
                </h3>
                <p>{row?.classroom || "SMK Negeri 1 Singosari"}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {ready && state.rows.length > 3 && (
        <ol
          className="vkw-ranking-list"
          start={4}
          aria-label="Peringkat berikutnya"
        >
          {state.rows.slice(3).map((row, i) => (
            <li key={row.rank}>
              <span className="vkw-list-medal">
                <Medal size={22} />
                {i + 4}
              </span>
              <div>
                <strong>{row.display_name}</strong>
                <small>{row.classroom}</small>
              </div>
              <span className="vkw-list-score">
                {score(row.mandatory_average)}
                <small>nilai rata-rata</small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
