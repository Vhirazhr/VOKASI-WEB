'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import { configured, supabase } from '@/lib/supabase';
import { currentRole } from '@/lib/auth';
import { getLeaderboard } from '@/lib/school';
import type { LeaderboardEntry } from '@/lib/types';

type RankingState = { status: 'locked' | 'loading' | 'ready' | 'error'; rows: LeaderboardEntry[] };

export function useLandingRanking() {
  const [state, setState] = useState<RankingState>({ status: 'locked', rows: [] });
  useEffect(() => {
    if (!configured()) return;
    let active = true, generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (request: number) => {
      const valid = () => active && generation === request;
      try {
        const account = await currentRole();
        if (!valid()) return;
        if (!account) { setState({ status: 'locked', rows: [] }); return; }
        setState({ status: 'loading', rows: [] });
        const rows = await getLeaderboard();
        if (valid()) setState({ status: 'ready', rows: rows.slice(0, 3) });
      } catch {
        if (valid()) setState({ status: 'error', rows: [] });
      }
    };
    // Never await Supabase calls inside its auth callback (auth lock).
    const { data: { subscription } } = supabase().auth.onAuthStateChange((event, session) => {
      const request = ++generation;
      clearTimeout(timer);
      setState({ status: session ? 'loading' : 'locked', rows: [] });
      if (session && event !== 'SIGNED_OUT') timer = setTimeout(() => void load(request), 0);
    });
    return () => { active = false; generation++; clearTimeout(timer); subscription.unsubscribe(); };
  }, []);
  return state;
}

export function RankingPodium({ state }: { state: RankingState }) {
  return <ol className="vkl3-podium" aria-label="Tiga peringkat teratas">
    {[1, 2, 3].map(rank => {
      const student = state.status === 'ready' ? state.rows[rank - 1] : undefined;
      return <li key={rank} aria-label={`Peringkat ${rank}`} className={`vkl3-podium-place vkl3-place-${rank}`} style={{ '--place-height': `${rank === 1 ? 145 : rank === 2 ? 105 : 78}px` } as CSSProperties}>
        <div className="vkl3-winner">
          <span className="vkl3-medal" aria-hidden="true">{rank === 1 ? '✦' : rank === 2 ? 'Ⅱ' : 'Ⅲ'}</span>
          <strong title={student?.display_name}>{student?.display_name || (state.status === 'ready' ? 'Belum terisi' : `Peringkat ${rank}`)}</strong>
          <span>{student ? `${student.mandatory_average!.toLocaleString('id-ID', { maximumFractionDigits: 1 })} nilai rata-rata` : '—'}</span>
        </div>
        <div className="vkl3-podium-block" aria-hidden="true">
          <div className="vkl3-podium-front">{String(rank).padStart(2, '0')}</div>
          <div className="vkl3-podium-back" />
          <div className="vkl3-podium-top" />
          <div className="vkl3-podium-bottom" />
          <div className="vkl3-podium-left" />
          <div className="vkl3-podium-right" />
        </div>
      </li>;
    })}
  </ol>;
}

export function RankingCaption({ state }: { state: RankingState }) {
  return <div className="vkl3-ranking-caption">
    <p className="vkl3-ranking-kicker">PAPAN PRESTASI</p>
    <h2>Giliranmu bersinar.</h2>
    <p role="status">{state.status === 'loading' ? 'Memuat peringkat terverifikasi…'
      : state.status === 'error' ? 'Peringkat belum dapat dimuat. Coba buka halaman peringkat.'
      : state.status === 'ready' ? state.rows.length ? 'Tiga nilai rata-rata latihan wajib tertinggi.' : 'Belum ada hasil terverifikasi. Mulai langkah pertamamu.'
      : 'Masuk untuk melihat siapa yang ada di podium.'}</p>
    <Link href={state.status === 'ready' ? '/siswa/peringkat' : '/login?role=student'}>
      {state.status === 'ready' ? 'Lihat seluruh peringkat' : 'Masuk & lihat peringkat'} <span aria-hidden="true">↗</span>
    </Link>
  </div>;
}
