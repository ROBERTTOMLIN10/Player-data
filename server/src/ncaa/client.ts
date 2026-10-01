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
  NCAA_GetGamecenterPbpGenericById_web: "57f922d56d60d88326b62202b3d88e8cd3cfb6687931bc0b5b3dfab089b84faa",
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
  shots: number | null; // null when NCAA's feed has fewer shots than shots on target (it sometimes leaves shots at 0)
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
export type PlayKind = "goal" | "shot" | "save" | "corner" | "foul" | "offside" | "sub" | "yellow" | "red" | "var" | "other";
export interface GamePlay {
  period: string;
  clock: string;
  seo: string | null; // the team it's about, when the text makes that clear
  kind: PlayKind;
  text: string;
}
export interface GameBoxscore {
  contestId: number;
  status: string; // P | I | F
  period: string;
  clock: string | null; // live games: the game clock, e.g. "63:12"
  teams: { seo: string; name: string; isHome: boolean; color: string | null; score: number | null; players: GamePlayer[]; stats: GameTeamStats | null }[];
  goals: { period: string; time: string; seo: string | null; text: string; homeScore: number | null; awayScore: number | null }[];
  plays: GamePlay[]; // play-by-play, oldest first
}

const n = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** NCAA's feed sometimes sends accented names double-encoded ("JoÃ£o"): read them back as UTF-8 ("João"). */
const fixEncoding = (s: string) => {
  if (!/[ÃÂ][\u0080-\u00ff]/.test(s)) return s;
  const fixed = Buffer.from(s, "latin1").toString("utf8");
  return fixed.includes("\ufffd") ? s : fixed;
};
/** "CLAYTON HAMLER" → "Clayton Hamler" (keeps Mc/O' etc. readable). */
const titleCase = (s: string) =>
  fixEncoding(s)
    .toLowerCase()
    .replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase())
    .replace(/\bMc(\p{L})/gu, (_, c: string) => `Mc${c.toUpperCase()}`);

type Rec = Record<string, any>;
const consistentShots = (shots: number | null, onGoal: number | null) => (shots !== null && onGoal !== null && shots < onGoal ? null : shots ?? 0);

/** One game's box score from NCAA.com's game center (works for live and final games). */
export async function fetchGameBoxscore(contestId: number): Promise<GameBoxscore> {
  const [box, teamStats, scoring, pbp] = await Promise.all([
    gameQuery<{ boxscore: Rec }>("NCAA_GetGamecenterBoxscoreSoccerById_web", contestId),
    gameQuery<{ boxscore: Rec }>("NCAA_GetGamecenterTeamStatsSoccerById_web", contestId).catch(() => null),
    gameQuery<{ scoringSummary: Rec }>("NCAA_GetGamecenterScoringSummaryById_web", contestId).catch(() => null),
    gameQuery<{ playbyplay: Rec }>("NCAA_GetGamecenterPbpGenericById_web", contestId).catch(() => null),
  ]);
  const b = box.boxscore ?? {};
  const teams = (b.teams ?? []) as Rec[];
  const seoById = new Map(teams.map((t) => [String(t.teamId), String(t.seoname)]));
  const statsById = new Map(((teamStats?.boxscore?.teamBoxscore ?? []) as Rec[]).map((t) => [String(t.teamId), t.teamStats as Rec | null]));
  const playersById = new Map(((b.teamBoxscore ?? []) as Rec[]).map((t) => [String(t.teamId), (t.playerStats ?? []) as Rec[]]));
  const scoreById = new Map(((scoring?.scoringSummary?.teams ?? []) as Rec[]).map((t) => [String(t.teamId), n(t.score)]));
  const live = String(b.status ?? "") === "I" && b.minutes !== null && b.minutes !== undefined;
  return {
    contestId,
    status: String(b.status ?? ""),
    period: String(b.period ?? ""),
    clock: live ? `${String(b.minutes).padStart(2, "0")}:${String(b.seconds ?? 0).padStart(2, "0")}` : null,
    plays: pbp ? parsePlays(pbp.playbyplay, teams) : [],
    teams: teams.map((t) => {
      const s = statsById.get(String(t.teamId));
      return {
        seo: String(t.seoname),
        name: String(t.nameShort ?? t.nameFull ?? ""),
        isHome: Boolean(t.isHome),
        color: t.color ?? null,
        score: scoreById.get(String(t.teamId)) ?? n(s?.goals),
        players: (playersById.get(String(t.teamId)) ?? [])
          .filter((p) => p.participated !== false)
          .map((p) => {
            const keeper = p.saves !== null && p.goalsAllowed !== null && p.goalsAllowed !== undefined;
            return {
              number: p.number === null || p.number === undefined ? null : String(p.number),
              name: titleCase(`${p.firstName ?? ""} ${p.lastName ?? ""}`.trim()),
              position: p.position ?? null,
              starter: Boolean(p.starter),
              minutes: n(p.minutesPlayed) === null ? null : Math.round(n(p.minutesPlayed)!),
              goals: n(p.goals) ?? 0,
              assists: n(p.assists) ?? 0,
              shots: consistentShots(n(p.shots), n(p.shotsOnGoal)),
              shotsOnGoal: n(p.shotsOnGoal) ?? 0,
              yellowCards: n(p.penalties?.yellowCards) ?? 0,
              redCards: n(p.penalties?.redCards) ?? 0,
              saves: keeper ? n(p.saves) : null,
              goalsAllowed: keeper ? n(p.goalsAllowed) : null,
            };
          }),
        stats: s
          ? {
              goals: n(s.goals), shots: consistentShots(n(s.shots), n(s.shotsOnGoal)), shotsOnGoal: n(s.shotsOnGoal), corners: n(s.corners),
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
        text: fixEncoding(String(g.scoreText ?? "")),
        homeScore: n(g.homeScore),
        awayScore: n(g.visitScore),
      })),
    ),
  };
}

