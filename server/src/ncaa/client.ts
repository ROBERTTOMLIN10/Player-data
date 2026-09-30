/**
 * NCAA.com client for Division I men's soccer.
 *
 * NCAA.com has no official public API. The scoreboard page loads its games from
 * NCAA's data service (sdataprod.ncaa.com) with a "persisted query" id that can
 * change when NCAA redeploys, so if a request is rejected we re-read the current
 * id from the scoreboard page and retry. Stat leaders and rankings are plain
 * HTML tables on ncaa.com.
 */
const DATA_HOST = "https://sdataprod.ncaa.com";
const SITE = "https://www.ncaa.com";
const SPORT_CODE = "MSO"; // men's soccer
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Last known query ids (from the scoreboard page, Sept 2026).
const queryIds: Record<string, string> = {
  GetContests_web: "4bcb5e6432fa9da365c0c19af01b1f9015cc7eb5c21e7af2dba308784a166df7",
  NCAA_GetConferences_web: "6795d6b196a67ff7880cffab51e769a8784bc1646a9908276e0b787011df8c3f",
};

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
  return res.text();
}

function splitDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return { y, m, d };
}

/** Re-reads the current query ids from the scoreboard page's settings. */
async function refreshQueryIds(isoDate: string) {
  const { y, m, d } = splitDate(isoDate);
  const html = await fetchText(`${SITE}/scoreboard/soccer-men/d1/${y}/${m}/${d}/all-conf`);
  for (const name of Object.keys(queryIds)) {
    const match = html.match(new RegExp(`${name}[^"]*?sha256Hash%22%3A%22([0-9a-f]{64})`));
    if (match) queryIds[name] = match[1];
  }
}

async function query<T>(name: string, variables: Record<string, unknown>, isoDateForRefresh: string): Promise<T> {
  const attempt = async () => {
    const url =
      `${DATA_HOST}?meta=${name}` +
      `&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: queryIds[name] } }))}` +
      `&variables=${encodeURIComponent(JSON.stringify(variables))}`;
    const body = JSON.parse(await fetchText(url)) as { data?: T; errors?: { message: string }[] };
    if (!body.data || body.errors?.length) throw new Error(body.errors?.[0]?.message ?? "no data");
    return body.data;
  };
  try {
    return await attempt();
  } catch {
    await refreshQueryIds(isoDateForRefresh);
    return attempt();
  }
}

// ---- Scoreboard --------------------------------------------------------------

export interface NcaaTeamSide {
  seo: string;
  name: string;
  rank: number | null;
  score: number | null;
  conf: string | null; // conference seo, e.g. "american"; null for non-D1 opponents
  isHome: boolean;
}

export interface NcaaGame {
  contestId: number;
  date: string; // YYYY-MM-DD
  startEpoch: number | null;
  startTime: string | null;
  hasStartTime: boolean;
  state: string; // P | I | F
  status: string;
  period: string;
  clock: string;
  finalMessage: string;
  home: NcaaTeamSide;
  away: NcaaTeamSide;
}

interface RawContest {
  contestId: number;
  gameState: string;
  statusCodeDisplay: string;
  currentPeriod: string;
  contestClock: string;
  finalMessage: string;
  startTimeEpoch: number | null;
  startTime: string | null;
  startDate: string; // MM/DD/YYYY
  hasStartTime: boolean;
  teams: {
    isHome: boolean;
    seoname: string;
    nameShort: string;
    teamRank: number | null;
    score: number | null;
    conferenceSeo: string | null;
  }[];
}

export async function fetchScoreboard(isoDate: string): Promise<NcaaGame[]> {
  const { y, m, d } = splitDate(isoDate);
  const data = await query<{ contests: RawContest[] }>(
    "GetContests_web",
    { sportCode: SPORT_CODE, division: 1, seasonYear: Number(y), contestDate: `${m}/${d}/${y}` },
    isoDate,
  );
  return data.contests
    .filter((c) => c.teams?.length === 2)
    .map((c) => {
      const side = (home: boolean): NcaaTeamSide => {
        const t = c.teams.find((x) => x.isHome === home) ?? c.teams[home ? 0 : 1];
        return {
          seo: t.seoname,
          name: t.nameShort,
          rank: t.teamRank ?? null,
          score: t.score ?? null,
          conf: t.conferenceSeo ?? null,
          isHome: home,
        };
      };
      const [mm, dd, yyyy] = c.startDate.split("/");
      return {
        contestId: c.contestId,
        date: `${yyyy}-${mm}-${dd}`,
        startEpoch: c.startTimeEpoch ?? null,
        startTime: c.startTime ?? null,
        hasStartTime: Boolean(c.hasStartTime),
        state: c.gameState,
        status: c.statusCodeDisplay ?? "",
        period: c.currentPeriod ?? "",
        clock: c.contestClock ?? "",
        finalMessage: c.finalMessage ?? "",
        home: side(true),
        away: side(false),
      };
    });
}

