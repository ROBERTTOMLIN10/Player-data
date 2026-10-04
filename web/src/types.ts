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
  played?: number; // 1 = logged minutes
  box_score?: number; // 1 = the game has minutes data (so no minutes = didn't play, fitness only)
  flag?: { kind: "glitch" | "spike"; reason: string } | null; // needs checking (glitch = left out of averages)
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
  games_played: number; // logged minutes
  sessions?: number; // tracked GPS sessions, including fitness-only
  position: string | null; // 'fwd' | 'mid' | 'def' | 'gk' | null (not yet known)
  jersey_number?: string | null; // squad number from the fausports.com roster
  photo_url?: string | null;
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

/** Roster profile details (any can be null when FAU doesn't publish them). */
export interface PlayerProfile {
  position_short: string | null;
  position_long: string | null;
  academic_year: string | null;
  academic_year_long: string | null;
  height_feet: number | null;
  height_inches: number | null;
  weight: number | null;
  hometown: string | null;
  high_school: string | null;
  previous_school: string | null;
  major: string | null;
  birth_date: string | null;
  is_captain: number;
  instagram: string | null;
  photo_url: string | null;
  profile_url: string | null;
}

export interface PlayerDetail {
  player: { id: number; canonical_name: string; created_at: string; position: string | null; jersey_number?: string | null };
  profile?: PlayerProfile | null; // from the fausports.com roster
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
  ncaa_game_id: number | null; // NCAA.com game (for the game page)
  opponent_seo: string | null; // NCAA.com team (for the team page)
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
  player_id: number | null; // null: a goalkeeper from the box scores (no tracker, not a player in the app)
  player_name: string;
  is_goalkeeper: number;
  jersey_number: string | null;
  photo_url?: string | null;
  goals: number;
  assists: number;
  points: number;
  yellow_cards: number;
  red_cards: number;
  games_played: number;
  games_started: number;
  minutes: number;
  shots: number;
  shots_on_goal: number;
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
  goalkeepers?: TeamStatsGoalkeeper[];
}

export interface TeamStatsGoalkeeper {
  player_name: string;
  jersey_number: string | null;
  photo_url?: string | null;
  games_played: number;
  games_started: number;
  minutes: number;
  saves: number;
  goals_allowed: number;
  shutouts: number;
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
  lows?: TeamSummary["highs"]; // lowest single game per metric (games with minutes)
}

export interface CompareResult {
  sessions: GpsSession[];
  seasonAverages: Array<{ player_id: number; player_name: string } & Record<string, number>>;
  teamAverages: Record<string, number>;
}

export type Role = "coach" | "player" | "trainer"; // trainer = athletic trainer (AT view)

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
  care: CareSummary;
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
  teamHighs: Record<string, number | null>; // max_<metric>: squad's best single game
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
  trainers?: Array<{ user_id: number; email: string; last_login_at: string | null }>;
  envCoach: string | null;
}

// ---- NCAA D1 (from NCAA.com) -------------------------------------------------

export interface NcaaSide {
  seo: string;
  name: string;
  rank: number | null;
  score: number | null;
  conf: string | null;
  confName: string | null;
  logo: string;
}

export interface NcaaGame {
  id: number;
  date: string;
  startEpoch: number | null;
  state: string; // P upcoming | I live | F final
  period: string;
  clock: string;
  finalMessage: string;
  isConference: boolean;
  home: NcaaSide;
  away: NcaaSide;
}

export interface NcaaScoreboard {
  date: string;
  today: string;
  ourTeam: string;
  updatedAt: string | null;
  games: NcaaGame[];
}

export interface NcaaStandingRow {
  seo: string;
  name: string;
  gp: number;
  w: number;
  l: number;
  t: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  overall: string;
  logo: string;
  move?: number | null; // places moved today (+ up, - down)
}

export interface NcaaStandings {
  ourTeam: string;
  conferences: { seo: string; name: string; rows: NcaaStandingRow[]; fixtures?: NcaaGame[] }[]; // fixtures: remaining conference games
}

export interface NcaaTeamRef {
  seo: string;
  name: string;
  conf: string | null;
  logo: string;
}

