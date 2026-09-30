import { parse } from "node-html-parser";
import { getCache, setCache } from "../ncaa/store.js";
import { parseNuxtPayload } from "../import/nuxtPayload.js";
import { firstLast, siteFetch, type GameLine, type KeeperLine, type SeasonStats, type SquadPlayer, type StatLine, type TeamGame } from "./readers.js";

/**
 * WMT stats (api.wmt.games), the NCAA live-stats feed behind the WMT athletics
 * sites (UCF, Stanford, UCLA, Notre Dame...). It has every D1 team's season,
 * so it also covers teams whose own sites we can't read (their squads just
 * come without photos). Player keys are WMT's player ids.
 */

const API = "https://api.wmt.games/api/statistics";

async function api<T>(path: string): Promise<T> {
  const res = await siteFetch(`${API}${path}`);
  if (!res.ok) throw new Error(`WMT ${path} → HTTP ${res.status}`);
  return ((await res.json()) as { data: T }).data;
}

type Stat = Record<string, number | null | undefined>;
interface WmtPlayer {
  id: number;
  jersey_no: string | null;
  first_name: string;
  last_name: string;
  position_code: string | null;
  class_short_descr: string | null;
  height_ft: number | null;
  height_in: number | null;
  statistic?: { data?: { season?: { gamesPlayed?: number; gamesStarted?: number; columns?: { period: number; statistic: Stat }[] } } };
}
interface WmtCompetitor {
  teamId: number;
  homeContest: boolean;
  score: number | null;
  nameTabular: string;
}
interface WmtGame {
  id: number;
  game_date: string;
  canceled: boolean;
  postponed: boolean;
  is_exhibition: boolean;
  stats_finalized: boolean;
  competitors: WmtCompetitor[];
}
interface WmtGamePlayer {
  team_id: number;
  player_id: number;
  xml_name: string | null;
  xml_short_name: string | null;
  games_started: number | null;
  statistic: { period: number; statistic: Stat }[];
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const whole = (v: unknown) => (n(v) === null ? null : Math.round(v as number));
/** WMT stores minutes as seconds. */
const mins = (v: unknown) => (n(v) === null ? null : Math.round((v as number) / 60));
const total = (cols: { period: number; statistic: Stat }[] | undefined) => cols?.find((c) => c.period === 0)?.statistic ?? {};
const nameOf = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`.replace(/\s+/g, " ").trim();

export async function wmtPlayers(teamId: number) {
  return api<WmtPlayer[]>(`/teams/${teamId}/players?per_page=100`);
}

export async function wmtSeasonStats(teamId: number): Promise<SeasonStats> {
  const [players, games] = await Promise.all([wmtPlayers(teamId), api<WmtGame[]>(`/teams/${teamId}/games?per_page=100`)]);
  const field: StatLine[] = [];
  const keepers: KeeperLine[] = [];
  for (const p of players) {
    const season = p.statistic?.data?.season;
    const s = total(season?.columns);
    if (!season || !n(s.sGames)) continue;
    const base = { key: String(p.id), name: nameOf(p), jersey_number: p.jersey_no ?? null, gp: whole(s.sGames), gs: whole(season.gamesStarted) };
    field.push({
      ...base,
      minutes: mins(s.sMinutes), goals: whole(s.sGoals) ?? 0, assists: whole(s.sAssists) ?? 0, points: whole(s.sPoints) ?? 0,
      shots: whole(s.sShotAttempts) ?? 0, shots_on_goal: whole(s.sShotsOnGoal) ?? 0, yellow_cards: whole(s.sYellowCards) ?? 0,
      red_cards: whole(s.sRedCards) ?? 0, game_winners: whole(s.sGameWinningGoals) ?? 0, pk_goals: whole(s.sPenaltyKickGoals), pk_attempts: whole(s.sPenaltyKickAttempts),
    });
    if (n(s.sGoalieGP) || n(s.sGoalkeeperMinutesPlayed)) {
      keepers.push({
        ...base,
        gp: whole(s.sGoalieGP) ?? base.gp, gs: whole(s.sGamesStartedAtGoalie) ?? base.gs, gk_minutes: mins(s.sGoalkeeperMinutesPlayed),
        goals_allowed: whole(s.sGoalsAllowed) ?? 0, gaa: n(s.sGoalsAgainstAverage), saves: whole(s.sSaves) ?? 0, save_pct: n(s.sSavePercentage),
        wins: whole(s.sGoalieWins) ?? 0, losses: whole(s.sGoalieLoss) ?? 0, ties: whole(s.sGoalieTie) ?? 0, shutouts: whole(s.sShutouts) ?? 0,
      });
    }
  }
  const teamGames = games
    .filter((g) => !g.canceled && !g.postponed && !g.is_exhibition)
    .map((g): TeamGame | null => {
      const us = g.competitors.find((c) => c.teamId === teamId);
      const them = g.competitors.find((c) => c.teamId !== teamId);
      if (!us || !them) return null;
      const done = g.stats_finalized && us.score !== null && them.score !== null;
      const result = done ? `${us.score! > them.score! ? "W" : us.score! < them.score! ? "L" : "T"} ${us.score}-${them.score}` : null;
      // game_date is the local kick-off time written with a Z, so its date part is the local date.
      return { date: g.game_date.slice(0, 10), opponent: them.nameTabular, home: us.homeContest, result, boxscoreUrl: `${API}/games/${g.id}/players#${teamId}` };
    })
    .filter((g): g is TeamGame => g !== null);
  return { players: field, keepers, games: teamGames };
}

