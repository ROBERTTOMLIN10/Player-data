// Preview-only: shows a GPS file the moment it's uploaded on the Data page,
// without waiting for the next preview build. The preview has no server, so
// the upload is read in the browser and added to the captured API responses
// the GPS pages use (games list, the game's roster, team trend and season
// averages, each player's sessions, the player's own My GPS). Anyone opening
// the preview sees pending uploads too: they're read back from the artifact's
// storage on load. Season highs/lows, fitness comparisons and flags catch up
// at the next build, which imports the file for real.
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from "xlsx";
import { CORE_FIELD_MAP, NAME_HEADER_CANDIDATES } from "../../server/src/import/columnMapping";
import { normalizePlayerName } from "../../server/src/import/nameNormalization";
import { findSamePerson } from "../../server/src/import/samePerson";
import type { UploadRecord } from "./uploads";

type Data = Record<string, any>;
type Session = Record<string, number | null>;

const METRICS = [
  "load",
  "distance_mi",
  "top_speed_mph",
  "sprints_count",
  "sprints_distance_yd",
  "sprints_max_topspeed_mph",
  "sprints_avg_topspeed_mph",
  "peak_accel",
  "peak_decel",
  "explosiveness_count",
] as const;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Player rows of a Titan export: name plus the same session fields the real import keeps. */
export function rowsFromWorkbook(bytes: Uint8Array): { name: string; session: Session }[] {
  const wb = XLSX.read(bytes, { type: "array", cellDates: true });
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  const headers = Object.keys(rows[0] ?? {});
  const lower = new Map(headers.map((h) => [h.trim().toLowerCase(), h]));
  const nameKey = NAME_HEADER_CANDIDATES.map((c) => lower.get(c)).find(Boolean);
  if (!nameKey) return [];
  return rows
    .filter((r) => String(r[nameKey] ?? "").trim())
    .map((r) => ({
      name: String(r[nameKey]).trim(),
      session: Object.fromEntries(Object.entries(CORE_FIELD_MAP).map(([col, field]) => [field, num(r[col])])),
    }));
}

const averages = (sessions: Session[]) => Object.fromEntries(METRICS.map((m) => [`avg_${m}`, mean(sessions.map((s) => s[m]))]));

/** Moves running averages to include new values (weighted by how many values each side has). */
function blend(avgs: Record<string, number | null> | undefined, oldCount: number, added: Session[]) {
  if (!avgs) return;
  for (const m of METRICS) {
    const key = `avg_${m}`;
    const vals = added.map((s) => s[m]).filter((x): x is number => x !== null);
    if (!vals.length) continue;
    const before = avgs[key];
    avgs[key] = before === null || before === undefined || !oldCount ? mean(vals) : (before * oldCount + vals.reduce((a, b) => a + b, 0)) / (oldCount + vals.length);
  }
}

let nextGameId = 900_000;
let nextSessionId = 9_000_000;

/** Removes a game added earlier from the same file (a replaced upload, or one the build already has). */
function dropGame(data: Data, sourceFile: string) {
  const old = (data["/api/games"] ?? []).filter((g: any) => g.source_file === sourceFile);
  if (!old.length) return;
  const ids = new Set(old.map((g: any) => g.id));
  data["/api/games"] = data["/api/games"].filter((g: any) => !ids.has(g.id));
  for (const id of ids) delete data[`/api/games/${id}`];
  const summary = data["/api/team/summary"];
  if (summary?.trend) summary.trend = summary.trend.filter((t: any) => !ids.has(t.game_id));
  for (const [key, page] of Object.entries(data)) {
    if (!/^\/api\/players\/\d+$/.test(key) && key !== "/api/me/profile") continue;
    if ((page as any)?.sessions) (page as any).sessions = (page as any).sessions.filter((s: any) => !ids.has(s.game_id));
    if ((page as any)?.teamTrend) (page as any).teamTrend = (page as any).teamTrend.filter((t: any) => !ids.has(t.game_id));
  }
}

/**
 * Adds one uploaded game to the preview's data. A file the build has already
 * imported (same name, not a replacement) is left alone.
 */
