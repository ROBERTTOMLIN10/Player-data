import { parse } from "node-html-parser";
import { firstLast, siteFetch, type GameLine, type KeeperLine, type SeasonStats, type SquadPlayer, type StatLine, type TeamGame } from "./readers.js";

/**
 * Conference websites (Sidearm): for teams whose own site can't be read
 * (Central Conn. St., Colgate, St. Thomas), their conference's stats service
 * has the whole squad with season stats and every game, and each game links
 * the official stats file (StatCrew XML) with the player lines. Photos and
 * bios come from the team's own roster data service where it answers.
 */

export interface ConferenceSource {
  host: string; // e.g. patriotleague.org
  teamId: string; // the conference's team id (from its teamstats.aspx page)
  /** The team site's own roster data (Sidearm /api/v2/Rosters/bySport/<sport>), for photos and bios, when it answers. */
  rosterApi?: string;
}

/** Photos and bios from a Sidearm roster data service, by player name. */
async function siteRoster(url: string): Promise<Map<string, Rec>> {
  const out = new Map<string, Rec>();
  try {
    const res = await siteFetch(url);
    if (!res.ok) return out;
    const text = await res.text();
    const players = text.trim() ? ((JSON.parse(text) as Rec).players ?? []) : [];
    for (const p of players as Rec[]) if (!p.hide) out.set(slug(`${p.firstName ?? ""} ${p.lastName ?? ""}`), p);
  } catch {
    /* no photos this time */
  }
  return out;
}

type Rec = Record<string, any>;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const whole = (v: unknown) => (num(v) === null ? null : Math.round(num(v)!));
/** "500:00" → 500 minutes. */
const mins = (v: unknown) => (typeof v === "string" && v.includes(":") ? whole(v.split(":")[0]) : whole(v));
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Players are keyed by name: the season service and the game files agree on "Last, First". */
const keyOf = (name: string) => `c-${slug(firstLast(name))}`;
const isTeamLine = (name: string) => /^(team|totals?)$/i.test(name.trim());

async function teamStats(src: ConferenceSource, year: number): Promise<Rec> {
  const url = `https://${src.host}/services/conf_stats.ashx?method=get_team_stats&team_id=${src.teamId}&sport=msoc&year=${year}&conf=False&postseason=False`;
  const res = await siteFetch(url);
  if (!res.ok) throw new Error(`${src.host} stats → HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error(`no stats on ${src.host} for team ${src.teamId}`);
  return JSON.parse(text) as Rec;
}

const people = (data: Rec) => ((data.players ?? []) as Rec[]).filter((p) => p?.name && !isTeamLine(String(p.name)));

export async function conferenceRoster(src: ConferenceSource, year: number): Promise<SquadPlayer[]> {
  const data = await teamStats(src, year);
  const site = src.rosterApi ? await siteRoster(src.rosterApi) : new Map<string, Rec>();
  const siteHost = src.rosterApi ? new URL(src.rosterApi).host : "";
  const byNumber = new Map([...site.values()].filter((x) => x.jerseyNumber).map((x) => [String(x.jerseyNumber), x]));
  return people(data).map((p) => {
    const name = firstLast(p.name);
    const jersey = p.uniform && p.uniform !== "0" ? String(p.uniform) : null;
    // Same name, else the same shirt number with the same surname.
    const last = slug(name).split("-").pop();
    const numbered = jersey ? byNumber.get(jersey) : undefined;
    const b = site.get(slug(name)) ?? (numbered && slug(String(numbered.lastName ?? "")).split("-").pop() === last ? numbered : undefined);
    const image = b?.image?.absoluteUrl ?? (b?.image?.url ? `https://${siteHost}${b.image.url}` : null);
    return {
      key: keyOf(p.name),
      name,
      jersey_number: jersey ?? (b?.jerseyNumber ? String(b.jerseyNumber) : null),
      position_short: b?.positionShort ?? p.position ?? null,
      academic_year: b?.academicYearShort ?? null,
      position_long: b?.positionLong?.trim() || null,
      academic_year_long: b?.academicYearLong ?? null,
      height_feet: whole(b?.heightFeet),
      height_inches: b?.heightFeet ? whole(b?.heightInches) ?? 0 : null,
      weight: whole(b?.weight),
      hometown: b?.hometown ?? null,
      high_school: b?.highSchool ?? null,
      previous_school: b?.previousSchool ?? null,
      major: b?.major ?? null,
      birth_date: null,
      is_captain: b?.isCaptain ? 1 : 0,
      instagram: null,
      photo_url: image,
      profile_url: b ? `https://${siteHost}/sports/mens-soccer/roster/${slug(name)}/${b.rosterPlayerId}` : null,
    };
  });
}

