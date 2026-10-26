import { supabase } from "./supabase";

export type PublicLeaderboardEntry = {
  rank: number;
  display_name: string;
  classroom: string;
  mandatory_average: number;
};

export async function getPublicLeaderboard(signal: AbortSignal): Promise<PublicLeaderboardEntry[]> {
  const { data, error } = await supabase()
    .rpc("vokasi_public_leaderboard")
    .abortSignal(signal);
  if (error) throw error;
  return (data ?? []) as PublicLeaderboardEntry[];
}