const CARD_REASONS: Record<string, string> = {
  unsporting: "unsporting behaviour",
  dissent: "dissent",
  timewasting: "time-wasting",
  persistentinfringement: "persistent infringement",
  violentconduct: "violent conduct",
  seriousfoulplay: "serious foul play",
  secondyellow: "second yellow",
  dogso: "denying a goal-scoring chance",
};

/**
 * Many games' play-by-play comes in a raw feed format ("Cardred(straight) by AJ
 * Acree", "Shot (goalmouth:outhigh;) by …", "Throwin(taken) by Team"). This
 * turns those into readable plays and drops the routine ones (throw-ins, goal
 * kicks, free kicks taken); plays already in sentence form pass through.
 * Returns null for a play not worth showing.
 */
export function readablePlay(raw: string): { kind: PlayKind; text: string } | null {
  const text = raw.replace(/\s+/g, " ").replace(/ by Team$/, "").trim();
  if (/^(Match|Period) (started|ended)$/i.test(text)) return null; // the period headers already show this
  const m = text.match(/^([A-Za-z]+)\s*(?:\(([^)]*)\))?\s*(?:\(([^)]*)\))?\s*(?:by (.+))?$/);
  // Sentence-form plays ("Shot by MAN Marsilii, Cristiano.", "Foul on …", "Corner kick [25:35].") keep their text.
  const sentence = /^(Shot|Goal) by [A-Z]{2,6} |^Foul on |^Offside against |^Corner kick|^Yellow card|^Red card|^Substitution|^Goal by|^Save by|^Shot by|^Foul by|^Handball by|^Offside by|^VAR review|^Penalty kick awarded|^Stoppage/;
  if (!m || !/^[A-Z][a-z]+$/.test(m[1]) || sentence.test(text)) {
    return { kind: playKind(text), text };
  }
  const [, word, a = "", b = "", byRaw = ""] = m;
  const who = byRaw.trim() === "Team" ? "" : byRaw.trim();
  const detail = `${a};${b}`.toLowerCase();
  const by = who ? ` by ${who}` : "";
  switch (word.toLowerCase()) {
    case "goal": {
      const how = /penaltykick/.test(detail) ? " (penalty)" : /from:head/.test(detail) ? " (header)" : /from:leftfoot/.test(detail) ? " (left foot)" : /from:rightfoot/.test(detail) ? " (right foot)" : "";
      return { kind: "goal", text: `Goal${by}${how}` };
    }
    case "shot": {
      const where = /blocked/.test(detail)
        ? "blocked"
        : /woodwork/.test(detail)
          ? "hit the woodwork"
          : /outhigh/.test(detail)
            ? "over the bar"
            : /out(left|right)/.test(detail)
              ? "wide"
              : /goalmouth:(low|high)/.test(detail)
                ? "on target"
                : "";
      return { kind: "shot", text: `Shot${by}${where ? `, ${where}` : ""}` };
    }
    case "save":
      return { kind: "save", text: `Save${by}` };
    case "corner":
      return /taken/.test(detail) ? { kind: "corner", text: "Corner kick" } : null;
    case "foul":
      return { kind: "foul", text: /handball/.test(detail) ? `Handball${by}` : `Foul${by}` };
    case "offside":
      return { kind: "offside", text: `Offside${by}` };
    case "cardyellow":
    case "cardred": {
      const reason = CARD_REASONS[a.toLowerCase()] ?? (a && a.toLowerCase() !== "straight" ? a.toLowerCase() : "");
      const red = word.toLowerCase() === "cardred";
      return { kind: red ? "red" : "yellow", text: `${red ? "Red" : "Yellow"} card${who ? `: ${who}` : ""}${reason ? ` (${reason})` : ""}` };
    }
    case "penaltykick":
      if (/awarded/.test(detail)) return { kind: "other", text: `Penalty kick awarded${who ? ` (${who})` : ""}` };
      return null; // the goal or save that follows tells the story
    case "varreview": {
      const type = detail.match(/type:([a-z]+)/)?.[1];
      const outcome = detail.match(/outcome:([a-z]+)/)?.[1];
      return { kind: "var", text: `VAR review${type ? ` (${type})` : ""}${outcome ? `: ${outcome === "noaction" ? "no action" : outcome}` : ""}` };
    }
    case "injury":
      return { kind: "other", text: "Stoppage for an injury" };
    default:
      return null; // throw-ins, goal/free kicks, kick-offs, period markers, "foul won", keeper changes
  }
}

