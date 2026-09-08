import { SIDEARM_BASE_URL, SCHEDULE_PATH } from "./sidearmConfig.js";
import { fetchAndParseNuxtPage } from "./nuxtPayload.js";

export interface SidearmScheduleGame {
  gameDate: string; // YYYY-MM-DD, date-only (site includes kickoff time, we drop it)
  opponent: string;
  status: string | null; // 'W' | 'L' | 'T' | null
  boxscoreUrl: string; // absolute URL
  recapUrl: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Fetches the Sidearm schedule page and returns every completed game that has
 * a published box score. Games without a boxscore.url (future games, or
 * scrimmages/exhibitions the athletic department never published a box score
 * for) are silently omitted — callers should treat "no match" for a locally
 * known game as "probably a scrimmage," not an error.
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
      const result = g.result;
      if (!isRecord(result)) continue;
      const boxscore = result.boxscore;
      if (!isRecord(boxscore) || typeof boxscore.url !== "string" || !boxscore.url) continue;

      const rawDate = typeof g.date === "string" ? g.date : null;
      const gameDate = rawDate ? rawDate.slice(0, 10) : null;
      const opponent = isRecord(g.opponent) && typeof g.opponent.title === "string" ? g.opponent.title : "Unknown";
      if (!gameDate) continue;

      const recap = result.recap;
      games.push({
        gameDate,
        opponent,
        status: typeof result.status === "string" ? result.status : null,
        boxscoreUrl: new URL(boxscore.url, SIDEARM_BASE_URL).toString(),
        recapUrl: isRecord(recap) && typeof recap.url === "string" ? new URL(recap.url, SIDEARM_BASE_URL).toString() : null,
      });
    }
  }
  return games;
}
