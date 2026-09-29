import { getDb } from "../db/connection.js";
import { samePersonScore } from "../import/samePerson.js";
import { STAT_CATEGORIES } from "../jobs/ncaaSync.js";
import { teamToday } from "../lib/readiness.js";
import { ncaaLogoUrl, type HtmlTable } from "../ncaa/client.js";
import { conferenceLabel, enrichTable, getCache, standingsWithMovement, teamsByName, type GameRow } from "../ncaa/store.js";
import { TEAM_SITES } from "./sites.js";

/**
 * Other teams' squads for the NCAA D1 tab: matching NCAA.com leader rows to
 * squad players (photo, number, profile link), and the data behind the team
 * and player pages.
 */

export interface SquadRef {
  key: string;
  name: string;
  jersey_number: string | null;
  photo_url: string | null;
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Key for a player we only know from NCAA.com (no squad data for their team yet). */
export const nameKey = (name: string) => `n-${slug(name)}`;

/** Squad players per team (roster, plus anyone only in the stats table). */
export function squadIndex(): Map<string, SquadRef[]> {
  const rows = getDb()
    .prepare(
      `SELECT team_seo, player_key AS key, name, jersey_number, photo_url FROM team_players
       UNION ALL
       SELECT s.team_seo, s.player_key, s.name, s.jersey_number, NULL FROM team_player_stats s
       WHERE NOT EXISTS (SELECT 1 FROM team_players p WHERE p.team_seo = s.team_seo AND p.player_key = s.player_key)`,
    )
    .all() as (SquadRef & { team_seo: string })[];
  const out = new Map<string, SquadRef[]>();
  for (const { team_seo, ...r } of rows) out.set(team_seo, [...(out.get(team_seo) ?? []), r]);
  return out;
}

/** The squad player an NCAA.com name refers to (names differ slightly between sources). */
export function matchSquadPlayer(squad: SquadRef[] | undefined, name: string): SquadRef | null {
  if (!squad?.length) return null;
  const scored = squad.map((p) => ({ p, s: samePersonScore(name, p.name) })).filter((x) => x.s >= 2);
  const best = Math.max(0, ...scored.map((x) => x.s));
  const top = scored.filter((x) => x.s === best);
  return top.length === 1 ? top[0].p : null;
}

export interface PlayerLink {
  key: string;
  photo_url: string | null;
  jersey_number: string | null;
}

/** For an individual stats table: each row's player link (squad player when we have their team, else by name). */
export function playerLinks(table: HtmlTable, teams: ({ seo: string } | null)[]): (PlayerLink | null)[] {
  const nameCol = table.columns.findIndex((c) => c.toLowerCase() === "name");
  if (nameCol === -1) return table.rows.map(() => null);
  const squads = squadIndex();
  return table.rows.map((r, i) => {
    const seo = teams[i]?.seo;
    if (!seo) return null;
    const p = matchSquadPlayer(squads.get(seo), r[nameCol]);
    return p ? { key: p.key, photo_url: p.photo_url, jersey_number: p.jersey_number } : { key: nameKey(r[nameCol]), photo_url: null, jersey_number: null };
  });
}

/** Where a player appears in NCAA.com's national leader tables. */
function nationalRanks(seo: string, name: string) {
  const out: { category: string; rank: string; value: string; games: string | null }[] = [];
  const teams = teamsByName();
  for (const c of STAT_CATEGORIES.filter((c) => c.kind === "individual")) {
    const cached = getCache<HtmlTable>(`stats-${c.key}`);
    if (!cached) continue;
    const t = enrichTable(cached.value, teams);
    const nameCol = t.columns.findIndex((x) => x.toLowerCase() === "name");
    const gamesCol = t.columns.findIndex((x) => x.toLowerCase() === "games");
    t.rows.forEach((r, i) => {
      if (t.teams[i]?.seo === seo && samePersonScore(name, r[nameCol]) >= 2)
        out.push({ category: c.label, rank: r[0], value: r[r.length - 1], games: gamesCol === -1 ? null : r[gamesCol] });
    });
  }
  return out;
}

function teamInfo(seo: string) {
  const year = Number(teamToday().slice(0, 4));
  const info = [...teamsByName(year).values()].find((t) => t.seo === seo) ?? null;
  const conf = standingsWithMovement(year).find((c) => c.rows.some((r) => r.seo === seo));
  const idx = conf?.rows.findIndex((r) => r.seo === seo) ?? -1;
  const row = idx >= 0 ? conf!.rows[idx] : null;
  const site = getDb().prepare("SELECT * FROM team_sites WHERE team_seo = ?").get(seo) as
    | { host: string; roster_synced_at: string | null; stats_synced_at: string | null }
    | undefined;
  return {
    seo,
    name: info?.name ?? row?.name ?? seo,
    logo: ncaaLogoUrl(seo),
    conference: info?.conf ? conferenceLabel(info.conf) : conf?.name ?? null,
    conferenceSeo: info?.conf ?? conf?.seo ?? null,
    record: row?.overall ?? null,
    conferenceRecord: row ? `${row.w}-${row.l}-${row.t}` : null,
    conferencePosition: idx >= 0 ? idx + 1 : null,
    conferenceTeams: conf?.rows.length ?? null,
    site: site ? `https://${site.host}` : null,
    covered: Boolean(TEAM_SITES[seo] && site?.roster_synced_at),
    updatedAt: site?.stats_synced_at ?? site?.roster_synced_at ?? null,
  };
}

function teamGames(seo: string) {
  const year = teamToday().slice(0, 4);
  const rows = getDb()
    .prepare("SELECT * FROM ncaa_games WHERE (home_seo = ? OR away_seo = ?) AND game_date LIKE ? ORDER BY game_date, start_epoch")
    .all(seo, seo, `${year}-%`) as GameRow[];
  return rows.map((g) => {
    const home = g.home_seo === seo;
    const us = home ? g.home_score : g.away_score;
    const them = home ? g.away_score : g.home_score;
    return {
      date: g.game_date,
      state: g.state,
      home,
      opponent: home ? g.away_name : g.home_name,
      opponentSeo: home ? g.away_seo : g.home_seo,
      opponentLogo: ncaaLogoUrl(home ? g.away_seo : g.home_seo),
      isConference: g.is_conference === 1,
      startEpoch: g.has_start_time ? g.start_epoch : null,
      result:
        g.state === "F" && us !== null && them !== null ? `${us > them ? "W" : us < them ? "L" : "T"} ${us}-${them}` : null,
    };
  });
}

/** Team page: header info, the whole squad with season stats, and the season's games. */
export function teamPage(seo: string) {
  const db = getDb();
  const squad = db
    .prepare(
      `SELECT p.player_key AS key, p.name, p.jersey_number, p.position_short, p.position_long, p.academic_year, p.height_feet,
              p.height_inches, p.hometown, p.photo_url, s.gp, s.gs, s.minutes, s.goals, s.assists, s.points, s.shots,
              s.shots_on_goal, s.yellow_cards, s.red_cards, s.is_goalkeeper, s.goals_allowed, s.gaa, s.saves, s.save_pct, s.shutouts
       FROM team_players p LEFT JOIN team_player_stats s ON s.team_seo = p.team_seo AND s.player_key = p.player_key
       WHERE p.team_seo = ?
       UNION ALL
       SELECT s.player_key, s.name, s.jersey_number, NULL, NULL, NULL, NULL, NULL, NULL, NULL, s.gp, s.gs, s.minutes, s.goals,
              s.assists, s.points, s.shots, s.shots_on_goal, s.yellow_cards, s.red_cards, s.is_goalkeeper, s.goals_allowed, s.gaa,
              s.saves, s.save_pct, s.shutouts
       FROM team_player_stats s
       WHERE s.team_seo = ? AND NOT EXISTS (SELECT 1 FROM team_players p WHERE p.team_seo = s.team_seo AND p.player_key = s.player_key)`,
    )
    .all(seo, seo) as Record<string, unknown>[];
  squad.sort((a, b) => (parseInt(String(a.jersey_number ?? "999"), 10) || 999) - (parseInt(String(b.jersey_number ?? "999"), 10) || 999));
  return { team: teamInfo(seo), squad, games: teamGames(seo) };
}

/** Player page: profile, season stats, game log and national rankings (or what NCAA.com has, for teams we don't read yet). */
export function playerPage(seo: string, key: string) {
  const db = getDb();
  const team = teamInfo(seo);
  let profile = db.prepare("SELECT * FROM team_players WHERE team_seo = ? AND player_key = ?").get(seo, key) as Record<string, unknown> | undefined;
  let stats = db.prepare("SELECT * FROM team_player_stats WHERE team_seo = ? AND player_key = ?").get(seo, key) as Record<string, unknown> | undefined;
  // A name key for a team we have now (e.g. the link was made before the squad synced): find them by name.
  if (!profile && !stats && key.startsWith("n-")) {
    const name = key.slice(2).replace(/-/g, " ");
    const hit = matchSquadPlayer(squadIndex().get(seo), name);
    if (hit) return playerPage(seo, hit.key);
  }
  const name = String(profile?.name ?? stats?.name ?? "");
  const games = db
    .prepare("SELECT * FROM team_player_games WHERE team_seo = ? AND player_key = ? ORDER BY game_date")
    .all(seo, key);
  if (profile || stats) return { team, key, name, profile: profile ?? null, stats: stats ?? null, games, national: nationalRanks(seo, name), source: "team" as const };

  // Not in a squad we read: build what we can from NCAA.com's leader tables.
  const wanted = key.startsWith("n-") ? key.slice(2) : key;
  const teams = teamsByName();
  let display: string | null = null;
  let year: string | null = null;
  const fromNcaa: Record<string, string> = {};
  for (const c of STAT_CATEGORIES.filter((c) => c.kind === "individual")) {
    const cached = getCache<HtmlTable>(`stats-${c.key}`);
    if (!cached) continue;
    const t = enrichTable(cached.value, teams);
    const col = (n: string) => t.columns.findIndex((x) => x.toLowerCase() === n);
    t.rows.forEach((r, i) => {
      if (t.teams[i]?.seo !== seo || slug(r[col("name")]) !== wanted) return;
      display = r[col("name")];
      if (col("cl") !== -1) year = r[col("cl")];
      t.columns.forEach((c2, j) => {
        if (!["rank", "name", "team", "cl", "per game"].includes(c2.toLowerCase())) fromNcaa[c2] = r[j];
      });
    });
  }
  if (!display) return null;
  return {
    team, key, name: display as string,
    profile: { name: display, academic_year: year, photo_url: null, jersey_number: null },
    stats: null, ncaaStats: fromNcaa, games: [], national: nationalRanks(seo, display), source: "ncaa" as const,
  };
}