export async function conferenceSeasonStats(src: ConferenceSource, year: number): Promise<SeasonStats> {
  const data = await teamStats(src, year);
  const players: StatLine[] = [];
  const keepers: KeeperLine[] = [];
  for (const p of people(data)) {
    const gp = whole(p.games_played);
    if (!gp) continue;
    const shot = p.shot_stats ?? {};
    const caution = p.caution_stats ?? {};
    const base = { key: keyOf(p.name), name: firstLast(p.name), jersey_number: p.uniform && p.uniform !== "0" ? String(p.uniform) : null, gp, gs: whole(p.games_started) };
    players.push({
      ...base,
      minutes: mins(p.misc_stats?.minutes_played), goals: whole(shot.goals), assists: whole(shot.assists), points: whole(shot.points),
      shots: whole(shot.shots), shots_on_goal: whole(shot.shots_on_goal), yellow_cards: whole(caution.yellow_cards), red_cards: whole(caution.red_cards),
      game_winners: whole(p.goal_stats?.game_winning), pk_goals: whole(shot.penalty_kick_goals), pk_attempts: whole(shot.penalty_kick_attempts),
    });
    const gk = p.goalie_stats;
    if (gk && whole(gk.games_played)) {
      keepers.push({
        ...base,
        gp: whole(gk.games_played), gs: whole(gk.games_started), gk_minutes: mins(gk.minutes), goals_allowed: whole(gk.goals_allowed),
        gaa: num(gk.goals_against_avg), saves: whole(gk.saves), save_pct: num(gk.save_percentage), wins: whole(gk.wins), losses: whole(gk.losses),
        ties: whole(gk.ties), shutouts: whole(gk.shutouts),
      });
    }
  }
  const games = ((data.games ?? []) as Rec[])
    .map((g): TeamGame | null => {
      const m = String(g.date ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (!m || !g.game_file_location) return null;
      const us = whole(g.own_score);
      const them = whole(g.opp_score);
      const result = us === null || them === null ? null : `${us > them ? "W" : us < them ? "L" : "T"} ${us}-${them}`;
      return {
        date: `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`,
        opponent: String(g.opp_name ?? ""),
        home: g.home_or_away === "H",
        result,
        // The game file has both teams: remember which one is ours (its id, and its name for files written by the other team).
        boxscoreUrl: `${secureFileUrl(String(g.game_file_location))}#${encodeURIComponent(String(g.own_id ?? data.id ?? ""))}|${encodeURIComponent(String(g.own_name ?? data.name ?? ""))}`,
      };
    })
    .filter((g): g is TeamGame => g !== null);
  return { players, keepers, games };
}

/**
 * Game files live on an S3 bucket with dots in its name, whose https address
 * doesn't match S3's certificate; the path-style address does.
 */
function secureFileUrl(url: string): string {
  const m = url.match(/^https?:\/\/([^/]+)\.s3\.([a-z0-9-]+)\.amazonaws\.com\/(.+)$/i);
  return m ? `https://s3.${m[2]}.amazonaws.com/${m[1]}/${m[3]}` : url.replace(/^http:/, "https:");
}

export const isConferenceBoxscore = (url: string) => /\.xml(#|$)/i.test(url);

/** Our team's player lines from an official game file (StatCrew XML). */
export async function conferenceBoxscore(url: string): Promise<GameLine[]> {
  const [file, ours = ""] = url.split("#");
  const [teamId, teamName] = ours.split("|").map((x) => decodeURIComponent(x ?? ""));
  const res = await siteFetch(file);
  if (!res.ok) throw new Error(`${file} → HTTP ${res.status}`);
  const doc = parse(await res.text(), { lowerCaseTagName: true });
  const teams = doc.querySelectorAll("team");
  const team =
    teams.find((t) => t.getAttribute("id") === teamId) ??
    teams.find((t) => slug(t.getAttribute("name") ?? "") === slug(teamName ?? "") && slug(teamName ?? "") !== "");
  if (!team) throw new Error(`team ${teamId} not in ${file}`);
  return team
    .querySelectorAll("player")
    .filter((p) => p.getAttribute("gp") === "1")
    .map((p): GameLine => {
      const shots = p.querySelector("shots");
      const pen = p.querySelector("penalty");
      const gk = p.querySelector("goalie");
      const name = p.getAttribute("name") ?? "";
      return {
        key: keyOf(name),
        name: firstLast(name),
        started: p.getAttribute("gs") === "1",
        minutes: whole(p.querySelector("misc")?.getAttribute("minutes")),
        goals: whole(shots?.getAttribute("g")), assists: whole(shots?.getAttribute("a")),
        shots: whole(shots?.getAttribute("sh")), shots_on_goal: whole(shots?.getAttribute("sog")),
        yellow_cards: whole(pen?.getAttribute("yellow")), red_cards: whole(pen?.getAttribute("red")),
        saves: gk ? whole(gk.getAttribute("saves")) : null, goals_allowed: gk ? whole(gk.getAttribute("ga")) : null,
      };
    })
    .filter((l) => !isTeamLine(l.name));
}
