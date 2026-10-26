"use client";

import { useEffect, useState } from "react";
import { configured } from "@/lib/supabase";
import { getPublicLeaderboard, type PublicLeaderboardEntry } from "@/lib/public-leaderboard";

type RankingState = {
  status: "loading" | "ready" | "error";
  rows: PublicLeaderboardEntry[];
};

export function useLandingRanking() {
  const [state, setState] = useState<RankingState>({ status: "loading", rows: [] });
  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    const load = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        if (!configured()) throw new Error("Leaderboard unavailable");
        const rows = await getPublicLeaderboard(controller.signal);
        if (active) setState({ status: "ready", rows });
      } catch {
        if (active) setState({ status: "error", rows: [] });
      } finally {
        pending = false;
      }
    };
    void load();
    // Match dashboard refresh cadence, without exposing table subscriptions.
    const timer = window.setInterval(() => void load(), 20_000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return state;
}