/** One team's player lines from a WMT game (the url is `${API}/games/<id>/players#<teamId>`). */
export async function wmtBoxscore(url: string): Promise<GameLine[]> {
  const [path, team] = url.slice(API.length).split("#");
  const players = await api<WmtGamePlayer[]>(path);
  return players
    .filter((p) => p.team_id === Number(team))
    .map((p): GameLine => {
      const s = total(p.statistic);
      return {
        key: String(p.player_id),
        name: p.xml_name ?? firstLast(p.xml_short_name ?? ""),
        started: p.games_started === 1,
        minutes: mins(s.sMinutes), goals: whole(s.sGoals) ?? 0, assists: whole(s.sAssists) ?? 0, shots: whole(s.sShotAttempts) ?? 0,
        shots_on_goal: whole(s.sShotsOnGoal) ?? 0, yellow_cards: whole(s.sYellowCards) ?? 0, red_cards: whole(s.sRedCards) ?? 0,
        saves: n(s.sGoalkeeperMinutesPlayed) || n(s.sGoalieGP) ? whole(s.sSaves) ?? 0 : null,
        goals_allowed: n(s.sGoalkeeperMinutesPlayed) || n(s.sGoalieGP) ? whole(s.sGoalsAllowed) ?? 0 : null,
      };
    })
    .filter((l) => (l.minutes ?? 0) > 0 || l.started);
}

// ---- Squad: WMT's roster, with photos and bios from the team's own site when it can be read ----

interface SiteExtra {
  name: string;
  jersey: string | null;
  photo_url: string | null;
  profile_url: string | null;
  weight?: number | null;
  hometown?: string | null;
  high_school?: string | null;
  previous_school?: string | null;
  major?: string | null;
  year_long?: string | null;
  position_long?: string | null;
}

const lastName = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, "").trim().split(" ").pop() ?? "";

/** Photos and bios from a WMT (Nuxt) roster page: its "roster-…-players-list" data. */
function nuxtExtras(html: string, pageUrl: string): SiteExtra[] {
  const root = parseNuxtPayload(html) as Record<string, any> | null;
  const data = (root?.data ?? {}) as Record<string, any>;
  const list = Object.entries(data).find(([k, v]) => /players-list/.test(k) && Array.isArray(v))?.[1] as Record<string, any>[] | undefined;
  const base = pageUrl.replace(/\/+$/, "");
  return (list ?? []).map((p) => ({
    name: String(p.player?.full_name ?? `${p.player?.first_name ?? ""} ${p.player?.last_name ?? ""}`).trim(),
    jersey: p.jersey_number_label ?? (p.jersey_number !== null && p.jersey_number !== undefined ? String(p.jersey_number) : null),
    photo_url: p.photo?.url ?? p.player?.master_photo?.url ?? null,
    profile_url: p.player?.slug ? `${base}/player/${p.player.slug}` : null,
    weight: typeof p.weight === "number" ? p.weight : null,
    hometown: p.player?.hometown ?? null,
    high_school: p.player?.high_school ?? null,
    previous_school: p.player?.previous_school ?? null,
    major: p.player?.major ?? null,
    year_long: p.class_level?.name ?? null,
    position_long: p.player_position?.name ?? null,
  }));
}

/** Photos from a WMT WordPress roster page (Kentucky, South Carolina): schema.org athlete cards. */
function wordpressExtras(html: string): SiteExtra[] {
  const doc = parse(html);
  const seen = new Set<string>();
  const out: SiteExtra[] = [];
  for (const card of doc.querySelectorAll("[itemprop=athlete]")) {
    const name = card.querySelector("[itemprop=name]")?.getAttribute("content")?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const img = card.querySelector("img");
    const photo = img?.getAttribute("data-src") ?? img?.getAttribute("src") ?? card.querySelector("[data-bg]")?.getAttribute("data-bg") ?? null;
    const number = card.querySelector(".number, .roster-item__number")?.text.trim() || null;
    out.push({ name, jersey: number, photo_url: photo && !photo.startsWith("data:") ? photo : null, profile_url: card.querySelector("a[href*='/roster/player/']")?.getAttribute("href") ?? null });
  }
  return out;
}

/** The site's photo/bio for a WMT player: same shirt number and surname, else a unique surname. */
function matchExtra(extras: SiteExtra[], p: WmtPlayer): SiteExtra | undefined {
  const last = lastName(nameOf(p));
  const sameLast = extras.filter((e) => lastName(e.name) === last);
  return sameLast.find((e) => e.jersey && e.jersey === p.jersey_no) ?? (sameLast.length === 1 ? sameLast[0] : undefined);
}

