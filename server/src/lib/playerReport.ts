/**
 * A player's season report (the downloadable PDF for coaches, agents and the
 * player): profile, match stats game by game and in total, and GPS physical
 * numbers game by game, with season averages and bests next to the team's
 * average and where he ranks on the team. Pure (no database), so the app
 * preview builds the same report in the browser.
 *
 * Team comparisons use sessions where the player got minutes (or where minutes
 * aren't known), so bench warm-ups don't drag the team average down, and leave
 * out tracker glitches (an impossible top speed).
 */

export interface ReportMetric {
  key: string;
  label: string;
  unit: string;
  decimals: number;
}

/** The physical numbers in the report, in order (higher is better for all of them). */
export const REPORT_METRICS: ReportMetric[] = [
  { key: "distance_mi", label: "Distance", unit: "mi", decimals: 2 },
  { key: "top_speed_mph", label: "Top speed", unit: "mph", decimals: 1 },
  { key: "sprints_count", label: "Sprints", unit: "", decimals: 0 },
  { key: "sprints_distance_yd", label: "Sprint distance", unit: "yd", decimals: 0 },
  { key: "sprints_avg_topspeed_mph", label: "Sprint avg speed", unit: "mph", decimals: 1 },
  { key: "peak_accel", label: "Peak accel", unit: "m/s²", decimals: 2 },
  { key: "peak_decel", label: "Peak decel", unit: "m/s²", decimals: 2 },
  { key: "explosiveness_count", label: "Explosive efforts", unit: "", decimals: 0 },
  { key: "load", label: "Load", unit: "", decimals: 0 },
];

export const GLITCH_TOP_SPEED_MPH = 25;
/** Fewest games a teammate needs in the range to be ranked against. */
const MIN_GAMES_TO_RANK = 3;

export interface ReportSession {
  player_id: number;
  game_id: number;
  game_date: string;
  opponent: string | null;
  minutes_played: number | null;
  started?: number | null;
  [metric: string]: number | string | null | undefined;
}

export interface ReportGameStat {
  game_date: string;
  opponent: string;
  status: string | null; // W / L / T
  team_score: number | null;
  opponent_score: number | null;
  minutes: number | null;
  started: number;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  shots_on_goal: number;
  yellow_cards: number;
  red_cards: number;
  is_goalie?: number;
  saves?: number | null;
  goals_allowed?: number | null;
}

export interface ReportInput {
  player: { id: number; canonical_name: string; position: string | null; jersey_number: string | null };
  profile: Record<string, unknown> | null;
  sessions: ReportSession[]; // this player's GPS sessions
  gameStats: ReportGameStat[]; // this player's box score lines
  teamSessions: ReportSession[]; // every player's GPS sessions (for team averages and ranks)
  from: string;
  to: string;
  generated: string; // YYYY-MM-DD
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const valid = (s: ReportSession) => !(num(s.top_speed_mph) !== null && (s.top_speed_mph as number) > GLITCH_TOP_SPEED_MPH);
const counts = (s: ReportSession) => valid(s) && (s.minutes_played == null || s.minutes_played > 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Aug 1 of the season the date falls in (the season runs Aug–Dec). */
export function seasonStart(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${m >= 7 ? y : y - 1}-08-01`;
}

export function buildPlayerReport(input: ReportInput) {
  const inRange = (d: string) => d >= input.from && d <= input.to;
  const mine = input.sessions.filter((s) => inRange(s.game_date)).sort((a, b) => a.game_date.localeCompare(b.game_date));
  const team = input.teamSessions.filter((s) => inRange(s.game_date) && counts(s));
  const games = input.gameStats.filter((g) => inRange(g.game_date)).sort((a, b) => a.game_date.localeCompare(b.game_date));

  // Match stats: season totals from the box scores.
  const played = games.filter((g) => (g.minutes ?? 0) > 0 || g.started);
  const sum = (k: keyof ReportGameStat) => games.reduce((n, g) => n + (Number(g[k]) || 0), 0);
  const match = {
    games: games.map((g) => ({
      ...g,
      result: g.status && g.team_score != null && g.opponent_score != null ? `${g.status} ${g.team_score}-${g.opponent_score}` : (g.status ?? ""),
    })),
    totals: {
      played: played.length,
      started: games.filter((g) => g.started).length,
      minutes: Math.round(sum("minutes")),
      goals: sum("goals"),
      assists: sum("assists"),
      points: sum("points"),
      shots: sum("shots"),
      shots_on_goal: sum("shots_on_goal"),
      yellow_cards: sum("yellow_cards"),
      red_cards: sum("red_cards"),
      saves: games.some((g) => g.is_goalie) ? sum("saves") : null,
    },
  };

  // Physical: his average and best over the range, the team's average, and his rank on the team by average.
  const mineCounted = mine.filter(counts);
  const byPlayer = new Map<number, ReportSession[]>();
  for (const s of team) byPlayer.set(s.player_id, [...(byPlayer.get(s.player_id) ?? []), s]);
  const physical = REPORT_METRICS.map((m) => {
    const vals = mineCounted.map((s) => num(s[m.key])).filter((v): v is number => v !== null);
    const avg = mean(vals);
    const bestSession = mineCounted.reduce<ReportSession | null>((b, s) => ((num(s[m.key]) ?? -Infinity) > (b ? (num(b[m.key]) ?? -Infinity) : -Infinity) ? s : b), null);
    const teamAvg = mean(team.map((s) => num(s[m.key])).filter((v): v is number => v !== null));
    const averages = [...byPlayer.entries()]
      .map(([pid, ss]) => ({ pid, n: ss.length, avg: mean(ss.map((s) => num(s[m.key])).filter((v): v is number => v !== null)) }))
      .filter((p) => p.avg !== null && p.n >= Math.min(MIN_GAMES_TO_RANK, mineCounted.length || 1));
    const ranked = averages.sort((a, b) => (b.avg as number) - (a.avg as number));
    const at = ranked.findIndex((p) => p.pid === input.player.id);
    return {
      ...m,
      avg,
      best: bestSession ? num(bestSession[m.key]) : null,
      bestGame: bestSession ? { date: bestSession.game_date, opponent: bestSession.opponent } : null,
      teamAvg,
      rank: at >= 0 ? at + 1 : null,
      of: ranked.length,
    };
  });

  // Game by game GPS, each metric next to the team's average in that game.
  const teamByGame = new Map<number, ReportSession[]>();
  for (const s of team) teamByGame.set(s.game_id, [...(teamByGame.get(s.game_id) ?? []), s]);
  const gpsGames = mine.map((s) => {
    const others = teamByGame.get(s.game_id) ?? [];
    return {
      game_date: s.game_date,
      opponent: s.opponent,
      minutes: s.minutes_played,
      started: s.started ?? null,
      glitch: !valid(s),
      metrics: Object.fromEntries(
        REPORT_METRICS.map((m) => [m.key, { value: num(s[m.key]), teamAvg: mean(others.map((o) => num(o[m.key])).filter((v): v is number => v !== null)) }]),
      ) as Record<string, { value: number | null; teamAvg: number | null }>,
    };
  });

  return {
    generated: input.generated,
    range: { from: input.from, to: input.to },
    player: input.player,
    profile: input.profile,
    match,
    physical,
    gpsGames,
    trackedGames: mineCounted.length,
  };
}

export type PlayerReport = ReturnType<typeof buildPlayerReport>;
