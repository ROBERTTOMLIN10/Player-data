import { Router } from "express";
import { ensureDate, POLLS, RANKINGS, STAT_CATEGORIES } from "../jobs/ncaaSync.js";
import { isIsoDate, teamToday } from "../lib/readiness.js";
import { ncaaLogoUrl, type HtmlTable } from "../ncaa/client.js";
import {
  conferenceLabel,
  pollMoves,
  rankMoves,
  standingsWithMovement,
  conferenceNames,
  enrichTable,
  gamesOn,
  getCache,
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
  const conferences = standingsWithMovement(Number(teamToday().slice(0, 4))).map((c) => ({
    ...c,
    rows: c.rows.map((r) => ({ ...r, logo: ncaaLogoUrl(r.seo) })),
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
        ? pollMoves(poll.cacheKey, table)
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
  res.json({ ...table, kind: category.kind, ourTeam: OUR_TEAM });
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
    return {
      ...table,
      rows: keep.map((i) => table.rows[i]),
      teams: keep.map((i) => table.teams[i]),
      moves: keep.map((i) => table.moves[i]),
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