export function applyUpload(data: Data, record: Pick<UploadRecord, "filename" | "gameDate" | "opponent" | "replace">, rows: { name: string; session: Session }[]) {
  if (!record.gameDate || !rows.length) return;
  const existing = (data["/api/games"] ?? []).find((g: any) => g.source_file === record.filename);
  if (existing && !record.replace && existing.id < 900_000) return; // already in the build
  if (existing) dropGame(data, record.filename);
  const games: any[] = data["/api/games"] ?? (data["/api/games"] = []);

  const players: any[] = data["/api/players"] ?? [];
  const candidates = players.map((p) => ({ id: p.id, names: [p.canonical_name] }));
  const byName = new Map(players.map((p) => [normalizePlayerName(p.canonical_name), p]));
  const gameId = nextGameId++;
  const game = { id: gameId, game_date: record.gameDate, opponent: record.opponent ?? "Game", source_file: record.filename };

  // Minutes and starts from the game's box score when the preview already has it (synced from fausports.com).
  const scheduled = (data["/api/schedule"] ?? []).find((g: any) => String(g.game_date).slice(0, 10) === record.gameDate);
  const boxLine = (playerId: number | undefined) =>
    scheduled && playerId ? data[`/api/players/${playerId}`]?.gameStats?.find((gs: any) => gs.schedule_game_id === scheduled.id) : undefined;
  const hasBoxScore = Boolean(scheduled?.status) && players.some((p) => boxLine(p.id));

  const sessions = rows.map((r) => {
    const player = byName.get(normalizePlayerName(r.name)) ?? players.find((p) => p.id === findSamePerson(r.name, candidates)?.id) ?? null;
    const line = boxLine(player?.id);
    const minutes = hasBoxScore ? (line?.minutes ?? 0) : null;
    return {
      id: nextSessionId++,
      game_id: gameId,
      player_id: player?.id ?? -nextSessionId,
      ...r.session,
      player_name: player?.canonical_name ?? r.name,
      minutes_played: minutes,
      started: line?.started ? 1 : 0,
      played: minutes !== null && minutes > 0 ? 1 : 0, // as the real app: played = minutes in the box score
      box_score: hasBoxScore ? 1 : 0,
      flag: null,
    };
  });
  const avgs = averages(sessions);
  const totalBefore = games.reduce((n, g) => n + (g.player_count ?? 0), 0);

  games.push({ ...game, player_count: sessions.length, ...avgs });
  games.sort((a, b) => String(a.game_date).localeCompare(String(b.game_date)));
  const maxes = Object.fromEntries(METRICS.map((m) => [`max_${m}`, Math.max(...sessions.map((s) => (s as any)[m] ?? -Infinity))]));
  data[`/api/games/${gameId}`] = { game: { ...game, imported_at: new Date().toISOString() }, sessions, teamAverages: { ...avgs, ...maxes } };

  const trendPoint = { game_id: gameId, game_date: record.gameDate, opponent: game.opponent, ...avgs };
  const summary = data["/api/team/summary"];
  if (summary) {
    blend(summary.seasonAverages, totalBefore, sessions);
    summary.trend = [...(summary.trend ?? []), trendPoint].sort((a: any, b: any) => String(a.game_date).localeCompare(String(b.game_date)));
  }

  const myId = data.playerMe?.playerId;
  for (const s of sessions) {
    const page = data[`/api/players/${s.player_id}`];
    const withGame = { ...s, game_date: record.gameDate, opponent: game.opponent };
    if (page?.sessions) {
      blend(page.seasonTotals, page.sessions.length, [s]);
      page.sessions = [...page.sessions, withGame];
    }
    if (s.player_id === myId) {
      const me = data["/api/me/profile"];
      if (me?.sessions) {
        blend(me.seasonTotals, me.sessions.length, [s]);
        me.sessions = [...me.sessions, withGame];
        me.teamTrend = [...(me.teamTrend ?? []), trendPoint];
      }
      const pick = (x: any) => ({ ...Object.fromEntries(METRICS.map((m) => [m, x[m]])), minutes: x.minutes_played, glitch: 0 });
      data[`/api/me/gps/${gameId}`] = {
        game: { id: gameId, game_date: record.gameDate, opponent: game.opponent },
        you: pick(s),
        others: sessions.filter((o) => o !== s).map(pick),
        teamAverages: avgs,
      };
    }
  }
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** On load: adds every upload still waiting for a build (read back from the artifact's storage). */
export async function applyPendingUploads(data: Data, list: () => Promise<UploadRecord[]>) {
  const pending = (await list()).filter((u) => u.status === "pending").sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  for (const u of pending) {
    try {
      const res = await fetch(`/_blob/${u.assetId}`);
      if (!res.ok) continue;
      applyUpload(data, u, rowsFromWorkbook(fromBase64(await res.text())));
    } catch {
      // Left for the next build.
    }
  }
}
