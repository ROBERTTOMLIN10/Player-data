import { SIDEARM_BASE_URL, SCHEDULE_PATH } from "./sidearmConfig.js";
import { fetchAndParseNuxtPage } from "./nuxtPayload.js";

export interface SidearmScheduleGame {
  gameDate: string; // YYYY-MM-DD, date-only (site includes kickoff time, we drop it)
  gameTime: string | null; // free text, e.g. "7 p.m."
  opponent: string;
  opponentLogoUrl: string | null;
  location: string | null;
  homeAway: string | null; // 'H' | 'A' | 'N'
  isConference: boolean;
  status: string | null; // 'W' | 'L' | 'T' | null (not yet played)
  teamScore: number | null;
  opponentScore: number | null;
  boxscoreUrl: string | null; // absolute URL, null until a box score is published
  recapUrl: string | null;
  raw: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetches the Sidearm schedule page and returns every game for the season —
 * both completed games (with result/score/box score) and upcoming games
 * (result fields will be null until fausports.com publishes them). Callers
 * that only care about completed games with a published box score should
 * filter on `boxscoreUrl !== null`.
 */
export async function fetchScheduleGames(): Promise<SidearmScheduleGame[]> {
  const url = `${SIDEARM_BASE_URL}${SCHEDULE_PATH}`;
  const root = await fetchAndParseNuxtPage(url);

  if (!isRecord(root) || !isRecord(root.pinia) || !isRecord(root.pinia.schedule)) {
    throw new Error(`Unexpected schedule page shape at ${url} — Sidearm may have changed their page structure.`);
  }
  const scheduleStore = root.pinia.schedule as Record<string, unknown>;
  const schedules = scheduleStore.schedules;
  if (!isRecord(schedules)) {
    throw new Error(`schedule.schedules missing/not an object at ${url}`);
  }
  const scheduleEntries = Object.values(schedules).filter(isRecord);
  if (scheduleEntries.length === 0) {
    throw new Error(`No schedule entries found at ${url}`);
  }

  const games: SidearmScheduleGame[] = [];
  for (const entry of scheduleEntries) {
    const rawGames = entry.games;
    if (!Array.isArray(rawGames)) continue;
    for (const g of rawGames) {
      if (!isRecord(g)) continue;

      const rawDate = typeof g.date === "string" ? g.date : null;
      const gameDate = rawDate ? rawDate.slice(0, 10) : null;
      if (!gameDate) continue;

      const opponentObj = isRecord(g.opponent) ? g.opponent : null;
      const opponent = typeof opponentObj?.title === "string" ? opponentObj.title : "Unknown";
      const opponentImage = isRecord(opponentObj?.image) ? opponentObj.image : null;
      const opponentLogoUrl = typeof opponentImage?.fullpath === "string" ? opponentImage.fullpath : null;

      const result = isRecord(g.result) ? g.result : null;
      const boxscore = isRecord(result?.boxscore) ? result.boxscore : null;
      const recap = isRecord(result?.recap) ? result.recap : null;

      games.push({
        gameDate,
        gameTime: typeof g.time === "string" ? g.time : null,
        opponent,
        opponentLogoUrl,
        location: typeof g.location === "string" ? g.location : null,
        homeAway: typeof g.location_indicator === "string" ? g.location_indicator : null,
        isConference: g.conference === true,
        status: typeof result?.status === "string" ? result.status : null,
        teamScore: toIntOrNull(result?.team_score),
        opponentScore: toIntOrNull(result?.opponent_score),
        boxscoreUrl:
          typeof boxscore?.url === "string" && boxscore.url ? new URL(boxscore.url, SIDEARM_BASE_URL).toString() : null,
        recapUrl: typeof recap?.url === "string" && recap.url ? new URL(recap.url, SIDEARM_BASE_URL).toString() : null,
        raw: g,
      });
    }
  }
  return games;
}
