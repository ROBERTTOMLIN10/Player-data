import { getDb } from "../db/connection.js";
import { shiftDate, teamToday } from "../lib/readiness.js";
import { fetchScoreboard } from "./client.js";
import { getCache, setCache } from "./store.js";

/**
 * Earlier seasons' results, for head-to-head on game pages. Each past season is
 * read once from NCAA.com's scoreboards (one request per day, mid-August to
 * mid-December) and kept; a season is marked done in ncaa_cache.
 */

const SEASONS_BACK = 5;
const FIRST_DAY = "08-15";
const LAST_DAY = "12-20"; // the College Cup is in early-to-mid December
let running = false;

export async function backfillPastSeasons(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const year = Number(teamToday().slice(0, 4));
    const save = getDb().prepare(
      `INSERT INTO ncaa_past_games (contest_id, season, game_date, home_seo, home_name, home_score, away_seo, away_name, away_score, final_message)
       VALUES (@contestId, @season, @date, @homeSeo, @homeName, @homeScore, @awaySeo, @awayName, @awayScore, @finalMessage)
       ON CONFLICT(contest_id) DO UPDATE SET home_score = excluded.home_score, away_score = excluded.away_score, final_message = excluded.final_message`,
    );
    for (let season = year - SEASONS_BACK; season < year; season++) {
      const key = `past-season-${season}`;
      const have = (getDb().prepare("SELECT COUNT(*) AS n FROM ncaa_past_games WHERE season = ?").get(season) as { n: number }).n;
      if (getCache(key) && have > 0) continue;
      let failures = 0;
      let saved = 0;
      for (let d = `${season}-${FIRST_DAY}`; d <= `${season}-${LAST_DAY}`; d = shiftDate(d, 1)) {
        try {
          for (const g of await fetchScoreboard(d)) {
            if (g.state !== "F" || !g.home.seo || !g.away.seo || g.home.score === null || g.away.score === null) continue;
            save.run({
              contestId: g.contestId, season, date: g.date, finalMessage: g.finalMessage,
              homeSeo: g.home.seo, homeName: g.home.name, homeScore: g.home.score,
              awaySeo: g.away.seo, awayName: g.away.name, awayScore: g.away.score,
            });
            saved++;
          }
        } catch (err) {
          failures++;
          console.error(`[ncaa] past scoreboard ${d} failed: ${(err as Error).message}`);
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      // A few missing days are tried again next time; otherwise the season is done.
      if (failures <= 3 && saved > 0) setCache(key, { saved, at: new Date().toISOString() });
      console.log(`[ncaa] season ${season}: ${saved} results saved (${failures} days failed)`);
    }
  } finally {
    running = false;
  }
}