/** "01:09:00" (minutes:seconds:hundredths, in the raw feed) → "01:09". */
const shortClock = (clock: string) => (/^\d+:\d\d:\d\d$/.test(clock) ? clock.split(":").slice(0, 2).join(":") : clock);

/** Readable plays: raw-format rows translated, assists folded into their goal, subs paired "on for off". */
export function tidyPlays(plays: GamePlay[]): GamePlay[] {
  const out: GamePlay[] = [];
  for (const p of plays) {
    const assist = p.text.match(/^Assist\s+by\s+(.+)$/i);
    if (assist) {
      const goal = [...out].reverse().find((x) => x.kind === "goal" && x.period === p.period && x.clock === shortClock(p.clock));
      if (goal && !/assist/i.test(goal.text)) goal.text += `, assisted by ${assist[1].trim()}`;
      continue;
    }
    const sub = p.text.match(/^Sub (in|out) (.+)$/i);
    if (sub) {
      const partner = [...out].reverse().find((x) => x.kind === "sub" && x.period === p.period && x.clock === shortClock(p.clock) && x.seo === p.seo && /^Substitution: (.+) (on|off)$/.test(x.text));
      if (partner) {
        const other = partner.text.match(/^Substitution: (.+) (on|off)$/)!;
        const on = sub[1].toLowerCase() === "in" ? sub[2] : other[1];
        const off = sub[1].toLowerCase() === "in" ? other[1] : sub[2];
        partner.text = `Substitution: ${on} on for ${off}`;
      } else out.push({ ...p, clock: shortClock(p.clock), kind: "sub", text: `Substitution: ${sub[2]} ${sub[1].toLowerCase() === "in" ? "on" : "off"}` });
      continue;
    }
    const r = readablePlay(p.text);
    if (r) out.push({ ...p, clock: shortClock(p.clock), kind: r.kind, text: r.text });
  }
  return out;
}

function playKind(text: string): PlayKind {
  const t = text.toLowerCase();
  if (/^goal by|\bgoal by\b/.test(t)) return "goal";
  if (/^red card/.test(t)) return "red";
  if (/^yellow card/.test(t)) return "yellow";
  if (/red card|second yellow/.test(t)) return "red";
  if (/yellow card/.test(t)) return "yellow";
  if (/substitution/.test(t)) return "sub";
  if (/\bvar\b|video review/.test(t)) return "var";
  if (/saved by/.test(t)) return "save";
  if (/^shot by/.test(t)) return "shot";
  if (/^save by/.test(t)) return "save";
  if (/^(foul|handball) by/.test(t)) return "foul";
  if (/corner kick/.test(t)) return "corner";
  if (/offside/.test(t)) return "offside";
  if (/^foul on/.test(t)) return "foul";
  return "other";
}

/**
 * NCAA's play-by-play for soccer. Its team tag is sometimes the wrong team (a
 * substitution tagged to the other side), so the team is read from the text
 * first ("Shot by MAN …", "Offside against Manhattan"), then the tag.
 */
function parsePlays(pbp: Rec | undefined, teams: Rec[]): GamePlay[] {
  if (!pbp) return [];
  const sides = teams.map((t) => ({
    id: String(t.teamId),
    seo: String(t.seoname),
    names: [String(t.nameShort ?? ""), String(t.nameFull ?? "")].filter(Boolean).map((x) => x.toLowerCase()),
    code: String(t.name6Char ?? t.nameShort ?? "").toUpperCase().replace(/[^A-Z]/g, ""),
  }));
  const teamOf = (text: string, tagged: string) => {
    const codes = [...text.matchAll(/\b([A-Z]{2,6})\b/g)].map((m) => m[1]);
    const byCode = sides.filter((s) => codes.some((c) => s.code.startsWith(c)));
    if (byCode.length === 1) return byCode[0].seo;
    const lower = text.toLowerCase();
    const byName = sides.filter((s) => s.names.some((nm) => nm && lower.includes(nm)));
    if (byName.length === 1) return byName[0].seo;
    return sides.find((s) => s.id === tagged)?.seo ?? null;
  };
  return tidyPlays(((pbp.periods ?? []) as Rec[]).flatMap((p) =>
    ((p.playbyplayStats ?? []) as Rec[]).flatMap((e) =>
      ((e.plays ?? []) as Rec[])
        .map((pl) => fixEncoding(String(pl.playText ?? "").trim()))
        .filter((text) => text && !/ at goalie for /i.test(text))
        .map((text) => ({ period: String(p.periodDisplay ?? ""), clock: String(e.clock ?? ""), seo: teamOf(text, String(e.teamId ?? "")), kind: playKind(text), text })),
    ),
  ));
}
