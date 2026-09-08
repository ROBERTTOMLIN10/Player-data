import type { getDb } from "../db/connection.js";
import { normalizePlayerName } from "./nameNormalization.js";

export interface SidearmMatchResult {
  playerId: number | null;
  matchedVia: "alias" | "last-name" | null;
  note: string | null; // set on last-name auto-link, or when unresolved (reason)
}

function lastToken(normalized: string): string {
  const parts = normalized.split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * Sidearm's box score names don't always match Titan's GPS export names for
 * the same human (legal-name vs. preferred-name differences, middle names
 * present in one source and not the other — e.g. Titan's "Herbert Amoah" vs.
 * Sidearm's "Kwakye-Amoah, Herbert"). We first try an exact normalized-name
 * match against the same player_aliases table Titan import uses, then fall
 * back to matching on last name alone: if exactly one known player shares
 * that last name, we link it (and persist the alias so future runs match
 * directly, same idempotent pattern as Titan import). Ambiguous or
 * unmatched names are left for a human to resolve via a manual alias insert.
 */
export function matchSidearmPlayer(db: ReturnType<typeof getDb>, firstLast: string): SidearmMatchResult {
  const normalized = normalizePlayerName(firstLast);

  const existingAlias = db
    .prepare("SELECT player_id FROM player_aliases WHERE normalized_alias = ?")
    .get(normalized) as { player_id: number } | undefined;
  if (existingAlias) {
    return { playerId: existingAlias.player_id, matchedVia: "alias", note: null };
  }

  const wantedLast = lastToken(normalized);
  if (!wantedLast) {
    return { playerId: null, matchedVia: null, note: `could not derive a last name from "${firstLast}"` };
  }

  const allAliases = db.prepare("SELECT player_id, normalized_alias FROM player_aliases").all() as {
    player_id: number;
    normalized_alias: string;
  }[];

  const candidatePlayerIds = new Set<number>();
  for (const a of allAliases) {
    if (lastToken(a.normalized_alias) === wantedLast) {
      candidatePlayerIds.add(a.player_id);
    }
  }

  if (candidatePlayerIds.size === 1) {
    const playerId = [...candidatePlayerIds][0];
    db.prepare("INSERT OR IGNORE INTO player_aliases (player_id, normalized_alias, raw_alias) VALUES (?, ?, ?)").run(
      playerId,
      normalized,
      firstLast,
    );
    return {
      playerId,
      matchedVia: "last-name",
      note: `linked "${firstLast}" to existing player via last-name match ("${wantedLast}") and saved as a new alias`,
    };
  }

  if (candidatePlayerIds.size > 1) {
    return {
      playerId: null,
      matchedVia: null,
      note: `"${firstLast}" matched ${candidatePlayerIds.size} different known players by last name ("${wantedLast}") — ambiguous, add an explicit alias manually`,
    };
  }

  return {
    playerId: null,
    matchedVia: null,
    note: `no known player matches "${firstLast}" (checked exact name and last name "${wantedLast}") — add a player_alias manually if this is a known player`,
  };
}
