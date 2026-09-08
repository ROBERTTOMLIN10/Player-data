export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  decimals: number;
}

export interface GameSummary {
  id: number;
  game_date: string;
  opponent: string | null;
  source_file: string;
  player_count: number;
  [avgKey: `avg_${string}`]: number | string | null;
}

export interface GpsSession {
  id: number;
  game_id: number;
  player_id: number;
  distance_mi: number | null;
  active_time_min: number | null;
  load: number | null;
  top_speed_mph: number | null;
  peak_accel: number | null;
  peak_decel: number | null;
  sprints_count: number | null;
  sprints_max_topspeed_mph: number | null;
  sprints_avg_topspeed_mph: number | null;
  sprints_distance_yd: number | null;
  sprints_volume: number | null;
  explosiveness_count: number | null;
  explosiveness_mean_accel: number | null;
  minutes_played?: number | null;
  started?: number | null;
  player_name?: string;
  game_date?: string;
  opponent?: string | null;
}

export interface Game {
  id: number;
  game_date: string;
  opponent: string | null;
  source_file: string;
  imported_at: string;
}

export interface GameDetail {
  game: Game;
  sessions: GpsSession[];
  teamAverages: Record<string, number | null>;
}

export interface Player {
  id: number;
  canonical_name: string;
  games_played: number;
}

export interface PlayerDetail {
  player: { id: number; canonical_name: string; created_at: string };
  sessions: GpsSession[];
  seasonTotals: Record<string, number | null>;
}

export interface ZoneMetric {
  zone_group: string;
  zone_label: string;
  value: number | null;
  unit: string;
  player_id: number;
  player_name: string;
}

export interface TeamSummary {
  seasonAverages: Record<string, number>;
  trend: Array<{ game_id: number; game_date: string; opponent: string | null } & Record<string, number>>;
  highs: Array<{
    metric: string;
    label: string;
    unit: string;
    best: { value: number; player_name: string; opponent: string | null; game_date: string; game_id: number } | null;
  }>;
}

export interface CompareResult {
  sessions: GpsSession[];
  seasonAverages: Array<{ player_id: number; player_name: string } & Record<string, number>>;
  teamAverages: Record<string, number>;
}
