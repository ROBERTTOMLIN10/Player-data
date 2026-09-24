import { getDb } from "../db/connection.js";
import type { HtmlTable, NcaaGame } from "./client.js";
import { teamToday } from "../lib/readiness.js";

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

/** Every team seen on the scoreboard in a season (default: this one), keyed by NCAA short name ("Michigan St."). */
export function teamsByName(seasonYear = Number(teamToday().slice(0, 4))): Map<string, TeamInfo> {
  const rows = getDb()
    .prepare(
      `SELECT home_name AS name, home_seo AS seo, home_conf AS conf FROM ncaa_games WHERE game_date LIKE ?1
       UNION SELECT away_name, away_seo, away_conf FROM ncaa_games WHERE game_date LIKE ?1`,
    )
    .all(`${seasonYear}-%`) as TeamInfo[];
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

/** Conference seo -> display name ("american" -> "American Conference"), for a past season if given. */
export function conferenceNames(seasonYear?: number): Record<string, string> {
  const list =
    (seasonYear !== undefined ? getCache<{ name: string; display: string }[]>(`conferences-${seasonYear}`)?.value : undefined) ??
    getCache<{ name: string; display: string }[]>("conferences")?.value ??
    [];
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

/**
 * Conference tournament games, which NCAA's data doesn't flag. A conference
 * game is a tournament game when the two teams already met that season (the
 * regular season is a single round robin), or, once the regular season is over,
 * when it's beyond a team's usual number of conference games (catches
 * tournament games between teams that didn't meet in a partial schedule).
 */
function tournamentGames(games: GameRow[], regularSeasonOver: boolean): Set<number> {
  const out = new Set<number>();
  const byConf = new Map<string, GameRow[]>();
  for (const g of games) {
    if (!g.is_conference || !g.home_conf) continue;
    byConf.set(g.home_conf, [...(byConf.get(g.home_conf) ?? []), g]);
  }
  for (const list of byConf.values()) {
    list.sort((a, b) => a.game_date.localeCompare(b.game_date) || (a.start_epoch ?? 0) - (b.start_epoch ?? 0));
    const met = new Set<string>();
    const regular: GameRow[] = [];
    for (const g of list) {
      const pair = [g.home_seo, g.away_seo].sort().join("|");
      if (met.has(pair)) out.add(g.contest_id);
      else {
        met.add(pair);
        regular.push(g);
      }
    }
    if (!regularSeasonOver) continue;
    // Usual number of conference games per team: the most common count.
    const counts = new Map<string, number>();
    for (const g of regular) for (const t of [g.home_seo, g.away_seo]) counts.set(t, (counts.get(t) ?? 0) + 1);
    const freq = new Map<number, number>();
    for (const n of counts.values()) freq.set(n, (freq.get(n) ?? 0) + 1);
    const usual = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
    if (!usual) continue;
    const played = new Map<string, number>();
    for (const g of regular) {
      const h = (played.get(g.home_seo) ?? 0) + 1;
      const a = (played.get(g.away_seo) ?? 0) + 1;
      played.set(g.home_seo, h);
      played.set(g.away_seo, a);
      if (h > usual || a > usual) out.add(g.contest_id);
    }
  }
  return out;
}

/**
 * Regular-season conference tables (conference tournaments left out): 3 pts
 * per win, 1 per tie, sorted by points, goal difference, goals for.
 */
export function computeStandings(seasonYear: number, beforeDate?: string): ConferenceStandings[] {
  const games = getDb()
    .prepare("SELECT * FROM ncaa_games WHERE state = 'F' AND game_date LIKE ? AND game_date < ?")
    .all(`${seasonYear}-%`, beforeDate ?? "9999-12-31") as GameRow[];
  const current = Number(teamToday().slice(0, 4));
  const regularSeasonOver = seasonYear < current || (beforeDate ?? teamToday()) >= `${seasonYear}-11-01`;
  const tournament = tournamentGames(games, regularSeasonOver);
  const names = conferenceNames(seasonYear === current ? undefined : seasonYear);

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
      if (!g.is_conference || !c || tournament.has(g.contest_id)) continue;
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

  // Only NCAA D1 conferences (non-D1 opponents carry their own conference ids).
  const d1 = Object.keys(names).length > 0 ? new Set(Object.keys(names)) : null;
  return [...conf.entries()]
    .filter(([seo]) => !d1 || d1.has(seo))
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

// Names that differ between NCAA's poll/RPI pages (or Wikipedia's polls) and its scoreboard.
const NAME_ALIASES: Record<string, string> = {
  umkc: "kansas city",
  umass: "massachusetts",
  charleston: "col of charleston",
  "college of charleston": "col of charleston",
  "loyola marymount": "lmu (ca)",
  lmu: "lmu (ca)",
  "saint marys": "saint marys (ca)",
  "st marys": "saint marys (ca)",
  "st johns": "st johns (ny)",
  "saint johns": "st johns (ny)",
  "st thomas": "st thomas (mn)",
  "unc wilmington": "uncw",
  "florida atlantic": "fla atlantic",
  "seattle": "seattle u",
  "southern methodist": "smu",
  "central florida": "ucf",
  "connecticut": "uconn",
  "north carolina state": "nc state",
};

/** "Missouri State" / "Missouri St." -> "missouri st" so tables using either spelling match. */
function normalizeName(name: string): string {
  const n = name
    .toLowerCase()
    .replace(/\s*\(\d+\)$/, "") // first-place votes, e.g. "South Carolina (8)"
    .replace(/\bstate\b/g, "st")
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return NAME_ALIASES[n] ?? n;
}

/**
 * NCAA abbreviates words ("Western Mich.", "Fla. Gulf Coast"): match when every
 * word is equal or an abbreviated prefix of the full word.
 */
function abbreviationMatch(full: string, short: string): boolean {
  const a = full.split(" ");
  const b = short.split(" ");
  return a.length === b.length && b.every((w, i) => w === a[i] || (w.length >= 2 && a[i].startsWith(w)));
}

export function enrichTable(table: HtmlTable, teams = teamsByName()): EnrichedTable {
  const col = table.columns.findIndex((c) => ["team", "school"].includes(c.toLowerCase()));
  const all = [...teams.values()];
  const byNormalized = new Map(all.map((t) => [normalizeName(t.name), t]));
  const bySeo = new Map(all.map((t) => [t.seo, t]));
  const abbreviated = all.map((t) => ({ t, words: normalizeName(t.name) }));
  return {
    ...table,
    teams: table.rows.map((r) => {
      if (col === -1) return null;
      const name = r[col].replace(/\s*\(\d+\)$/, "");
      const n = normalizeName(name);
      return (
        teams.get(name) ??
        byNormalized.get(n) ??
        bySeo.get(n.replace(/[^a-z0-9]+/g, "-")) ??
        abbreviated.find((x) => abbreviationMatch(n, x.words))?.t ??
        null
      );
    }),
  };
}

/**
 * Standings with each team's daily movement: position now vs. the table at the
 * start of today (results before today). move > 0 = moved up that many places.
 */
export function standingsWithMovement(seasonYear: number) {
  const before = new Map<string, number>();
  for (const c of computeStandings(seasonYear, teamToday())) c.rows.forEach((r, i) => before.set(`${c.seo}|${r.seo}`, i));
  return computeStandings(seasonYear).map((c) => ({
    ...c,
    rows: c.rows.map((r, i) => {
      const prev = before.get(`${c.seo}|${r.seo}`);
      return { ...r, move: prev === undefined ? null : prev - i };
    }),
  }));
}

// ---- Daily rank history (movement arrows on RPI / poll / stats) ----------------

/** Row identity for a table: team seo, or "player name|team" on player tables. */
function entityKeys(table: EnrichedTable): (string | null)[] {
  const nameCol = table.columns.findIndex((c) => c.toLowerCase() === "name");
  const teamCol = table.columns.findIndex((c) => ["team", "school"].includes(c.toLowerCase()));
  return table.rows.map((r, i) => {
    if (nameCol !== -1) return `${r[nameCol]}|${teamCol === -1 ? "" : r[teamCol]}`;
    return table.teams[i]?.seo ?? (teamCol === -1 ? null : r[teamCol]);
  });
}

function ranksOf(table: EnrichedTable): (number | null)[] {
  const rankCol = table.columns.findIndex((c) => c.toLowerCase() === "rank");
  return table.rows.map((r, i) => {
    const n = rankCol === -1 ? i + 1 : parseInt(r[rankCol], 10);
    return Number.isFinite(n) ? n : null;
  });
}

/** Saves today's rank for every row (re-running the same day overwrites). */
export function recordRanks(key: string, table: HtmlTable, day = teamToday()) {
  const enriched = enrichTable(table);
  const ids = entityKeys(enriched);
  const ranks = ranksOf(enriched);
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO ncaa_rank_history (key, day, entity, rank) VALUES (?, ?, ?, ?) ON CONFLICT(key, day, entity) DO UPDATE SET rank = excluded.rank",
  );
  db.transaction(() => {
    db.prepare("DELETE FROM ncaa_rank_history WHERE key = ? AND day = ?").run(key, day);
    ids.forEach((id, i) => id && ranks[i] !== null && stmt.run(key, day, id, ranks[i]));
  })();
}

/** Per row: places moved since the previous day with data (+ up, - down, null = new or unknown). */
export function rankMoves(key: string, table: EnrichedTable, day = teamToday()): (number | null)[] {
  const db = getDb();
  const prevDay = (db.prepare("SELECT MAX(day) AS d FROM ncaa_rank_history WHERE key = ? AND day < ?").get(key, day) as {
    d: string | null;
  }).d;
  if (!prevDay) return table.rows.map(() => null);
  const prev = new Map(
    (db.prepare("SELECT entity, rank FROM ncaa_rank_history WHERE key = ? AND day = ?").all(key, prevDay) as {
      entity: string;
      rank: number;
    }[]).map((r) => [r.entity, r.rank]),
  );
  const ranks = ranksOf(table);
  return entityKeys(table).map((id, i) => {
    const before = id ? prev.get(id) : undefined;
    return before === undefined || ranks[i] === null ? null : before - ranks[i]!;
  });
}
