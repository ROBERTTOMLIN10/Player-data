import type { getDb } from "../db/connection.js";
import { ROSTER_PATH, SIDEARM_BASE_URL } from "./sidearmConfig.js";
import { fetchAndParseNuxtPage } from "./nuxtPayload.js";
import { matchSidearmPlayer } from "./matchSidearmPlayer.js";
import { normalizePlayerName } from "./nameNormalization.js";

export interface SidearmRosterPlayer {
  name: string; // "First Last", as the box scores are matched
  positionShort: string | null; // "GK", "Def", "Mid", "For"
  jerseyNumber: string | null;
  academicYear: string | null; // "Fr.", "So.", ...
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** This season's roster from fausports.com (pinia.roster.roster.<id>.players). */
export async function fetchRoster(): Promise<SidearmRosterPlayer[]> {
  const url = `${SIDEARM_BASE_URL}${ROSTER_PATH}`;
  const root = await fetchAndParseNuxtPage(url);
  const store = isRecord(root) && isRecord(root.pinia) && isRecord(root.pinia.roster) ? root.pinia.roster.roster : null;
  const roster = isRecord(store) ? Object.values(store).find((r) => isRecord(r) && Array.isArray(r.players)) : null;
  if (!isRecord(roster)) throw new Error(`Unexpected roster page shape at ${url} — Sidearm may have changed their page structure.`);
  return (roster.players as unknown[]).filter(isRecord).flatMap((p) => {
    const name = [str(p.firstName), str(p.lastName)].filter(Boolean).join(" ");
    if (!name || p.hide === true) return [];
    return [{ name, positionShort: str(p.positionShort), jerseyNumber: str(p.jerseyNumber), academicYear: str(p.academicYearShort) }];
  });
}

export const isGoalkeeper = (p: SidearmRosterPlayer) => p.positionShort?.toUpperCase() === "GK";

/**
 * Replaces roster_players with this roster. Each name is matched to an app
 * player the same way box scores are (exact alias, then a unique last name).
 * Outfield players not in the app yet (no GPS file, e.g. not trained with a
 * tracker) are added as players so they're listed everywhere; their GPS data
 * joins them once a file includes them. Goalkeepers wear no tracker, so an
 * unmatched keeper is not added (Team Stats only).
 */
export function syncRoster(db: ReturnType<typeof getDb>, roster: SidearmRosterPlayer[]) {
  if (roster.length === 0) return;
  const added: string[] = [];
  db.transaction(() => {
    const insert = db.prepare(
      "INSERT INTO roster_players (player_name, player_id, position_short, jersey_number, academic_year) VALUES (?, ?, ?, ?, ?)",
    );
    db.prepare("DELETE FROM roster_players").run();
    for (const p of roster) {
      let playerId = matchSidearmPlayer(db, p.name).playerId;
      if (!playerId && !isGoalkeeper(p)) {
        db.prepare("INSERT OR IGNORE INTO players (canonical_name) VALUES (?)").run(p.name);
        playerId = (db.prepare("SELECT id FROM players WHERE canonical_name = ?").get(p.name) as { id: number }).id;
        db.prepare("INSERT OR IGNORE INTO player_aliases (player_id, normalized_alias, raw_alias) VALUES (?, ?, ?)").run(
          playerId,
          normalizePlayerName(p.name),
          p.name,
        );
        added.push(p.name);
      }
      insert.run(p.name, playerId, p.positionShort, p.jerseyNumber, p.academicYear);
    }
  })();
  console.log(`Roster: ${roster.length} players${added.length ? `; added from the roster (no GPS file yet): ${added.join(", ")}` : ""}`);
}
