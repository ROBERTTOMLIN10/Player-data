import { getDb } from "../db/connection.js";
import { GLITCH_TOP_SPEED_MPH } from "./metrics.js";

/**
 * GPS sessions a coach should look at:
 * - "glitch": a top speed no player can reach (e.g. a tracker left on in a
 *   car after the game). Left out of averages, rankings and fitness.
 * - "spike": a huge jump that's still possible: load at least twice the
 *   player's own usual (median of his other sessions, needs 3+) AND at least
 *   30% above anyone else's in that game. Still counted, flagged to check.
 * A first big game for a player who usually plays little isn't flagged: it
 * would need to beat every teammate by 30% too.
 */
export type SessionFlagKind = "glitch" | "spike";

export interface SessionFlag {
  kind: SessionFlagKind;
  reason: string;
}

interface Row {
  id: number;
  game_id: number;
  player_id: number;
  load: number | null;
  top_speed_mph: number | null;
}

const SPIKE_VS_OWN = 2;
const SPIKE_VS_TEAM = 1.3;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Every flagged session, by gps_sessions.id. */
export function getSessionFlags(): Map<number, SessionFlag> {
  const rows = getDb().prepare("SELECT id, game_id, player_id, load, top_speed_mph FROM gps_sessions").all() as Row[];
  const flags = new Map<number, SessionFlag>();
  const glitch = (r: Row) => r.top_speed_mph !== null && r.top_speed_mph > GLITCH_TOP_SPEED_MPH;

  for (const r of rows) {
    if (glitch(r)) {
      flags.set(r.id, {
        kind: "glitch",
        reason: `Top speed ${r.top_speed_mph!.toFixed(1)} mph isn't possible on foot (tracker left on or a GPS jump?). Left out of averages and fitness until the file is fixed.`,
      });
    }
  }

  const byPlayer = new Map<number, Row[]>();
  const byGame = new Map<number, Row[]>();
  for (const r of rows) {
    if (glitch(r) || r.load === null) continue;
    byPlayer.set(r.player_id, [...(byPlayer.get(r.player_id) ?? []), r]);
    byGame.set(r.game_id, [...(byGame.get(r.game_id) ?? []), r]);
  }
  for (const r of rows) {
    if (flags.has(r.id) || r.load === null) continue;
    const others = (byPlayer.get(r.player_id) ?? []).filter((x) => x.id !== r.id).map((x) => x.load!);
    const usual = others.length >= 3 ? median(others) : null;
    const nextBest = Math.max(0, ...(byGame.get(r.game_id) ?? []).filter((x) => x.id !== r.id).map((x) => x.load!));
    if (usual && r.load >= usual * SPIKE_VS_OWN && nextBest > 0 && r.load >= nextBest * SPIKE_VS_TEAM) {
      flags.set(r.id, {
        kind: "spike",
        reason: `Load ${Math.round(r.load)} is ${(r.load / usual).toFixed(1)}x his usual (${Math.round(usual)}) and well above anyone else in this game (${Math.round(nextBest)}). Check the tracker wasn't left running.`,
      });
    }
  }
  return flags;
}

/** Adds `flag` (or null) to each session row that has an `id`. */
export function withFlags<T extends { id: number }>(sessions: T[], flags = getSessionFlags()): (T & { flag: SessionFlag | null })[] {
  return sessions.map((s) => ({ ...s, flag: flags.get(s.id) ?? null }));
}
