import { Router } from "express";
import { getDb } from "../db/connection.js";
import { headToHead, matchSquadPlayer, nationalStanding, playerLinks, playerPage, squadIndex, teamForm, teamPage } from "../teams/store.js";
import { ensureDate, POLLS, RANKINGS, STAT_CATEGORIES } from "../jobs/ncaaSync.js";
import { isIsoDate, teamToday } from "../lib/readiness.js";
import { fetchGameBoxscore, ncaaLogoUrl, tidyPlays, type GameBoxscore, type HtmlTable } from "../ncaa/client.js";
import {
  conferenceLabel,
  rankMoves,
  standingsWithMovement,
  conferenceNames,
  enrichTable,
  gamesOn,
  getCache,
  setCache,
  teamsByName,
  type GameRow,
} from "../ncaa/store.js";

/**
 * NCAA D1 men's soccer (from NCAA.com): scoreboard with live scores, conference
 * standings calculated from results, stat leaders and rankings. Open to players
 * and coaches alike (public results).
 */
export const ncaaRouter = Router();

// Our own team on NCAA.com, highlighted in tables.
const OUR_TEAM = process.env.NCAA_TEAM_SEO || "fla-atlantic";

function toGame(g: GameRow, names: Record<string, string>) {
  const side = (p: "home" | "away") => ({
    seo: g[`${p}_seo`],
    name: g[`${p}_name`],
    rank: g[`${p}_rank`],
    score: g[`${p}_score`],
    conf: g[`${p}_conf`],
    confName: g[`${p}_conf`] ? conferenceLabel(g[`${p}_conf`]!, names) : null,
    logo: ncaaLogoUrl(g[`${p}_seo`]),
  });
  return {
    id: g.contest_id,
    date: g.game_date,
    startEpoch: g.has_start_time ? g.start_epoch : null,
    state: g.state,
    period: g.period,
    clock: g.clock,
    finalMessage: g.final_message,
    isConference: g.is_conference === 1,
    home: side("home"),
    away: side("away"),
  };
}

ncaaRouter.get("/scoreboard", async (req, res) => {
  const today = teamToday();
  const date = isIsoDate(req.query.date) ? req.query.date : today;
  if (date !== today || gamesOn(date).length === 0) await ensureDate(date);
  const names = conferenceNames();
  const rows = gamesOn(date);
  const updatedAt = rows.reduce<string | null>((max, g) => (!max || g.updated_at > max ? g.updated_at : max), null);
  res.json({ date, today, ourTeam: OUR_TEAM, updatedAt, games: rows.map((g) => toGame(g, names)) });
});

ncaaRouter.get("/standings", (_req, res) => {
  const today = teamToday();
  const names = conferenceNames();
  // Remaining conference fixtures (not yet final) from today to the end of the season, by conference.
  const upcoming = getDb()
    .prepare(
      `SELECT * FROM ncaa_games
       WHERE is_conference = 1 AND state IS NOT 'F' AND game_date >= ? AND game_date LIKE ? AND home_conf = away_conf
       ORDER BY game_date, start_epoch, home_name`,
    )
    .all(today, `${today.slice(0, 4)}-%`) as GameRow[];
  const fixtures = new Map<string, ReturnType<typeof toGame>[]>();
  for (const g of upcoming) fixtures.set(g.home_conf!, [...(fixtures.get(g.home_conf!) ?? []), toGame(g, names)]);
  const conferences = standingsWithMovement(Number(today.slice(0, 4))).map((c) => ({
    ...c,
    rows: c.rows.map((r) => ({ ...r, logo: ncaaLogoUrl(r.seo) })),
    fixtures: fixtures.get(c.seo) ?? [],
  }));
  res.json({ ourTeam: OUR_TEAM, conferences });
});

