import { ROSTER_PATH, SIDEARM_BASE_URL } from "./sidearmConfig.js";
import { fetchAndParseNuxtPage } from "./nuxtPayload.js";

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