export interface NcaaTable {
  label: string;
  updatedAt?: string;
  columns: string[];
  rows: string[][];
  teams: (NcaaTeamRef | null)[];
  moves?: (number | null)[]; // per row: places moved since the previous day or poll (+ up, - down)
  players?: (NcaaPlayerLink | null)[]; // individual tables: each row's player (photo, number, profile key)
}

export interface NcaaPlayerLink {
  key: string;
  photo_url: string | null;
  jersey_number: string | null;
}

export interface NcaaTeamInfo {
  seo: string;
  name: string;
  logo: string;
  conference: string | null;
  conferenceSeo: string | null;
  record: string | null;
  conferenceRecord: string | null;
  conferencePosition: number | null;
  conferenceTeams: number | null;
  site: string | null;
  covered: boolean; // squad read from the team's athletics site
  updatedAt: string | null;
  rpi: number | null;
  pollRank: number | null; // United Soccer Coaches Top 25, only when ranked
}

export interface NcaaSquadPlayer {
  key: string;
  name: string;
  jersey_number: string | null;
  position_short: string | null;
  position_long: string | null;
  academic_year: string | null;
  height_feet: number | null;
  height_inches: number | null;
  hometown: string | null;
  photo_url: string | null;
  gp: number | null;
  gs: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  points: number | null;
  shots: number | null;
  shots_on_goal: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  is_goalkeeper: number | null;
  goals_allowed: number | null;
  gaa: number | null;
  saves: number | null;
  save_pct: number | null;
  shutouts: number | null;
}

export interface NcaaTeamGame {
  id: number;
  date: string;
  state: string | null;
  home: boolean;
  opponent: string;
  opponentSeo: string;
  opponentLogo: string;
  isConference: boolean;
  startEpoch: number | null;
  result: string | null;
}

export interface NcaaTeamPage {
  team: NcaaTeamInfo;
  squad: NcaaSquadPlayer[];
  games: NcaaTeamGame[];
  ourTeam: string;
}

export interface NcaaPlayerGame {
  game_date: string;
  game_id?: number | null; // NCAA.com game
  opponent_seo?: string | null;
  opponent: string | null;
  home_away: string | null;
  result: string | null;
  started: number;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  shots_on_goal: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  saves: number | null;
  goals_allowed: number | null;
}

export interface NcaaPlayerPage {
  team: NcaaTeamInfo;
  key: string;
  name: string;
  profile: (Partial<PlayerProfile> & { name?: string; jersey_number?: string | null }) | null;
  stats: (Partial<NcaaSquadPlayer> & Record<string, unknown>) | null;
  ncaaStats?: Record<string, string>; // players we only know from NCAA.com's leader tables
  games: NcaaPlayerGame[];
  national: { category: string; rank: string; value: string; games: string | null }[];
  source: "team" | "ncaa";
  ourTeam: string;
}

export interface NcaaPoll extends NcaaTable {
  key: "usc" | "tds";
}

export interface NcaaRankings {
  ourTeam: string;
  polls: NcaaPoll[];
  rpi: NcaaTable | null;
}

export interface NcaaStatCategory {
  key: string;
  kind: "individual" | "team";
  label: string;
  group: string;
  updatedAt: string | null;
}

export interface NcaaStatsIndex {
  categories: NcaaStatCategory[];
  conferences: { seo: string; name: string }[];
}

export interface NcaaConference {
  seo: string;
  name: string;
  ourTeam: string;
  standings: NcaaStandingRow[];
  teamStats: NcaaTable[];
  playerLeaders: NcaaTable[];
}

// ---- Fitness vs the match group ------------------------------------------------

export type FitnessStatus = "ok" | "amber" | "red";

export interface FitnessWindow {
  days: number;
  games: number;
  load: number;
  matchLoad: number;
  pct: number | null;
  status: FitnessStatus | null;
}

export interface PlayerFitness {
  playerId: number;
  name: string;
  gamesPlayed: number;
  fitnessSessions: number;
  otherSessions: number;
  windows: FitnessWindow[];
}

export interface TeamFitness {
  asOf: string | null;
  players: PlayerFitness[];
  thresholds: { amber: number; red: number };
}

export interface MyFitness {
  asOf: string | null;
  you: PlayerFitness | null;
  thresholds: { amber: number; red: number };
}

