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
/** Volume numbers that also get a per-90 figure (speeds and peaks don't scale with minutes). */
const PER90 = new Set(["distance_mi", "sprints_count", "sprints_distance_yd", "explosiveness_count", "load"]);
/** Games shorter than this are left out of per-90 figures: GPS totals include warm-ups, which would blow up a short appearance. */
const PER90_MIN_MINUTES = 45;
const GROUP_LABEL: Record<string, string> = { gk: "goalkeepers", def: "defenders", mid: "midfielders", fwd: "forwards" };
/** fwd / mid / def / gk from the stored position (box score or roster). */
export function positionGroup(pos: string | null | undefined): string | null {
  const p = (pos ?? "").toLowerCase();
  if (!p) return null;
  if (p.startsWith("g")) return "gk";
  if (p.startsWith("d") || p.includes("back")) return "def";
  if (p.startsWith("m")) return "mid";
  if (p.startsWith("f") || p.includes("wing") || p.includes("striker")) return "fwd";
  return null;
}

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
  opponent_logo_url?: string | null;
}

export interface ReportInput {
  player: { id: number; canonical_name: string; position: string | null; jersey_number: string | null };
  profile: Record<string, unknown> | null;
  sessions: ReportSession[]; // this player's GPS sessions
  gameStats: ReportGameStat[]; // this player's box score lines
  teamSessions: ReportSession[]; // every player's GPS sessions (for team averages and ranks)
  positions?: Record<number, string | null>; // every player's position (fwd / mid / def / gk), for position comparisons
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

  // Physical: his average, per-90 and best over the range, against the team and his position group, with ranks.
  const mineCounted = mine.filter(counts);
  const myGroup = positionGroup(input.player.position);
  const groupOf = (pid: number) => positionGroup(input.positions?.[pid] ?? null);
  const byPlayer = new Map<number, ReportSession[]>();
  for (const s of team) byPlayer.set(s.player_id, [...(byPlayer.get(s.player_id) ?? []), s]);
  const minGames = Math.min(MIN_GAMES_TO_RANK, mineCounted.length || 1);
  const vals = (ss: ReportSession[], k: string) => ss.map((s) => num(s[k])).filter((v): v is number => v !== null);
  const per90Of = (ss: ReportSession[], k: string) => {
    const usable = ss.filter((s) => (s.minutes_played ?? 0) >= PER90_MIN_MINUTES && num(s[k]) !== null);
    const minutes = usable.reduce((n, s) => n + (s.minutes_played as number), 0);
    return usable.length && minutes ? { value: (usable.reduce((n, s) => n + (num(s[k]) as number), 0) / minutes) * 90, games: usable.length } : null;
  };
  const rankIn = (rows: { pid: number; v: number | null }[]) => {
    const ranked = rows.filter((r): r is { pid: number; v: number } => r.v !== null).sort((a, b) => b.v - a.v);
    const at = ranked.findIndex((r) => r.pid === input.player.id);
    return { rank: at >= 0 ? at + 1 : null, of: ranked.length, best: ranked[0]?.v ?? null };
  };
  const physical = REPORT_METRICS.map((m) => {
    const avg = mean(vals(mineCounted, m.key));
    const bestSession = mineCounted.reduce<ReportSession | null>((b, s) => ((num(s[m.key]) ?? -Infinity) > (b ? (num(b[m.key]) ?? -Infinity) : -Infinity) ? s : b), null);
    const teamAvg = mean(vals(team, m.key));
    const players = [...byPlayer.entries()].filter(([, ss]) => ss.length >= minGames);
    const teamRank = rankIn(players.map(([pid, ss]) => ({ pid, v: mean(vals(ss, m.key)) })));
    const posPlayers = myGroup ? players.filter(([pid]) => groupOf(pid) === myGroup) : [];
    const posRank = myGroup ? rankIn(posPlayers.map(([pid, ss]) => ({ pid, v: mean(vals(ss, m.key)) }))) : null;
    const posSessions = myGroup ? team.filter((s) => groupOf(s.player_id) === myGroup) : [];
    let per90: null | { value: number | null; teamValue: number | null; rank: number | null; of: number } = null;
    if (PER90.has(m.key)) {
      const mine90 = per90Of(mineCounted, m.key);
      const team90 = per90Of(team, m.key);
      const ranked90 = rankIn(
        [...byPlayer.entries()].map(([pid, ss]) => {
          const r = per90Of(ss, m.key);
          return { pid, v: r && r.games >= minGames ? r.value : null };
        }),
      );
      per90 = { value: mine90?.value ?? null, teamValue: team90?.value ?? null, rank: ranked90.rank, of: ranked90.of };
    }
    return {
      ...m,
      avg,
      best: bestSession ? num(bestSession[m.key]) : null,
      bestGame: bestSession ? { date: bestSession.game_date, opponent: bestSession.opponent } : null,
      teamAvg,
      teamBest: teamRank.best, // the best average on the team (for the radar chart's scale)
      rank: teamRank.rank,
      of: teamRank.of,
      posAvg: myGroup ? mean(vals(posSessions, m.key)) : null,
      posRank: posRank?.rank ?? null,
      posOf: posRank?.of ?? 0,
      per90,
    };
  });

  // Game by game GPS: each metric next to the team's average that game, his rank in the squad that game,
  // and every teammate's number (anonymous) for the squad charts.
  const teamByGame = new Map<number, ReportSession[]>();
  for (const s of team) teamByGame.set(s.game_id, [...(teamByGame.get(s.game_id) ?? []), s]);
  const gpsGames = mine.map((s) => {
    const squad = teamByGame.get(s.game_id) ?? [];
    const others = squad.filter((o) => o.player_id !== input.player.id);
    const line = games.find((g) => g.game_date === s.game_date); // his box score line that day, if any
    return {
      game_date: s.game_date,
      opponent: s.opponent,
      opponent_logo_url: line?.opponent_logo_url ?? null,
      result: line?.status && line.team_score != null && line.opponent_score != null ? `${line.status} ${line.team_score}-${line.opponent_score}` : (line?.status ?? ""),
      goals: line?.goals ?? null,
      assists: line?.assists ?? null,
      minutes: s.minutes_played,
      started: s.started ?? null,
      glitch: !valid(s),
      metrics: Object.fromEntries(
        REPORT_METRICS.map((m) => {
          const value = num(s[m.key]);
          const squadValues = vals(squad.some((o) => o.player_id === input.player.id) ? squad : [...squad, s], m.key).sort((a, b) => b - a);
          const rank = value === null ? null : squadValues.indexOf(value) + 1 || null;
          return [m.key, { value, teamAvg: mean(vals(others.length ? others : squad, m.key)), rank, of: squadValues.length, squad: squadValues }];
        }),
      ) as Record<string, { value: number | null; teamAvg: number | null; rank: number | null; of: number; squad: number[] }>,
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
    position: myGroup ? { group: myGroup, label: GROUP_LABEL[myGroup] } : null,
  };
}

export type PlayerReport = ReturnType<typeof buildPlayerReport>;
