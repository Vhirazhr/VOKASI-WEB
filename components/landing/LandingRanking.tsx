'use client';
import { useLandingRanking, RankingCaption } from './RankingPodium';
export default function LandingRanking() {
  const state = useLandingRanking();
  return <section className="vkw-ranking" id="peringkat" aria-label="Peringkat nilai">
    <RankingCaption state={state} />
    <ol className="vkw-leaders" aria-label="Tiga nilai tertinggi">
      {[1, 2, 3].map(rank => { const row = state.rows[rank - 1]; return <li key={rank}>
        <span className="vkw-rank-number">0{rank}</span><strong>{row?.display_name || (state.status === 'ready' ? 'Belum terisi' : 'Menanti langkahmu')}</strong>
        <span>{row ? row.mandatory_average!.toLocaleString('id-ID', { maximumFractionDigits: 1 }) : '—'}<small>nilai rata-rata</small></span>
      </li>; })}
    </ol>
  </section>;
}