/** A GPS session that needs checking, for the coaches' list. */
export interface FlaggedSession {
  id: number;
  game_id: number;
  player_id: number;
  player_name: string;
  game_date: string;
  opponent: string | null;
  source_file: string;
  load: number | null;
  distance_mi: number | null;
  top_speed_mph: number | null;
  flag: { kind: "glitch" | "spike"; reason: string };
}

// --- RPE (post-training rate of perceived exertion, 1–10) --------------------

export interface RpeScore {
  player_id: number;
  session_date: string;
  session: number; // 1, or 2 on a pre-season double day
  rpe: number;
}

export interface RpeAverages {
  week: number | null; // 7-day
  month: number | null; // Last Month
  weekSessions: number;
  monthSessions: number;
}

export interface PlayerRpe {
  today: string;
  entries: RpeScore[]; // newest first
  latest: RpeScore | null;
  averages: RpeAverages;
  flags?: string[]; // coaches only
}

export interface RpeSquadRow {
  player_id: number;
  name: string;
  position: string | null;
  jersey_number: string | null;
}

export interface RpeSessionPlayer extends RpeSquadRow {
  rpe: number | null;
  na: boolean; // N/A: didn't train (kept out of averages)
  averages: RpeAverages;
  readiness: { status: string; score: number } | null;
  flags: string[];
}

export interface RpeSession {
  date: string;
  today: string;
  session: number;
  sessions: number[]; // sessions with scores on this date
  game: { opponent: string } | null;
  summary: { expected: number; logged: number; na: number; average: number | null }; // outfield only; logged includes N/A
  players: RpeSessionPlayer[];
  keeperSummary: { expected: number; logged: number; na: number; average: number | null };
  keepers: RpeSessionKeeper[];
  submitted: { submitted_at: string; submitted_by: string | null } | null; // players see scores once submitted
}

/** A roster goalkeeper (not a player in the app): logged and averaged separately. */
export interface RpeSessionKeeper {
  name: string;
  jersey_number: string | null;
  rpe: number | null;
  na: boolean;
  averages: RpeAverages;
  flags: string[];
}

export interface RpeSessionSummary {
  date: string;
  session: number;
  average: number | null; // outfield
  logged: number; // outfield scores
  keeperAverage: number | null;
  keepersLogged: number;
  na: number; // didn't train (players + keepers)
  flagged: number;
  submitted: boolean;
}

export interface RpeTrends {
  today: string;
  lastSession: string | null;
  players: (RpeSquadRow & { last: RpeScore | null; averages: RpeAverages; flags: string[] })[];
  keepers: { name: string; jersey_number: string | null; last: RpeScore | null; averages: RpeAverages; flags: string[] }[];
  daily: { date: string; average: number | null; logged: number; keepers: number | null }[];
  squad: RpeAverages; // outfield
  keeperAverages: RpeAverages;
}

export interface NcaaGamePlayer {
  number: string | null;
  name: string;
  position: string | null;
  starter: boolean;
  minutes: number | null;
  goals: number;
  assists: number;
  shots: number | null;
  shotsOnGoal: number;
  yellowCards: number;
  redCards: number;
  saves: number | null;
  goalsAllowed: number | null;
  key: string | null; // squad player (profile link) when matched
  photo_url: string | null;
}

export interface NcaaGameTeamStats {
  goals: number | null;
  shots: number | null;
  shotsOnGoal: number | null;
  corners: number | null;
  fouls: number | null;
  offsides: number | null;
  saves: number | null;
  yellowCards: number | null;
  redCards: number | null;
}

export type NcaaPlayKind = "goal" | "shot" | "save" | "corner" | "foul" | "offside" | "sub" | "yellow" | "red" | "var" | "other";

export interface NcaaFormPlayer {
  key: string;
  name: string;
  jersey_number: string | null;
  photo_url: string | null;
  gp: number | null;
  goals?: number | null;
  assists?: number | null;
  points?: number | null;
  shots?: number | null;
  saves?: number | null;
  gaa?: number | null;
  save_pct?: number | null;
  shutouts?: number | null;
}

export interface NcaaTeamForm {
  team: NcaaTeamInfo;
  lastFive: NcaaTeamGame[];
  scorers: NcaaFormPlayer[];
  keeper: NcaaFormPlayer | null;
}

