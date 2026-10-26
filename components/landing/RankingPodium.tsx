"use client";

import { useEffect, useState } from "react";
import { configured, supabase } from "@/lib/supabase";
import { currentRole } from "@/lib/auth";
import { getLeaderboard } from "@/lib/school";
import type { LeaderboardEntry } from "@/lib/types";

type RankingState = {
  status: "locked" | "loading" | "ready" | "error";
  rows: LeaderboardEntry[];
};

export function useLandingRanking() {
  const [state, setState] = useState<RankingState>({
    status: "locked",
    rows: [],
  });
  useEffect(() => {
    if (!configured()) return;
    let active = true,
      generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (request: number) => {
      const valid = () => active && generation === request;
      try {
        const account = await currentRole();
        if (!valid()) return;
        if (!account) {
          setState({ status: "locked", rows: [] });
          return;
        }
        setState({ status: "loading", rows: [] });
        const rows = await getLeaderboard();
        if (valid()) setState({ status: "ready", rows: rows.slice(0, 10) });
      } catch {
        if (valid()) setState({ status: "error", rows: [] });
      }
    };
    // Never await Supabase calls inside its auth callback (auth lock).
    const {
      data: { subscription },
    } = supabase().auth.onAuthStateChange((event, session) => {
      const request = ++generation;
      clearTimeout(timer);
      setState({ status: session ? "loading" : "locked", rows: [] });
      if (session && event !== "SIGNED_OUT")
        timer = setTimeout(() => void load(request), 0);
    });
    return () => {
      active = false;
      generation++;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);
  return state;
}
