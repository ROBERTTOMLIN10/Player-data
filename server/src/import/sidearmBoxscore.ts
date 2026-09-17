import { FAU_TEAM_NAME_PATTERN } from "./sidearmConfig.js";
import { fetchAndParseNuxtPage } from "./nuxtPayload.js";

export interface SidearmPlayerMinutes {
  rawName: string; // as printed by Sidearm, "Last, First"
  firstLast: string; // reordered "First Last", for name matching
  position: string | null;
  started: boolean;
  minutes: number | null;
  anomaly: string | null; // set when we had to resolve a duplicate/conflicting row
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toFirstLast(rawName: string): string {
  const commaIdx = rawName.indexOf(",");
  if (commaIdx === -1) return rawName.trim();
  const last = rawName.slice(0, commaIdx).trim();
  const first = rawName.slice(commaIdx + 1).trim();
  return `${first} ${last}`.trim();
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Loads a boxscore page and identifies which side (home/visiting) is FAU,
 * shared by fetchBoxscoreMinutes and fetchBoxscoreDetails so the (occasionally
 * ambiguous) team-name-matching logic only lives in one place.
 */
async function loadBoxscoreAndFindFau(url: string): Promise<{
  bs: Record<string, unknown>;
  fauTeam: Record<string, unknown>;
  opponentTeam: Record<string, unknown>;
  fauIsHome: boolean;
}> {
  const root = await fetchAndParseNuxtPage(url);

  if (!isRecord(root) || !isRecord(root.pinia) || !isRecord(root.pinia.boxscore)) {
    throw new Error(`Unexpected boxscore page shape at ${url} — Sidearm may have changed their page structure.`);
  }
  const boxscoreStore = root.pinia.boxscore as Record<string, unknown>;
  const boxscoreWrapper = boxscoreStore.boxscore;
  if (!isRecord(boxscoreWrapper)) {
    throw new Error(`boxscore.boxscore missing/not an object at ${url}`);
  }
  const bs = Object.values(boxscoreWrapper).find(isRecord);
  if (!bs) {
    throw new Error(`boxscore.boxscore had no game entry at ${url}`);
  }

  const homeTeam = bs.homeTeam;
  const visitingTeam = bs.visitingTeam;
  if (!isRecord(homeTeam) || !isRecord(visitingTeam)) {
    throw new Error(`homeTeam/visitingTeam missing at ${url}`);
  }
  const homeName = typeof homeTeam.name === "string" ? homeTeam.name : "";
  const awayName = typeof visitingTeam.name === "string" ? visitingTeam.name : "";

  const homeIsFau = FAU_TEAM_NAME_PATTERN.test(homeName);
  const awayIsFau = FAU_TEAM_NAME_PATTERN.test(awayName);
  let fauIsHome: boolean;
  if (homeIsFau && !awayIsFau) {
    fauIsHome = true;
  } else if (awayIsFau && !homeIsFau) {
    fauIsHome = false;
  } else {
    // Name match was ambiguous (both/neither matched) — fall back to Sidearm's
    // own "thisTeamIsHomeTeam" flag, which always identifies the site's own team.
    fauIsHome = bs.thisTeamIsHomeTeam === true;
    console.warn(
      `  [boxscore] could not confirm FAU by team name ("${homeName}" vs "${awayName}") at ${url}; falling back to thisTeamIsHomeTeam=${bs.thisTeamIsHomeTeam}`,
    );
  }

  return {
    bs,
    fauTeam: fauIsHome ? homeTeam : visitingTeam,
    opponentTeam: fauIsHome ? visitingTeam : homeTeam,
    fauIsHome,
  };
}

/**
 * Fetches a single Sidearm box score page and returns FAU's roster with
 * minutes played. Sidearm's own data occasionally lists the same player twice
 * for one game (observed: a duplicate row with 0 minutes alongside the real
 * entry) — when that happens we keep the row with the most minutes and flag
 * it via `anomaly` so the caller can log it for a human to sanity-check.
 */
export async function fetchBoxscoreMinutes(url: string): Promise<SidearmPlayerMinutes[]> {
  const root = await fetchAndParseNuxtPage(url);

  if (!isRecord(root) || !isRecord(root.pinia) || !isRecord(root.pinia.boxscore)) {
    throw new Error(`Unexpected boxscore page shape at ${url} — Sidearm may have changed their page structure.`);
  }
  const boxscoreStore = root.pinia.boxscore as Record<string, unknown>;
  const boxscoreWrapper = boxscoreStore.boxscore;
  if (!isRecord(boxscoreWrapper)) {
    throw new Error(`boxscore.boxscore missing/not an object at ${url}`);
  }
  const bs = Object.values(boxscoreWrapper).find(isRecord);
  if (!bs) {
    throw new Error(`boxscore.boxscore had no game entry at ${url}`);
  }

  const homeTeam = bs.homeTeam;
  const visitingTeam = bs.visitingTeam;
  if (!isRecord(homeTeam) || !isRecord(visitingTeam)) {
    throw new Error(`homeTeam/visitingTeam missing at ${url}`);
  }
  const homeName = typeof homeTeam.name === "string" ? homeTeam.name : "";
  const awayName = typeof visitingTeam.name === "string" ? visitingTeam.name : "";

  const homeIsFau = FAU_TEAM_NAME_PATTERN.test(homeName);
  const awayIsFau = FAU_TEAM_NAME_PATTERN.test(awayName);
  let fauTeam: Record<string, unknown>;
  if (homeIsFau && !awayIsFau) {
    fauTeam = homeTeam;
  } else if (awayIsFau && !homeIsFau) {
    fauTeam = visitingTeam;
  } else {
    // Name match was ambiguous (both/neither matched) — fall back to Sidearm's
    // own "thisTeamIsHomeTeam" flag, which always identifies the site's own team.
    const flagSaysHome = bs.thisTeamIsHomeTeam === true;
    console.warn(
      `  [boxscore] could not confirm FAU by team name ("${homeName}" vs "${awayName}") at ${url}; falling back to thisTeamIsHomeTeam=${bs.thisTeamIsHomeTeam}`,
    );
    fauTeam = flagSaysHome ? homeTeam : visitingTeam;
  }

  const players = fauTeam.players;
  if (!Array.isArray(players)) {
    throw new Error(`FAU team.players missing/not an array at ${url}`);
  }

  // Group raw rows by normalized name to detect/resolve Sidearm's occasional duplicate rows.
  const byName = new Map<string, Record<string, unknown>[]>();
  for (const p of players) {
    if (!isRecord(p) || typeof p.name !== "string" || !p.name.trim()) continue;
    const key = p.name.trim().toUpperCase();
    const list = byName.get(key) ?? [];
    list.push(p);
    byName.set(key, list);
  }

  const results: SidearmPlayerMinutes[] = [];
  for (const [, rows] of byName) {
    let chosen = rows[0];
    let anomaly: string | null = null;
    if (rows.length > 1) {
      const withMinutes = rows.map((r) => ({ row: r, min: Number(r.minutesPlayed) || 0 }));
      withMinutes.sort((a, b) => b.min - a.min);
      chosen = withMinutes[0].row;
      const distinctMinutes = new Set(withMinutes.map((r) => r.min));
      anomaly = `Sidearm listed "${chosen.name}" ${rows.length}x for this game (minutes: ${withMinutes.map((r) => r.min).join(", ")}); kept the highest value.`;
      if (distinctMinutes.size === 1) {
        anomaly = `Sidearm listed "${chosen.name}" ${rows.length}x for this game with identical stats; treated as one entry.`;
      }
    }
    const rawName = String(chosen.name);
    results.push({
      rawName,
      firstLast: toFirstLast(rawName),
      position: typeof chosen.position === "string" && chosen.position ? chosen.position : null,
      started: chosen.gameStarted === "1" || chosen.gameStarted === 1,
      minutes: chosen.minutesPlayed !== undefined && chosen.minutesPlayed !== null && chosen.minutesPlayed !== ""
        ? Number(chosen.minutesPlayed)
        : null,
      anomaly,
    });
  }
  return results;
}

export interface SidearmPlayerGameStats {
  rawName: string;
  firstLast: string;
  position: string | null;
  started: boolean;
  minutes: number | null;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  shotsOnGoal: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  isGoalie: boolean;
  saves: number | null;
  goalsAllowed: number | null;
  shutout: boolean;
  anomaly: string | null;
}

export interface SidearmTeamTotals {
  teamName: string;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  shotsOnGoal: number;
  saves: number | null;
  corners: number;
  fouls: number;
  offsides: number;
  yellowCards: number;
  redCards: number;
  raw: unknown;
}

export interface SidearmBoxscoreDetails {
  players: SidearmPlayerGameStats[];
  fauTotals: SidearmTeamTotals;
  opponentTotals: SidearmTeamTotals;
}

function extractTeamTotals(team: Record<string, unknown>): SidearmTeamTotals {
  const totals = isRecord(team.totals) ? team.totals : {};
  const shots = isRecord(totals.shots) ? totals.shots : {};
  const penalties = isRecord(totals.penalties) ? totals.penalties : {};
  const misc = isRecord(totals.miscStats) ? totals.miscStats : {};
  const goalie = isRecord(totals.goalie) ? totals.goalie : null;
  return {
    teamName: typeof team.name === "string" ? team.name : "",
    goals: toNum(shots.goals),
    assists: toNum(shots.assists),
    points: toNum(shots.points),
    shots: toNum(shots.numberOfShots),
    shotsOnGoal: toNum(shots.shotsOnGoal),
    saves: goalie ? toNumOrNull(goalie.saves) : null,
    corners: toNum(misc.corners),
    fouls: toNum(penalties.fouls),
    offsides: toNum(misc.offsides),
    yellowCards: toNum(penalties.yellow),
    redCards: toNum(penalties.red),
    raw: totals,
  };
}

/**
 * Fetches a single Sidearm box score page and returns FAU's full per-player
 * stat line (goals, assists, points, shots, cards, goalkeeper stats) plus
 * team-level totals for both FAU and the opponent. Shares the FAU-side
 * detection and duplicate-row resolution logic with fetchBoxscoreMinutes.
 */
export async function fetchBoxscoreDetails(url: string): Promise<SidearmBoxscoreDetails> {
  const { fauTeam, opponentTeam } = await loadBoxscoreAndFindFau(url);

  const players = fauTeam.players;
  if (!Array.isArray(players)) {
    throw new Error(`FAU team.players missing/not an array at ${url}`);
  }

  const byName = new Map<string, Record<string, unknown>[]>();
  for (const p of players) {
    if (!isRecord(p) || typeof p.name !== "string" || !p.name.trim()) continue;
    const key = p.name.trim().toUpperCase();
    const list = byName.get(key) ?? [];
    list.push(p);
    byName.set(key, list);
  }

  const results: SidearmPlayerGameStats[] = [];
  for (const [, rows] of byName) {
    let chosen = rows[0];
    let anomaly: string | null = null;
    if (rows.length > 1) {
      const withMinutes = rows.map((r) => ({ row: r, min: Number(r.minutesPlayed) || 0 }));
      withMinutes.sort((a, b) => b.min - a.min);
      chosen = withMinutes[0].row;
      const distinctMinutes = new Set(withMinutes.map((r) => r.min));
      anomaly = `Sidearm listed "${chosen.name}" ${rows.length}x for this game (minutes: ${withMinutes.map((r) => r.min).join(", ")}); kept the highest value.`;
      if (distinctMinutes.size === 1) {
        anomaly = `Sidearm listed "${chosen.name}" ${rows.length}x for this game with identical stats; treated as one entry.`;
      }
    }

    const rawName = String(chosen.name);
    const shots = isRecord(chosen.shots) ? chosen.shots : {};
    const penalties = isRecord(chosen.penalties) ? chosen.penalties : {};
    const isGoalie = chosen.isAGoalie === true;
    const goalie = isRecord(chosen.goalie) ? chosen.goalie : null;

    results.push({
      rawName,
      firstLast: toFirstLast(rawName),
      position: typeof chosen.position === "string" && chosen.position ? chosen.position : null,
      started: chosen.gameStarted === "1" || chosen.gameStarted === 1,
      minutes:
        chosen.minutesPlayed !== undefined && chosen.minutesPlayed !== null && chosen.minutesPlayed !== ""
          ? Number(chosen.minutesPlayed)
          : null,
      goals: toNum(shots.goals),
      assists: toNum(shots.assists),
      points: toNum(shots.points),
      shots: toNum(shots.numberOfShots),
      shotsOnGoal: toNum(shots.shotsOnGoal),
      fouls: toNum(penalties.fouls),
      yellowCards: toNum(penalties.yellow),
      redCards: toNum(penalties.red),
      isGoalie,
      saves: goalie ? toNumOrNull(goalie.saves) : null,
      goalsAllowed: goalie ? toNumOrNull(goalie.goalsAllowed) : null,
      shutout: goalie ? toNum(goalie.shutout) > 0 : false,
      anomaly,
    });
  }

  return {
    players: results,
    fauTotals: extractTeamTotals(fauTeam),
    opponentTotals: extractTeamTotals(opponentTeam),
  };
}