export interface NcaaGameDetail {
  ourTeam: string;
  game: NcaaGame | null;
  status: string | null; // P | I | F
  period: string | null;
  clock: string | null; // live game clock
  teams: { seo: string; name: string; isHome: boolean; color: string | null; score?: number | null; players: NcaaGamePlayer[]; stats: NcaaGameTeamStats | null }[];
  goals: { period: string; time: string; seo: string | null; text: string; homeScore: number | null; awayScore: number | null }[];
  plays: { period: string; clock: string; seo: string | null; kind: NcaaPlayKind; text: string }[];
  venue: { time: string | null; location: string | null } | null;
  ranks: Record<string, { rpi: number | null; pollRank: number | null }>;
  preview: {
    home: NcaaTeamForm;
    away: NcaaTeamForm;
    headToHead: {
      id: number;
      date: string;
      season: number;
      linkable: boolean; // this season's games have a game page
      homeSeo: string;
      homeName: string;
      homeScore: number | null;
      awaySeo: string;
      awayName: string;
      awayScore: number | null;
      note: string | null; // "OT", "2OT"
    }[];
  } | null;
}

export type AlertKind = "kickoff" | "goals" | "halftime" | "final" | "red_cards";
export type AlertSettings = Record<AlertKind, boolean>;

export interface FollowedTeam {
  seo: string;
  name: string;
  logo: string;
  alerts: AlertSettings;
}

export interface FollowsResponse {
  ourTeam: string;
  signedIn: boolean; // false for the local no-login mode (nowhere to save)
  publicKey: string;
  follows: FollowedTeam[];
}

// ---- Player care (AT view) ----------------------------------------------------

export type PlayLevel = "full" | "as_tolerated" | "limited" | "rehab" | "out";
export type RtpStage = "rehab" | "running" | "modified" | "full" | "match_ready";
export type IssueCategory = "injury" | "gen_med" | "ppe";
export type Side = "left" | "right" | "both";

export interface Availability {
  player_id: number;
  status_date: string; // when it was set (it carries forward)
  level: PlayLevel;
  practice_note: string | null;
  bike: string | null;
  jogging: string | null;
  running: string | null;
  set_by: string | null;
  updated_at: string;
}

export interface Treatment {
  id: number;
  player_id: number;
  treat_date: string;
  treat_time: string | null; // HH:MM
  instructions: string | null;
  status: "booked" | "attended" | "missed";
  attended_marked_by: string | null;
  created_by?: string | null;
  updated_at?: string;
}

export interface CareNote {
  id: number;
  player_id: number;
  note_date: string;
  author_email: string | null;
  author_role: Role;
  body: string;
  created_at: string;
}

export interface Issue {
  id: number;
  player_id: number;
  category: IssueCategory;
  description: string;
  region: string | null;
  side: Side | null;
  injury_date: string | null;
  expected_return: string | null;
  stage: RtpStage;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  player_name?: string;
  last_log_date?: string | null;
}

export interface RehabLog {
  id: number;
  injury_id: number;
  log_date: string;
  activities: string;
  minutes: number | null;
  notes: string | null;
  created_by: string | null;
}

export interface OpenIssue extends Issue {
  days: number | null;
  latestLog: { log_date: string; activities: string; notes: string | null } | null;
}

export interface CareSummary {
  availability: Availability | null;
  treatments: Treatment[];
  noteCount: number;
  issues: { id: number; category: IssueCategory; description: string; side: Side | null; stage: RtpStage; days: number | null }[];
}

export interface CareDayPlayer {
  player_id: number;
  name: string;
  position: string | null;
  availability: Availability | null;
  treatments: Treatment[];
  notes: CareNote[];
  issues: OpenIssue[];
}

export interface CareDay {
  today: string;
  date: string;
  players: CareDayPlayer[];
}

export interface PlayerCare {
  date: string;
  day: CareDayPlayer | null;
  history: Availability[];
  pastIssues: Issue[];
  recentNotes: CareNote[];
  treatments: Treatment[];
}

export interface IssueDetail {
  today: string;
  issue: Issue;
  player: { id: number; name: string };
  stages: { id: number; stage: RtpStage; stage_date: string; set_by: string | null }[];
  logs: RehabLog[];
  painTrend: { date: string; readiness: number; muscle_soreness: number; pain: number | null }[];
  availability: Availability[];
}

export interface MyCare {
  today: string;
  treatments: Pick<Treatment, "id" | "treat_date" | "treat_time" | "instructions" | "status">[];
}
