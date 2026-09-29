import type { getDb } from "../db/connection.js";
import { ROSTER_PATH, SIDEARM_BASE_URL } from "./sidearmConfig.js";
import { fetchAndParseNuxtPage } from "./nuxtPayload.js";
import { matchSidearmPlayer } from "./matchSidearmPlayer.js";
import { normalizePlayerName } from "./nameNormalization.js";
import { findSamePerson, playerCandidates } from "./samePerson.js";

export interface SidearmRosterPlayer {
  name: string; // "First Last", as the box scores are matched
  positionShort: string | null; // "GK", "Def", "Mid", "For"
  jerseyNumber: string | null;
  academicYear: string | null; // "Fr.", "So.", ...
  profile?: RosterProfile;
}

/** Profile details from the roster page; any can be blank when FAU doesn't publish them. */
export interface RosterProfile {
  position_long: string | null;
  academic_year_long: string | null;
  height_feet: number | null;
  height_inches: number | null;
  weight: number | null;
  hometown: string | null;
  high_school: string | null;
  previous_school: string | null;
  major: string | null;
  birth_date: string | null;
  is_captain: number;
  instagram: string | null;
  photo_url: string | null;
  profile_url: string | null;
}

export const PROFILE_COLUMNS: (keyof RosterProfile)[] = [
  "position_long", "academic_year_long", "height_feet", "height_inches", "weight", "hometown", "high_school",
  "previous_school", "major", "birth_date", "is_captain", "instagram", "photo_url", "profile_url",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const absolute = (v: unknown) => {
  const s = str(v);
  return s ? new URL(s, SIDEARM_BASE_URL).toString() : null;
};

function profileOf(p: Record<string, unknown>): RosterProfile {
  const image = isRecord(p.image) ? p.image : {};
  return {
    position_long: str(p.positionLong),
    academic_year_long: str(p.academicYearLong),
    height_feet: num(p.heightFeet),
    height_inches: typeof p.heightInches === "number" && p.heightFeet ? p.heightInches : null,
    weight: num(p.weight),
    hometown: str(p.hometown),
    high_school: str(p.highSchool),
    previous_school: str(p.previousSchool),
    major: str(p.major),
    birth_date: str(p.birthDate)?.slice(0, 10) ?? null,
    is_captain: p.isCaptain === true ? 1 : 0,
    instagram: null, // not shown (Rob asked to leave Instagram out)
    photo_url: str(image.absoluteUrl) ?? absolute(image.url),
    profile_url: absolute(p.call_to_action),
  };
}

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
    return [
      {
        name,
        positionShort: str(p.positionShort),
        jerseyNumber: str(p.jerseyNumber),
        academicYear: str(p.academicYearShort),
        profile: profileOf(p),
      },
    ];
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
    const cols = ["player_name", "player_id", "position_short", "jersey_number", "academic_year", ...PROFILE_COLUMNS];
    const insert = db.prepare(`INSERT INTO roster_players (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`);
    db.prepare("DELETE FROM roster_players").run();
    for (const p of roster) {
      let playerId = matchSidearmPlayer(db, p.name).playerId;
      if (!playerId) {
        // Spelt differently from the GPS files (nickname, shortened or double-barrelled name, typo)?
        playerId = findSamePerson(p.name, playerCandidates(db))?.id ?? null;
        if (playerId)
          db.prepare("INSERT OR IGNORE INTO player_aliases (player_id, normalized_alias, raw_alias) VALUES (?, ?, ?)").run(
            playerId,
            normalizePlayerName(p.name),
            p.name,
          );
      }
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
      insert.run(p.name, playerId, p.positionShort, p.jerseyNumber, p.academicYear, ...PROFILE_COLUMNS.map((c) => p.profile?.[c] ?? (c === "is_captain" ? 0 : null)));
    }
  })();
  console.log(`Roster: ${roster.length} players${added.length ? `; added from the roster (no GPS file yet): ${added.join(", ")}` : ""}`);
}
