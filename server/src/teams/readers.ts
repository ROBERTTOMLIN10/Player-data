import { parse, type HTMLElement } from "node-html-parser";
import { parseNuxtPayload } from "../import/nuxtPayload.js";
import type { RosterProfile } from "../import/sidearmRoster.js";

/**
 * Readers for other teams' athletics websites (Sidearm). Each returns plain
 * rows for the sync to store: the squad with profiles, season stats (field
 * players and keepers), the season's games with box score links, and each
 * player's line from a box score.
 */

export interface SquadPlayer extends RosterProfile {
  key: string; // the site's roster bio id
  name: string; // "First Last"
  jersey_number: string | null;
  position_short: string | null;
  academic_year: string | null;
}

export interface StatLine {
  key: string;
  name: string;
  jersey_number: string | null;
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
  game_winners: number | null;
  pk_goals: number | null;
  pk_attempts: number | null;
}

export interface KeeperLine {
  key: string;
  name: string;
  jersey_number: string | null;
  gp: number | null;
  gs: number | null;
  gk_minutes: number | null;
  goals_allowed: number | null;
  gaa: number | null;
  saves: number | null;
  save_pct: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  shutouts: number | null;
}

export interface TeamGame {
  date: string; // YYYY-MM-DD
  opponent: string;
  home: boolean;
  result: string | null; // "W 2-1"
  boxscoreUrl: string; // absolute
}

export interface SeasonStats {
  players: StatLine[];
  keepers: KeeperLine[];
  games: TeamGame[];
}