/** A WMT team's squad: every player on its WMT roster, with photo and bio from `rosterUrl` when given. */
export async function wmtRoster(teamId: number, rosterUrl: string | null): Promise<SquadPlayer[]> {
  const players = await wmtPlayers(teamId);
  let extras: SiteExtra[] = [];
  if (rosterUrl) {
    try {
      const res = await siteFetch(rosterUrl);
      if (res.ok) {
        const html = await res.text();
        extras = html.includes("__NUXT_DATA__") ? nuxtExtras(html, res.url) : wordpressExtras(html);
      }
    } catch {
      /* no photos this time */
    }
  }
  return players.map((p): SquadPlayer => {
    const e = matchExtra(extras, p);
    return {
      key: String(p.id),
      name: nameOf(p),
      jersey_number: p.jersey_no ?? e?.jersey ?? null,
      position_short: p.position_code ?? null,
      position_long: e?.position_long ?? null,
      academic_year: p.class_short_descr ?? null,
      academic_year_long: e?.year_long ?? null,
      height_feet: p.height_ft ?? null,
      height_inches: p.height_ft ? p.height_in ?? 0 : null,
      weight: e?.weight ?? null,
      hometown: e?.hometown ?? null,
      high_school: e?.high_school ?? null,
      previous_school: e?.previous_school ?? null,
      major: e?.major ?? null,
      birth_date: null,
      is_captain: 0,
      instagram: null,
      photo_url: e?.photo_url ?? null,
      profile_url: e?.profile_url ?? null,
    };
  });
}

/** The men's soccer WMT team id on a WMT roster page (the page also carries other sports' ids, so read the roster's own). */
export function wmtTeamIdFromPage(html: string): number | null {
  try {
    const root = parseNuxtPayload(html) as Record<string, any> | null;
    const data = (root?.data ?? {}) as Record<string, any>;
    const list = Object.entries(data).find(([k, v]) => /players-list/.test(k) && Array.isArray(v))?.[1] as Record<string, any>[] | undefined;
    const fromList = list?.find((p) => p?.roster?.wmt_stats2_team_id)?.roster?.wmt_stats2_team_id;
    if (fromList) return Number(fromList);
    const view = Object.entries(data).find(([k]) => /^sport-view-/.test(k))?.[1] as Record<string, any> | undefined;
    if (view?.default_roster?.wmt_stats2_team_id) return Number(view.default_roster.wmt_stats2_team_id);
  } catch {
    /* not a Nuxt page */
  }
  const iframe = html.match(/wmt\.games\/[a-z0-9-]+\/stats\/season\/(\d{5,})/);
  return iframe ? Number(iframe[1]) : null;
}

// ---- Finding any team's WMT id: walk the season's schedules from a known team, collecting opponents ----

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/\bst\b\.?/g, "st")
    .replace(/[^a-z0-9]+/g, "");

/**
 * WMT team ids for this season by team name, found by walking schedules
 * outward from `seeds` (team ids we already know) until every wanted name is
 * found or the walk runs out. Cached for the season; walked again at most
 * daily while names are still missing.
 */
export async function wmtDirectory(seeds: number[], wanted: string[], year: number): Promise<Map<string, number>> {
  const cacheKey = `wmt-teams-${year}`;
  const hit = getCache<Record<string, number>>(cacheKey);
  const cached = new Map(Object.entries(hit?.value ?? {}));
  const missing = () => wanted.filter((w) => !cached.has(norm(w)));
  const fresh = hit && Date.now() - Date.parse(`${hit.updatedAt.replace(" ", "T")}Z`) < 86400_000;
  if (!missing().length || (fresh && cached.size)) return cached;
  // Walk teams we still need first (their opponents are the likeliest to include the rest), gently.
  const queue = [...new Set([...seeds, ...cached.values()])];
  const walked = new Set<number>();
  let failed = 0;
  for (let i = 0; i < queue.length && missing().length && walked.size < 150; i++) {
    const id = queue[i];
    if (walked.has(id)) continue;
    walked.add(id);
    await new Promise((r) => setTimeout(r, 250));
    try {
      const games = await api<WmtGame[]>(`/teams/${id}/games?per_page=100`);
      for (const g of games)
        for (const c of g.competitors) {
          if (!cached.has(norm(c.nameTabular))) cached.set(norm(c.nameTabular), c.teamId);
          if (!walked.has(c.teamId)) queue.push(c.teamId);
        }
    } catch {
      failed++;
    }
  }
  setCache(cacheKey, Object.fromEntries(cached));
  const left = missing();
  console.log(`[teams] WMT directory: ${cached.size} teams from ${walked.size} schedules (${failed} failed)${left.length ? `; not found: ${left.join(", ")}` : ""}`);
  return cached;
}

/** A team's WMT id from the season's directory (built during discovery), if known. */
export function wmtIdByName(name: string, year: number): number | null {
  return getCache<Record<string, number>>(`wmt-teams-${year}`)?.value?.[norm(name)] ?? null;
}

export const isWmtBoxscore = (url: string) => url.startsWith(API);

export const wmtName = norm;
