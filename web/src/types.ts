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
  position: string | null; // 'fwd' | 'mid' | 'def' | 'gk' | null (not yet known)
}

export interface PlayerGameStat {
  id: number;
  schedule_game_id: number;
  player_id: number;
  minutes: number | null;
  started: number;
  position: string | null;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  shots_on_goal: number;
  fouls: number;
  yellow_cards: number;
  red_cards: number;
  is_goalie: number;
  saves: number | null;
  goals_allowed: number | null;
  shutout: number;
  game_date: string;
  opponent: string;
  opponent_logo_url: string | null;
  status: string | null;
  team_score: number | null;
  opponent_score: number | null;
}

export interface PlayerStatTotals {
  goals: number;
  assists: number;
  points: number;
  shots: number;
  shots_on_goal: number;
  yellow_cards: number;
  red_cards: number;
  games_with_stats: number;
}

export interface PlayerDetail {
  player: { id: number; canonical_name: string; created_at: string; position: string | null };
  sessions: GpsSession[];
  seasonTotals: Record<string, number | null>;
  gameStats: PlayerGameStat[];
  statTotals: PlayerStatTotals;
}

export interface ScheduleGame {
  id: number;
  game_date: string;
  game_time: string | null;
  opponent: string;
  opponent_logo_url: string | null;
  location: string | null;
  home_away: string | null;
  is_conference: number;
  status: string | null;
  team_score: number | null;
  opponent_score: number | null;
  boxscore_url: string | null;
  recap_url: string | null;
}

export interface GameTeamTotals {
  id: number;
  schedule_game_id: number;
  side: "FAU" | "opponent";
  team_name: string | null;
  goals: number | null;
  assists: number | null;
  points: number | null;
  shots: number | null;
  shots_on_goal: number | null;
  saves: number | null;
  corners: number | null;
  fouls: number | null;
  offsides: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
}

export interface ScheduleGameDetail {
  game: ScheduleGame & { raw_json: string | null; updated_at: string };
  teamTotals: GameTeamTotals[];
  playerStats: (PlayerGameStat & { player_name: string })[];
}

export interface TeamStatsGameLog {
  schedule_game_id: number;
  game_date: string;
  opponent: string;
  opponent_logo_url: string | null;
  status: string | null;
  team_score: number | null;
  opponent_score: number | null;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  shots_on_goal: number;
  saves: number | null;
  corners: number;
  fouls: number;
  offsides: number;
  yellow_cards: number;
  red_cards: number;
}

export interface TeamStatsTopScorer {
  player_id: number;
  player_name: string;
  goals: number;
  assists: number;
  points: number;
  yellow_cards: number;
  red_cards: number;
  games_played: number;
}

export interface TeamStats {
  seasonTotals: {
    goals: number;
    assists: number;
    points: number;
    shots: number;
    shots_on_goal: number;
    yellow_cards: number;
    red_cards: number;
    fouls: number;
  };
  record: { wins: number | null; losses: number | null; ties: number | null };
  gameLog: TeamStatsGameLog[];
  topScorers: TeamStatsTopScorer[];
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

export type Role = "coach" | "player";

export interface Me {
  role: Role;
  email: string;
  playerId: number | null;
  playerName: string | null;
  authRequired: boolean;
}

export type Severity = "light" | "moderate" | "severe";

export interface SorenessEntry {
  region: string;
  severity: Severity;
  note: string | null;
}

export interface ReadinessEntry {
  id: number;
  player_id: number;
  entry_date: string;
  is_game_day: number;
  readiness_rating: number | null; // 1–10; null only on entries from before this question existed
  sleep_hours: number | null;
  sleep_quality: number;
  energy: number;
  muscle_soreness: number;
  stress: number;
  mood: number;
  readiness_score: number;
  notes: string | null;
  submitted_at: string;
  updated_at: string;
  soreness: SorenessEntry[];
}

export interface ReadinessInput {
  readiness_rating: number;
  sleep_hours: number | null;
  sleep_quality: number;
  energy: number;
  muscle_soreness: number;
  stress: number;
  mood: number;
  notes: string | null;
  soreness: SorenessEntry[];
}

export interface GameOnDate {
  opponent: string;
  game_time: string | null;
  home_away: string | null;
}

export interface ReadinessToday {
  date: string;
  game: GameOnDate | null;
  entry: ReadinessEntry | null;
}

export type ReadinessStatus = "red" | "amber" | "green" | "missing";

export interface SquadReadinessPlayer {
  player_id: number;
  name: string;
  position: string | null;
  hasAccount: boolean;
  entry: ReadinessEntry | null;
  baseline: number | null;
  status: ReadinessStatus;
  flags: string[];
}

export type RegionCounts = Record<string, { light: number; moderate: number; severe: number }>;

export interface SquadReadiness {
  date: string;
  today: string;
  game: GameOnDate | null;
  accountCount: number;
  summary: {
    expected: number;
    submitted: number;
    red: number;
    amber: number;
    green: number;
    averageScore: number | null;
  };
  players: SquadReadinessPlayer[];
  regionCounts: RegionCounts;
}

export interface PlayerReadinessHistory {
  today: string;
  entries: (ReadinessEntry & { status?: ReadinessStatus; flags?: string[] })[];
}

export type MetricValues = Record<string, number | null>;

export interface MyProfile extends PlayerDetail {
  teamAverages: Record<string, number | null>;
  teamTrend: Array<{ game_id: number; game_date: string; opponent: string | null } & Record<string, number | null>>;
  ranks: Record<string, { rank: number; outOf: number } | null>;
}

export interface MyGameGps {
  game: { id: number; game_date: string; opponent: string | null };
  you: MetricValues | null;
  others: MetricValues[];
  teamAverages: Record<string, number | null>;
}

export interface AccountsList {
  players: Array<{
    player_id: number;
    name: string;
    position: string | null;
    user_id: number | null;
    email: string | null;
    last_login_at: string | null;
  }>;
  coaches: Array<{ user_id: number; email: string; last_login_at: string | null }>;
  envCoach: string | null;
}