export interface GameLine {
  key: string;
  name: string;
  started: boolean;
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

const UA = "Mozilla/5.0 (compatible; FAU men's soccer staff app)";
// Some sites' firewalls turn away anything that doesn't look like a browser.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** GET a team site page: our own user agent first, a browser's if that's refused. */
export async function siteFetch(url: string): Promise<Response> {
  const get = (ua: string) => fetch(url, { headers: { "user-agent": ua }, signal: AbortSignal.timeout(20_000) });
  try {
    const res = await get(UA);
    if (res.status !== 403 && res.status !== 406 && res.status !== 429) return res;
  } catch {
    /* connection refused/reset: try as a browser */
  }
  return get(BROWSER_UA);
}

async function fetchHtml(url: string): Promise<string> {
  const res = await siteFetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const int = (v: unknown): number | null => {
  const s = str(v);
  if (s === null || s === "-" || s === "") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
};
const dec = (v: unknown): number | null => {
  const s = str(v);
  if (s === null || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
/** "720:00" or "706:16" → whole minutes. */
const minutesOf = (v: unknown): number | null => {
  const s = str(v);
  if (!s) return null;
  const [m] = s.split(":");
  return int(m);
};
const pair = (v: unknown): [number | null, number | null] => {
  const s = str(v);
  if (!s || !s.includes("-")) return [null, null];
  const [a, b] = s.split("-");
  return [int(a), int(b)];
};
/** "Last, First" → "First Last". */
export const firstLast = (name: string) => {
  const i = name.indexOf(",");
  return (i === -1 ? name : `${name.slice(i + 1)} ${name.slice(0, i)}`).replace(/\s+/g, " ").trim();
};
/** "08/20/2026" → "2026-08-20". */
const isoDate = (s: string | null) => {
  const m = s?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
};
const absolute = (host: string, path: string | null | undefined) => (path ? new URL(path, `https://${host}`).toString() : null);
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function blankProfile(): RosterProfile {
  return {
    position_long: null, academic_year_long: null, height_feet: null, height_inches: null, weight: null,
    hometown: null, high_school: null, previous_school: null, major: null, birth_date: null,
    is_captain: 0, instagram: null, photo_url: null, profile_url: null,
  };
}

// ---- Sidearm (Nuxt) ------------------------------------------------------------

export async function nuxtRoster(host: string, html?: string): Promise<SquadPlayer[]> {
  const root = parseNuxtPayload(html ?? (await fetchHtml(`https://${host}/sports/mens-soccer/roster`))) as Record<string, any>;
  const store = root?.pinia?.roster?.roster;
  const roster = isRecord(store) ? (Object.values(store).find((r) => isRecord(r) && Array.isArray(r.players)) as any) : null;
  if (!roster) throw new Error(`no roster found on ${host}`);
  return (roster.players as Record<string, any>[])
    .filter((p) => isRecord(p) && p.hide !== true)
    .map((p) => {
      const image = isRecord(p.image) ? p.image : {};
      const name = [str(p.firstName), str(p.lastName)].filter(Boolean).join(" ");
      return {
        key: str(p.rosterPlayerId) ?? slug(name),
        name,
        jersey_number: str(p.jerseyNumber),
        position_short: str(p.positionShort),
        academic_year: str(p.academicYearShort),
        position_long: str(p.positionLong),
        academic_year_long: str(p.academicYearLong),
        height_feet: int(p.heightFeet) || null,
        height_inches: p.heightFeet ? int(p.heightInches) : null,
        weight: int(p.weight) || null,
        hometown: str(p.hometown),
        high_school: str(p.highSchool),
        previous_school: str(p.previousSchool),
        major: str(p.major),
        birth_date: str(p.birthDate)?.slice(0, 10) ?? null,
        is_captain: p.isCaptain === true ? 1 : 0,
        instagram: null, // not shown (Rob asked to leave Instagram out)
        photo_url: str(image.absoluteUrl) ?? absolute(host, str(image.url)),
        profile_url: absolute(host, str(p.call_to_action)),
      };
    })
    .filter((p) => p.name);
}

export async function nuxtSeasonStats(host: string, year: number): Promise<SeasonStats> {
  const root = parseNuxtPayload(await fetchHtml(`https://${host}/sports/mens-soccer/stats/${year}`)) as Record<string, any>;
  const store = root?.pinia?.statsSeason?.cumulativeStats;
  const cs = isRecord(store) ? (Object.values(store).find(isRecord) as any) : null;
  if (!cs?.overallIndividualStats) throw new Error(`no season stats on ${host}`);
  const rows = (list: unknown) => (Array.isArray(list) ? list.filter((r) => isRecord(r) && !r.isAFooterStat) : []) as Record<string, any>[];
  const keyOf = (r: Record<string, any>) => str(r.playerRosterBioId) ?? slug(firstLast(str(r.playerName) ?? ""));
  const players = rows(cs.overallIndividualStats.individualOffensiveStats).map((r): StatLine => {
    const [yc, rc] = pair(r.yellowCardsRedCards);
    const [pkg, pka] = pair(r.penaltyKicksAndAttempts);
    return {
      key: keyOf(r),
      name: firstLast(str(r.playerName) ?? ""),
      jersey_number: str(r.playerUniform),
      gp: int(r.gamesPlayed), gs: int(r.gamesStarted), minutes: minutesOf(r.minutesPlayed),
      goals: int(r.goals), assists: int(r.assists), points: int(r.points),
      shots: int(r.shots), shots_on_goal: int(r.shotsOnGoal),
      yellow_cards: yc, red_cards: rc, game_winners: int(r.gameWinners), pk_goals: pkg, pk_attempts: pka,
    };
  });
  const keepers = rows(cs.overallIndividualStats.goalieStats).map((r): KeeperLine => ({
    key: keyOf(r),
    name: firstLast(str(r.playerName) ?? ""),
    jersey_number: str(r.playerUniform),
    gp: int(r.gamesPlayed), gs: int(r.gamesStarted), gk_minutes: minutesOf(r.minutesPlayed),
    goals_allowed: int(r.goalsAllowed), gaa: dec(r.goalsAgainstAverage), saves: int(r.saves), save_pct: dec(r.savesPercentage),
    wins: int(r.wins), losses: int(r.losses), ties: int(r.ties), shutouts: int(r.shutouts),
  }));
  const games = rows(cs.gameResults)
    .map((g): TeamGame | null => {
      const date = isoDate(str(g.date));
      const url = absolute(host, str(g.boxscoreUrl));
      if (!date || !url) return null;
      const wlt = str(g.winLossTie);
      return { date, opponent: str(g.opponent) ?? "", home: g.thisTeamIsHomeTeam === true, result: wlt ? `${wlt} ${str(g.score) ?? ""}`.trim() : null, boxscoreUrl: url };
    })
    .filter((g): g is TeamGame => g !== null);
  return { players, keepers, games };
}

/** This site's team's lines from one of its (Nuxt) box scores. */
export async function nuxtBoxscore(url: string): Promise<GameLine[]> {
  const root = parseNuxtPayload(await fetchHtml(url)) as Record<string, any>;
  const store = root?.pinia?.boxscore?.boxscore;
  const bs = isRecord(store) ? (Object.values(store).find(isRecord) as any) : null;
  if (!bs) throw new Error(`no box score at ${url}`);
  const team = bs.thisTeamIsHomeTeam ? bs.homeTeam : bs.visitingTeam;
  const players = Array.isArray(team?.players) ? (team.players as Record<string, any>[]) : [];
  const byKey = new Map<string, GameLine>();
  for (const p of players) {
    const name = str(p.playerFirstLastName) ?? firstLast(str(p.name) ?? "");
    const key = str(p.rosterPlayerId) ?? slug(name);
    const shots = isRecord(p.shots) ? p.shots : {};
    const pen = isRecord(p.penalties) ? p.penalties : {};
    const gk = isRecord(p.goalie) ? p.goalie : null;
    const line: GameLine = {
      key, name,
      started: str(p.gameStarted) === "1",
      minutes: minutesOf(p.minutesPlayed),
      goals: int(shots.goals), assists: int(shots.assists), shots: int(shots.numberOfShots), shots_on_goal: int(shots.shotsOnGoal),
      yellow_cards: int(pen.yellow), red_cards: int(pen.red),
      saves: gk ? int(gk.saves) : null, goals_allowed: gk ? int(gk.goalsAllowed) : null,
    };
    // Sidearm sometimes lists a player twice (e.g. keeper + field line): keep the fuller one.
    const prev = byKey.get(key);
    if (!prev || (line.minutes ?? 0) > (prev.minutes ?? 0) || (line.saves !== null && prev.saves === null)) byKey.set(key, { ...prev, ...line, saves: line.saves ?? prev?.saves ?? null, goals_allowed: line.goals_allowed ?? prev?.goals_allowed ?? null });
  }
  // Only players who got on the pitch count as a game played.
  return [...byKey.values()].filter((l) => (l.minutes ?? 0) > 0 || l.started);
}

// ---- Sidearm classic (server-rendered HTML) ------------------------------------

const text = (el: HTMLElement | null | undefined) => el?.text.replace(/\s+/g, " ").trim() || null;

export async function classicRoster(host: string, html?: string): Promise<SquadPlayer[]> {
  const doc = parse(html ?? (await fetchHtml(`https://${host}/sports/mens-soccer/roster`)));
  const items = doc.querySelectorAll("li.sidearm-roster-player");
  if (!items.length) throw new Error(`no roster found on ${host}`);
  return items.map((li) => {
    const nameEl = li.querySelector(".sidearm-roster-player-name a") ?? li.querySelector(".sidearm-roster-player-name h3");
    const jersey = text(li.querySelector(".sidearm-roster-player-jersey-number"));
    let name = text(nameEl) ?? text(li.querySelector(".sidearm-roster-player-name")) ?? "";
    if (jersey && name.startsWith(`${jersey} `)) name = name.slice(jersey.length + 1);
    const height = text(li.querySelector(".sidearm-roster-player-height"))?.match(/(\d+)'\s*(\d+)?/);
    const img = li.querySelector(".sidearm-roster-player-image img");
    const src = img?.getAttribute("data-src") ?? img?.getAttribute("src") ?? null;
    const url = li.getAttribute("data-player-url") ?? null;
    const positions = li.querySelectorAll(".sidearm-roster-player-position-long-short").map((e) => text(e)).filter(Boolean) as string[];
    return {
      ...blankProfile(),
      key: li.getAttribute("data-player-id") ?? slug(name),
      name,
      jersey_number: jersey,
      position_short: positions[1] ?? positions[0] ?? null,
      position_long: positions[0] ?? null,
      academic_year: text(li.querySelector(".sidearm-roster-player-academic-year")),
      height_feet: height ? int(height[1]) : null,
      height_inches: height ? int(height[2] ?? "0") : null,
      weight: int(text(li.querySelector(".sidearm-roster-player-weight"))?.replace(/\D/g, "")),
      hometown: text(li.querySelector(".sidearm-roster-player-hometown")),
      high_school: text(li.querySelector(".sidearm-roster-player-highschool")),
      previous_school: text(li.querySelector(".sidearm-roster-player-previous-school")),
      photo_url: src && !src.startsWith("data:") ? absolute(host, src.split("?")[0]) : null,
      profile_url: absolute(host, url),
    };
  }).filter((p) => p.name);
}

export async function classicSeasonStats(host: string, year: number): Promise<SeasonStats> {
  const doc = parse(await fetchHtml(`https://${host}/sports/mens-soccer/stats/${year}`));
  const cells = (tr: HTMLElement) => Object.fromEntries(tr.querySelectorAll("td[data-label]").map((td) => [td.getAttribute("data-label")!.toUpperCase(), text(td)]));
  const who = (tr: HTMLElement) => {
    const a = tr.querySelector("a[data-player-id]");
    const name = firstLast(text(a) ?? "");
    return { key: a?.getAttribute("data-player-id") ?? slug(name), name, jersey_number: text(tr.querySelector("td"))?.replace(/\D/g, "") || null };
  };
  const rowsOf = (id: string) => doc.querySelector(`#${id}`)?.querySelectorAll("tbody tr").filter((tr) => tr.querySelector("a[data-player-id]")) ?? [];
  const players = rowsOf("individual-overall-offensive").map((tr): StatLine => {
    const c = cells(tr);
    const [yc, rc] = pair(c["YC-RC"]);
    const [pkg, pka] = pair(c["PG-PA"]);
    return {
      ...who(tr),
      gp: int(c.GP), gs: int(c.GS), minutes: minutesOf(c.MIN), goals: int(c.G), assists: int(c.A), points: int(c.PTS),
      shots: int(c.SH), shots_on_goal: int(c.SOG), yellow_cards: yc, red_cards: rc, game_winners: int(c.GW), pk_goals: pkg, pk_attempts: pka,
    };
  });
  const keepers = rowsOf("individual-overall-goalkeeping").map((tr): KeeperLine => {
    const c = cells(tr);
    return {
      ...who(tr),
      gp: int(c.GP), gs: int(c.GS), gk_minutes: minutesOf(c.MIN), goals_allowed: int(c.GA), gaa: dec(c.GAA), saves: int(c.SV),
      save_pct: dec(c["SV%"]), wins: int(c.W), losses: int(c.L), ties: int(c.T), shutouts: int(c.SHO),
    };
  });
  // Game-by-game table: date, "at"/"vs" + opponent (linking to the box score), score (this team's goals first).
  const games = (doc.querySelector("#game-game-our-offensive")?.querySelectorAll("tbody tr") ?? [])
    .map((tr): TeamGame | null => {
      const tds = tr.querySelectorAll("td");
      const a = tds[1]?.querySelector("a[href*='boxscore']");
      const date = isoDate(text(tds[0]));
      const url = absolute(host, a?.getAttribute("href")?.replace(/&amp;/g, "&"));
      if (!date || !url) return null;
      const [us, them] = pair(text(tr.querySelector("td[data-label='Score']")));
      const result = us === null || them === null ? null : `${us > them ? "W" : us < them ? "L" : "T"} ${us}-${them}`;
      return { date, opponent: text(a) ?? "", home: !/^at\b/i.test(text(tds[1]) ?? ""), result, boxscoreUrl: url };
    })
    .filter((g): g is TeamGame => g !== null);
  return { players, keepers, games };
}

/** This site's team's lines from one of its classic box scores (its players link to its roster). */
export async function classicBoxscore(url: string): Promise<GameLine[]> {
  const doc = parse(await fetchHtml(url));
  const tables = doc.querySelectorAll("table");
  const caption = (t: HTMLElement) => text(t.querySelector("caption")) ?? "";
  const ours = (t: HTMLElement) => Boolean(t.querySelector("a[href*='/roster/']"));
  const field = tables.find((t) => /- Player Stats$/i.test(caption(t)) && ours(t));
  if (!field) throw new Error(`no player stats at ${url}`);
  const abbr = caption(field).replace(/\s*- Player Stats$/i, "").trim();
  const keyOf = (a: HTMLElement | null, name: string) => a?.getAttribute("href")?.match(/\/roster\/[^/]+\/(\d+)/)?.[1] ?? slug(name);
  const byJersey = new Map<string, GameLine>();
  const lines: GameLine[] = [];
  let starters = false;
  for (const tr of field.querySelectorAll("tbody tr")) {
    const group = tr.querySelector("th.header-group");
    if (group) {
      starters = /starter/i.test(text(group) ?? "");
      continue;
    }
    const tds = tr.querySelectorAll("td");
    if (tds.length < 4) continue;
    const a = tr.querySelector("a[href*='/roster/']");
    const name = firstLast(text(a) ?? (text(tds[2])?.replace(/^\d+\s+/, "") ?? ""));
    if (!name) continue;
    const c = Object.fromEntries(tr.querySelectorAll("td[data-label]").map((td) => [td.getAttribute("data-label")!.toUpperCase(), text(td)]));
    const line: GameLine = {
      key: keyOf(a, name), name, started: starters, minutes: int(c.MIN),
      goals: int(c.G), assists: int(c.A), shots: int(c.SH), shots_on_goal: int(c.SOG),
      yellow_cards: 0, red_cards: 0, saves: null, goals_allowed: null,
    };
    lines.push(line);
    const jersey = text(tds[1])?.replace(/\D/g, "");
    if (jersey) byJersey.set(jersey, line);
  }
  // Keepers: saves and goals against.
  const gk = tables.find((t) => /- Goalie Statistics$/i.test(caption(t)) && ours(t));
  for (const tr of gk?.querySelectorAll("tbody tr") ?? []) {
    const a = tr.querySelector("a[href*='/roster/']");
    if (!a) continue;
    const c = Object.fromEntries(tr.querySelectorAll("td[data-label]").map((td) => [td.getAttribute("data-label")!.toUpperCase(), text(td)]));
    const line = lines.find((l) => l.key === keyOf(a, firstLast(text(a) ?? "")));
    if (line) {
      line.saves = int(c.S ?? c.SAVES);
      line.goals_allowed = int(c.GA);
    }
  }
  // Cards: "#3 Mats Vogel" under this team's abbreviation.
  const cards = tables.find((t) => /caution/i.test(caption(t)));
  for (const tr of cards?.querySelectorAll("tbody tr") ?? []) {
    const tds = tr.querySelectorAll("td");
    if (!tds.some((td) => text(td) === abbr)) continue;
    const jersey = tds.map((td) => text(td)?.match(/^#(\d+)/)?.[1]).find(Boolean);
    const line = jersey ? byJersey.get(jersey) : undefined;
    if (!line) continue;
    if (/red/i.test(tds[0]?.getAttribute("class") ?? "")) line.red_cards = (line.red_cards ?? 0) + 1;
    else line.yellow_cards = (line.yellow_cards ?? 0) + 1;
  }
  return lines.filter((l) => (l.minutes ?? 0) > 0 || l.started);
}