export async function fetchConferences(seasonYear: number): Promise<{ name: string; display: string }[]> {
  const data = await query<{ conferences: { conferenceName: string; conferenceDisplay: string }[] }>(
    "NCAA_GetConferences_web",
    { sportCode: SPORT_CODE, seasonYear, division: 1 },
    `${seasonYear}-09-15`,
  );
  return data.conferences
    .filter((c) => c.conferenceName !== "All-Conf")
    .map((c) => ({ name: c.conferenceName, display: c.conferenceDisplay }));
}

// ---- HTML tables (stats, rankings) ----------------------------------------------

export interface HtmlTable {
  columns: string[];
  rows: string[][];
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

export function parseFirstTable(html: string): HtmlTable | null {
  const table = html.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  if (!table) return null;
  const rows = [...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
    [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => decode(c[1])),
  );
  if (rows.length === 0) return null;
  return { columns: rows[0], rows: rows.slice(1).filter((r) => r.length === rows[0].length) };
}

/** A stat leaders table, following NCAA's pagination (50 per page) up to maxPages. */
export async function fetchStatTable(kind: "individual" | "team", id: number, maxPages: number): Promise<HtmlTable> {
  let columns: string[] = [];
  const rows: string[][] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${SITE}/stats/soccer-men/d1/current/${kind}/${id}${page > 1 ? `/p${page}` : ""}`;
    let html: string;
    try {
      html = await fetchText(url);
    } catch (err) {
      if (page > 1) break; // ran past the last page
      throw err;
    }
    const table = parseFirstTable(html);
    if (!table || table.rows.length === 0) break;
    columns = table.columns;
    rows.push(...table.rows);
    if (!html.includes(`/${kind}/${id}/p${page + 1}"`)) break;
    await new Promise((r) => setTimeout(r, 400)); // be polite
  }
  // NCAA shows "-" for tied ranks; fill in the rank above.
  const rankCol = columns.findIndex((c) => c.toLowerCase() === "rank");
  if (rankCol !== -1) rows.forEach((r, i) => r[rankCol] === "-" && i > 0 && (r[rankCol] = rows[i - 1][rankCol]));
  return { columns, rows };
}

export async function fetchRankingTable(slug: string): Promise<HtmlTable | null> {
  return parseFirstTable(await fetchText(`${SITE}/rankings/soccer-men/d1/${slug}`));
}

/** Top Drawer Soccer's men's Top 25 (topdrawersoccer.com): Rank, School, Conference, Overall, Conf. */
export async function fetchTopDrawerTop25(): Promise<HtmlTable> {
  const html = await fetchText("https://www.topdrawersoccer.com/college-soccer-national-rankings/men");
  // Each row has a logo cell the header doesn't; drop it so rows line up with the columns.
  const table = parseFirstTable(html.replace(/<td class="clgTeamLogo">[\s\S]*?<\/td>/g, ""));
  if (!table) throw new Error("no rankings table");
  const columns = table.columns.map((c) => c.replace(/\b\w/g, (l) => l.toUpperCase()));
  return { columns, rows: table.rows.map((r) => r.map((c, i) => (i === 0 ? c.replace(/\.$/, "") : c))) };
}

export function ncaaLogoUrl(seo: string): string {
  return `${SITE}/sites/default/files/images/logos/schools/bgl/${seo}.svg`;
}

// ---- Game center (one game's box score, team stats and goals) ---------------------

const gameQueryIds: Record<string, string> = {
  NCAA_GetGamecenterBoxscoreSoccerById_web: "c9070c4e5a76468a4025896df89f8a7b22be8275c54a22ff79619cbb27d63d7d",
  NCAA_GetGamecenterTeamStatsSoccerById_web: "d3009ee734557a3af9b80a1fd0326575799094e8046a4188c6aebea7072ea7bf",
  NCAA_GetGamecenterScoringSummaryById_web: "fcd5729c72b0f72a4f659bf07e7b1da0fdce8f41ad286b0ddfe830adc7a45ca3",
};

/** Re-reads the game center query ids from a game page (they're listed there as "name":"hash"). */
async function refreshGameQueryIds(contestId: number) {
  const html = await fetchText(`${SITE}/game/${contestId}`);
  for (const name of Object.keys(gameQueryIds)) {
    const match = html.match(new RegExp(`"${name}":"([0-9a-f]{64})"`));
    if (match) gameQueryIds[name] = match[1];
  }
}