ncaaRouter.get("/stats", (_req, res) => {
  res.json({
    categories: STAT_CATEGORIES.map((c) => ({
      key: c.key,
      kind: c.kind,
      label: c.label,
      group: c.group,
      updatedAt: getCache(`stats-${c.key}`)?.updatedAt ?? null,
    })),
    conferences: Object.entries(conferenceNames())
      .map(([seo, name]) => ({ seo, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
});

function withLogos(teams: ReturnType<typeof enrichTable>["teams"]) {
  return teams.map((t) => (t ? { ...t, logo: ncaaLogoUrl(t.seo) } : null));
}

function tableResponse(key: string, label: string) {
  const cached = getCache<HtmlTable>(key);
  if (!cached) return null;
  const table = enrichTable(cached.value);
  return {
    label,
    updatedAt: cached.updatedAt,
    columns: table.columns,
    rows: table.rows,
    teams: withLogos(table.teams),
    moves: rankMoves(key, table),
  };
}

/**
 * One Top 25 poll, with movement since the previous poll: the coaches' poll
 * from its "Previous" column, Top Drawer Soccer from our own daily record.
 */
function pollResponse(poll: (typeof POLLS)[number]) {
  const cached = getCache<HtmlTable>(poll.cacheKey);
  if (!cached) return { key: poll.key, label: poll.label, columns: [], rows: [], teams: [], moves: [] };
  const table = enrichTable(cached.value);
  const rankCol = table.columns.findIndex((c) => c.toLowerCase() === "rank");
  const prevCol = table.columns.findIndex((c) => c.toLowerCase().startsWith("prev"));
  return {
    key: poll.key,
    label: poll.label,
    updatedAt: cached.updatedAt,
    columns: table.columns,
    rows: table.rows,
    teams: withLogos(table.teams),
    moves:
      prevCol === -1
        ? rankMoves(poll.cacheKey, table)
        : table.rows.map((r) => {
            const before = parseInt(r[prevCol], 10);
            return Number.isFinite(before) ? before - parseInt(r[rankCol], 10) : null;
          }),
  };
}

ncaaRouter.get("/stats/:key", (req, res) => {
  const category = STAT_CATEGORIES.find((c) => c.key === req.params.key);
  if (!category) return res.status(404).json({ error: "Unknown stat category." });
  const table = tableResponse(`stats-${category.key}`, category.label);
  if (!table) return res.status(404).json({ error: "Not loaded yet. Check back in a few minutes." });
  // Individual tables: each player's photo, number and profile link (from their team's squad when we read it).
  const players = category.kind === "individual" ? playerLinks(table, table.teams) : undefined;
  res.json({ ...table, players, kind: category.kind, ourTeam: OUR_TEAM });
});

// A team's page: header, the whole squad with season stats, and its games.
ncaaRouter.get("/team/:seo", (req, res) => {
  const page = teamPage(req.params.seo);
  if (!page.team.name || (!page.games.length && !page.squad.length)) return res.status(404).json({ error: "Team not found." });
  res.json({ ...page, ourTeam: OUR_TEAM });
});

// A player's page: profile, season stats, game log, national rankings.
ncaaRouter.get("/player/:seo/:key", (req, res) => {
  const page = playerPage(req.params.seo, req.params.key);
  if (!page) return res.status(404).json({ error: "Player not found." });
  res.json({ ...page, ourTeam: OUR_TEAM });
});

// One game: header, goals, team stats, both line-ups and play-by-play (NCAA.com game center). Finished games are kept;
// live ones are re-read at most every 20 seconds. Games not started yet also get a preview (form, leaders, head-to-head).
const LIVE_REFRESH_MS = 20_000;
const liveGames = new Map<number, { at: number; box: GameBoxscore }>();
ncaaRouter.get("/game/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Game not found." });
  const row = getDb().prepare("SELECT * FROM ncaa_games WHERE contest_id = ?").get(id) as GameRow | undefined;
  let box = getCache<GameBoxscore>(`game-v2-${id}`)?.value ?? null;
  // Nothing to read until shortly before kick-off.
  const notYet = row && row.state === "P" && (!row.start_epoch || row.start_epoch * 1000 - Date.now() > 15 * 60_000);
  if (!box && !notYet) {
    const recent = liveGames.get(id);
    if (recent && Date.now() - recent.at < LIVE_REFRESH_MS) box = recent.box;
    else {
      try {
        box = await fetchGameBoxscore(id);
        if (box.status === "F") setCache(`game-v2-${id}`, box);
        else liveGames.set(id, { at: Date.now(), box });
      } catch (err) {
        // A live game as last saved (the app preview's snapshot, which can't reach NCAA.com).
        box = getCache<GameBoxscore>(`game-live-${id}`)?.value ?? null;
        if (!row && !box) return res.status(404).json({ error: "Game not found." });
        if (!box) console.error(`[ncaa] game ${id} failed: ${(err as Error).message}`);
      }
    }
  }
  if (!row && !box) return res.status(404).json({ error: "Game not found." });
  // Link players to the squads we read (photo, profile), by name.
  const squads = squadIndex();
  const teams = (box?.teams ?? []).map((t) => ({
    ...t,
    players: t.players.map((p) => {
      const hit = matchSquadPlayer(squads.get(t.seo), p.name);
      return { ...p, key: hit?.key ?? null, photo_url: hit?.photo_url ?? null, number: p.number ?? hit?.jersey_number ?? null };
    }),
  }));
  const status = box?.status && box.status !== "O" ? box.status : row?.state ?? null;
  const game = row ? toGame(row, conferenceNames()) : null;
  // Fresher than the scoreboard while a game is live.
  if (game && box && status === "I") {
    for (const t of box.teams) {
      const side = t.seo === game.home.seo ? game.home : t.seo === game.away.seo ? game.away : null;
      if (side && t.score !== null && t.score !== undefined) side.score = t.score;
    }
  }
  const homeSeo = game?.home.seo ?? box?.teams.find((t) => t.isHome)?.seo ?? null;
  const awaySeo = game?.away.seo ?? box?.teams.find((t) => !t.isHome)?.seo ?? null;
  res.json({
    ourTeam: OUR_TEAM,
    game,
    status,
    period: box?.period ?? null,
    clock: box?.clock ?? null,
    teams,
    goals: box?.goals ?? [],
    plays: tidyPlays(box?.plays ?? []), // (games saved before the raw feed format was translated)
    venue: homeSeo && awaySeo ? ourVenue(row?.game_date, homeSeo, awaySeo) : null,
    ranks: Object.fromEntries([homeSeo, awaySeo].filter((s): s is string => Boolean(s)).map((s) => [s, nationalStanding(s)])),
    preview:
      status !== "I" && status !== "F" && homeSeo && awaySeo
        ? { home: teamForm(homeSeo), away: teamForm(awaySeo), headToHead: headToHead(homeSeo, awaySeo, id) }
        : null,
  });
});

/** Kick-off time and venue from our own schedule, for our games. */
function ourVenue(date: string | undefined, home: string, away: string) {
  if (!date || (home !== OUR_TEAM && away !== OUR_TEAM)) return null;
  const g = getDb().prepare("SELECT game_time, location FROM schedule_games WHERE substr(game_date, 1, 10) = ?").get(date) as
    | { game_time: string | null; location: string | null }
    | undefined;
  return g ? { time: g.game_time, location: g.location } : null;
}

// Every team's RPI rank (seo -> rank), for the small "RPI n" next to team names across the app.
ncaaRouter.get("/rpi", (_req, res) => {
  const cached = getCache<HtmlTable>("rankings-rpi");
  if (!cached) return res.json({ updatedAt: null, ranks: {} });
  const table = enrichTable(cached.value);
  const rankCol = table.columns.findIndex((c) => c.toLowerCase() === "rank");
  const ranks: Record<string, number> = {};
  table.rows.forEach((r, i) => {
    const seo = table.teams[i]?.seo;
    const n = parseInt(rankCol === -1 ? String(i + 1) : r[rankCol], 10);
    if (seo && Number.isFinite(n) && !(seo in ranks)) ranks[seo] = n;
  });
  res.json({ updatedAt: cached.updatedAt, ranks });
});

ncaaRouter.get("/rankings", (_req, res) => {
  res.json({
    ourTeam: OUR_TEAM,
    polls: POLLS.map(pollResponse),
    rpi: tableResponse("rankings-rpi", RANKINGS.find((r) => r.key === "rankings-rpi")!.label),
  });
});

/**
 * One conference at a glance (Home page): standings plus conference-only views of
 * a few team and player stat tables. Player tables only cover NCAA's national top
 * 200, so a conference leader outside that won't appear.
 */
ncaaRouter.get("/conference/:seo", (req, res) => {
  const seo = req.params.seo;
  const standings = standingsWithMovement(Number(teamToday().slice(0, 4))).find((c) => c.seo === seo);
  const teams = teamsByName();

  const filtered = (key: string, limit: number) => {
    const category = STAT_CATEGORIES.find((c) => c.key === key)!;
    const table = tableResponse(`stats-${key}`, category.label);
    if (!table) return null;
    const keep = table.rows.map((_, i) => i).filter((i) => table.teams[i]?.conf === seo).slice(0, limit);
    const players = category.kind === "individual" ? playerLinks(table, table.teams) : undefined;
    return {
      ...table,
      rows: keep.map((i) => table.rows[i]),
      teams: keep.map((i) => table.teams[i]),
      moves: keep.map((i) => table.moves[i]),
      players: players && keep.map((i) => players[i]),
    };
  };

  res.json({
    seo,
    name: conferenceLabel(seo),
    ourTeam: OUR_TEAM,
    standings: standings?.rows.map((r) => ({ ...r, logo: ncaaLogoUrl(r.seo) })) ?? [],
    teamStats: ["team-30", "team-32", "team-1222", "team-975"].map((k) => filtered(k, 20)).filter(Boolean),
    playerLeaders: ["individual-570", "individual-573", "individual-568"].map((k) => filtered(k, 10)).filter(Boolean),
    teamsKnown: [...teams.values()].filter((t) => t.conf === seo).length,
  });
});
