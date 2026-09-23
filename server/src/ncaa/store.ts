import { getDb } from "../db/connection.js";
import type { HtmlTable, NcaaGame } from "./client.js";

// ---- Games -----------------------------------------------------------------------

export function upsertGames(games: NcaaGame[]) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO ncaa_games (contest_id, game_date, start_epoch, start_time, has_start_time, state, status, period, clock,
       final_message, home_seo, home_name, home_rank, home_score, home_conf, away_seo, away_name, away_rank, away_score,
       away_conf, is_conference, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(contest_id) DO UPDATE SET
       game_date = excluded.game_date, start_epoch = excluded.start_epoch, start_time = excluded.start_time,
       has_start_time = excluded.has_start_time, state = excluded.state, status = excluded.status,
       period = excluded.period, clock = excluded.clock, final_message = excluded.final_message,
       home_seo = excluded.home_seo, home_name = excluded.home_name, home_rank = excluded.home_rank,
       home_score = excluded.home_score, home_conf = excluded.home_conf, away_seo = excluded.away_seo,
       away_name = excluded.away_name, away_rank = excluded.away_rank, away_score = excluded.away_score,
       away_conf = excluded.away_conf, is_conference = excluded.is_conference, updated_at = excluded.updated_at`,
  );
  db.transaction(() => {
    for (const g of games) {
      const isConference = g.home.conf !== null && g.home.conf === g.away.conf ? 1 : 0;
      stmt.run(
        g.contestId, g.date, g.startEpoch, g.startTime, g.hasStartTime ? 1 : 0, g.state, g.status, g.period, g.clock,
        g.finalMessage, g.home.seo, g.home.name, g.home.rank, g.home.score, g.home.conf, g.away.seo, g.away.name,
        g.away.rank, g.away.score, g.away.conf, isConference,
      );
    }
  })();
}

export interface GameRow {
  contest_id: number;
  game_date: string;
  start_epoch: number | null;
  start_time: string | null;
  has_start_time: number;
  state: string;
  status: string;
  period: string;
  clock: string;
  final_message: string;
  home_seo: string;
  home_name: string;
  home_rank: number | null;
  home_score: number | null;
  home_conf: string | null;
  away_seo: string;
  away_name: string;
  away_rank: number | null;
  away_score: number | null;
  away_conf: string | null;
  is_conference: number;
  updated_at: string;
}

export function gamesOn(date: string): GameRow[] {
  return getDb()
    .prepare("SELECT * FROM ncaa_games WHERE game_date = ? ORDER BY start_epoch, contest_id")
    .all(date) as GameRow[];
}

export function hasGamesOn(date: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM ncaa_games WHERE game_date = ? LIMIT 1").get(date));
}

// ---- Cache (stat tables, rankings, conference names) -------------------------

export function setCache(key: string, value: unknown) {
  getDb()
    .prepare(
      `INSERT INTO ncaa_cache (key, json, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value));
}

export function getCache<T>(key: string): { value: T; updatedAt: string } | null {
  const row = getDb().prepare("SELECT json, updated_at FROM ncaa_cache WHERE key = ?").get(key) as
    | { json: string; updated_at: string }
    | undefined;
  return row ? { value: JSON.parse(row.json) as T, updatedAt: row.updated_at } : null;
}

// ---- Teams & conferences ------------------------------------------------------

export interface TeamInfo {
  seo: string;
  name: string;
  conf: string | null;
}

/** Every D1 team seen on the scoreboard this season, keyed by NCAA short name ("Michigan St."). */
export function teamsByName(): Map<string, TeamInfo> {
  const rows = getDb()
    .prepare(
      `SELECT home_name AS name, home_seo AS seo, home_conf AS conf FROM ncaa_games
       UNION SELECT away_name, away_seo, away_conf FROM ncaa_games`,
    )
    .all() as TeamInfo[];
  const map = new Map<string, TeamInfo>();
  for (const r of rows) if (r.conf || !map.has(r.name)) map.set(r.name, r);
  return map;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** Conference seo -> display name ("american" -> "American Conference"). */
export function conferenceNames(): Record<string, string> {
  const list = getCache<{ name: string; display: string }[]>("conferences")?.value ?? [];
  const names: Record<string, string> = {};
  for (const c of list) names[slug(c.name)] = c.display;
  return names;
}

export function conferenceLabel(seo: string, names = conferenceNames()): string {
  return names[seo] ?? seo.split("-").map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
}

// ---- Standings (calculated from results) --------------------------------------

export interface StandingRow {
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
  overall: string; // W-L-T across all games
}

export interface ConferenceStandings {
  seo: string;
  name: string;
  rows: StandingRow[];
}

/** Conference tables: 3 pts per win, 1 per tie, sorted by points, goal difference, goals for. */
export function computeStandings(seasonYear: number): ConferenceStandings[] {
  const games = getDb()
    .prepare("SELECT * FROM ncaa_games WHERE state = 'F' AND game_date LIKE ?")
    .all(`${seasonYear}-%`) as GameRow[];
  const names = conferenceNames();

  const blank = (seo: string, name: string) => ({ seo, name, gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0 });
  const conf = new Map<string, Map<string, ReturnType<typeof blank>>>();
  const overall = new Map<string, { w: number; l: number; t: number }>();
  const teamConf = new Map<string, string>();
  const teamName = new Map<string, string>();

  for (const g of games) {
    if (g.home_score === null || g.away_score === null) continue;
    for (const [seo, name, c, mine, theirs] of [
      [g.home_seo, g.home_name, g.home_conf, g.home_score, g.away_score],
      [g.away_seo, g.away_name, g.away_conf, g.away_score, g.home_score],
    ] as const) {
      teamName.set(seo, name);
      if (c) teamConf.set(seo, c);
      const o = overall.get(seo) ?? { w: 0, l: 0, t: 0 };
      if (mine > theirs) o.w++;
      else if (mine < theirs) o.l++;
      else o.t++;
      overall.set(seo, o);
      if (!g.is_conference || !c) continue;
      const table = conf.get(c) ?? new Map();
      const row = table.get(seo) ?? blank(seo, name);
      row.gp++;
      row.gf += mine;
      row.ga += theirs;
      if (mine > theirs) row.w++;
      else if (mine < theirs) row.l++;
      else row.t++;
      table.set(seo, row);
      conf.set(c, table);
    }
  }

  // Include conference members who haven't played a conference game yet.
  for (const [seo, c] of teamConf) {
    const table = conf.get(c) ?? new Map();
    if (!table.has(seo)) table.set(seo, blank(seo, teamName.get(seo) ?? seo));
    conf.set(c, table);
  }

  return [...conf.entries()]
    .map(([seo, table]) => ({
      seo,
      name: conferenceLabel(seo, names),
      rows: [...table.values()]
        .map((r) => {
          const o = overall.get(r.seo) ?? { w: 0, l: 0, t: 0 };
          return { ...r, gd: r.gf - r.ga, pts: r.w * 3 + r.t, overall: `${o.w}-${o.l}-${o.t}` };
        })
        .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Stat tables with team info attached ----------------------------------------

export interface EnrichedTable extends HtmlTable {
  teams: (TeamInfo | null)[]; // per row, matched from the "Team" / "School" column
}

export function enrichTable(table: HtmlTable, teams = teamsByName()): EnrichedTable {
  const col = table.columns.findIndex((c) => ["team", "school"].includes(c.toLowerCase()));
  return {
    ...table,
    teams: table.rows.map((r) => (col === -1 ? null : teams.get(r[col].replace(/\s*\(\d+\)$/, "")) ?? null)),
  };
}