async function gameQuery<T>(name: string, contestId: number): Promise<T> {
  const attempt = async () => {
    const url =
      `${DATA_HOST}?meta=${name}` +
      `&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: gameQueryIds[name] } }))}` +
      `&variables=${encodeURIComponent(JSON.stringify({ contestId: String(contestId), staticTestEnv: null }))}`;
    const body = JSON.parse(await fetchText(url)) as { data?: T; errors?: { message: string }[] };
    if (!body.data || body.errors?.length) throw new Error(body.errors?.[0]?.message ?? "no data");
    return body.data;
  };
  try {
    return await attempt();
  } catch {
    await refreshGameQueryIds(contestId);
    return attempt();
  }
}

export interface GamePlayer {
  number: string | null;
  name: string;
  position: string | null;
  starter: boolean;
  minutes: number | null;
  goals: number;
  assists: number;
  shots: number;
  shotsOnGoal: number;
  yellowCards: number;
  redCards: number;
  saves: number | null;
  goalsAllowed: number | null;
}
export interface GameTeamStats {
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
export interface GameBoxscore {
  contestId: number;
  status: string; // P | I | F
  period: string;
  teams: { seo: string; name: string; isHome: boolean; color: string | null; players: GamePlayer[]; stats: GameTeamStats | null }[];
  goals: { period: string; time: string; seo: string | null; text: string; homeScore: number | null; awayScore: number | null }[];
}

const n = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** "CLAYTON HAMLER" → "Clayton Hamler" (keeps Mc/O' etc. readable). */
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase())
    .replace(/\bMc(\p{L})/gu, (_, c: string) => `Mc${c.toUpperCase()}`);

type Rec = Record<string, any>;

/** One game's box score from NCAA.com's game center (works for live and final games). */
export async function fetchGameBoxscore(contestId: number): Promise<GameBoxscore> {
  const [box, teamStats, scoring] = await Promise.all([
    gameQuery<{ boxscore: Rec }>("NCAA_GetGamecenterBoxscoreSoccerById_web", contestId),
    gameQuery<{ boxscore: Rec }>("NCAA_GetGamecenterTeamStatsSoccerById_web", contestId).catch(() => null),
    gameQuery<{ scoringSummary: Rec }>("NCAA_GetGamecenterScoringSummaryById_web", contestId).catch(() => null),
  ]);
  const b = box.boxscore ?? {};
  const teams = (b.teams ?? []) as Rec[];
  const seoById = new Map(teams.map((t) => [String(t.teamId), String(t.seoname)]));
  const statsById = new Map(((teamStats?.boxscore?.teamBoxscore ?? []) as Rec[]).map((t) => [String(t.teamId), t.teamStats as Rec | null]));
  const playersById = new Map(((b.teamBoxscore ?? []) as Rec[]).map((t) => [String(t.teamId), (t.playerStats ?? []) as Rec[]]));
  return {
    contestId,
    status: String(b.status ?? ""),
    period: String(b.period ?? ""),
    teams: teams.map((t) => {
      const s = statsById.get(String(t.teamId));
      return {
        seo: String(t.seoname),
        name: String(t.nameShort ?? t.nameFull ?? ""),
        isHome: Boolean(t.isHome),
        color: t.color ?? null,
        players: (playersById.get(String(t.teamId)) ?? [])
          .filter((p) => p.participated !== false)
          .map((p) => {
            const keeper = p.saves !== null && p.goalsAllowed !== null && p.goalsAllowed !== undefined;
            return {
              number: p.number === null || p.number === undefined ? null : String(p.number),
              name: titleCase(`${p.firstName ?? ""} ${p.lastName ?? ""}`.trim()),
              position: p.position ?? null,
              starter: Boolean(p.starter),
              minutes: n(p.minutesPlayed),
              goals: n(p.goals) ?? 0,
              assists: n(p.assists) ?? 0,
              shots: n(p.shots) ?? 0,
              shotsOnGoal: n(p.shotsOnGoal) ?? 0,
              yellowCards: n(p.penalties?.yellowCards) ?? 0,
              redCards: n(p.penalties?.redCards) ?? 0,
              saves: keeper ? n(p.saves) : null,
              goalsAllowed: keeper ? n(p.goalsAllowed) : null,
            };
          }),
        stats: s
          ? {
              goals: n(s.goals), shots: n(s.shots), shotsOnGoal: n(s.shotsOnGoal), corners: n(s.corners),
              fouls: n(s.penalties?.fouls ?? s.fouls), offsides: n(s.offsides), saves: n(s.goalie?.saves ?? s.saves),
              yellowCards: n(s.penalties?.yellowCards), redCards: n(s.penalties?.redCards),
            }
          : null,
      };
    }),
    goals: ((scoring?.scoringSummary?.periods ?? []) as Rec[]).flatMap((p) =>
      ((p.summary ?? []) as Rec[]).map((g) => ({
        period: String(p.title ?? ""),
        time: String(g.time ?? ""),
        seo: seoById.get(String(g.teamId)) ?? null,
        text: String(g.scoreText ?? ""),
        homeScore: n(g.homeScore),
        awayScore: n(g.visitScore),
      })),
    ),
  };
}
