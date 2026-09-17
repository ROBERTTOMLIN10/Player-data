import { useQuery } from "@tanstack/react-query";
import type { CompareResult, GameDetail, GameSummary, MetricDef, PlayerDetail, TeamSummary, ZoneMetric, Player } from "../types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${url} (${res.status})`);
  return res.json();
}

export function useGames() {
  return useQuery({ queryKey: ["games"], queryFn: () => fetchJson<GameSummary[]>("/api/games") });
}

export function useGameDetail(gameId: number | null) {
  return useQuery({
    queryKey: ["game", gameId],
    queryFn: () => fetchJson<GameDetail>(`/api/games/${gameId}`),
    enabled: gameId !== null,
  });
}

export function useGameZones(gameId: number | null, playerId?: number | null) {
  return useQuery({
    queryKey: ["gameZones", gameId, playerId],
    queryFn: () =>
      fetchJson<ZoneMetric[]>(`/api/games/${gameId}/zones${playerId ? `?playerId=${playerId}` : ""}`),
    enabled: gameId !== null,
  });
}

export function usePlayers() {
  return useQuery({ queryKey: ["players"], queryFn: () => fetchJson<Player[]>("/api/players") });
}

export function usePlayerDetail(playerId: number | null) {
  return useQuery({
    queryKey: ["player", playerId],
    queryFn: () => fetchJson<PlayerDetail>(`/api/players/${playerId}`),
    enabled: playerId !== null,
  });
}

export function useTeamSummary() {
  return useQuery({ queryKey: ["teamSummary"], queryFn: () => fetchJson<TeamSummary>("/api/team/summary") });
}

export function useCompare(playerIds: number[]) {
  return useQuery({
    queryKey: ["compare", playerIds],
    queryFn: () => fetchJson<CompareResult>(`/api/compare?playerIds=${playerIds.join(",")}`),
    enabled: playerIds.length > 0,
  });
}

export function useMetrics() {
  return useQuery({ queryKey: ["metrics"], queryFn: () => fetchJson<MetricDef[]>("/api/metrics") });
}

export interface UploadTitanResult {
  status: "imported" | "skipped" | "error";
  filename: string;
  gameId?: number;
  gameDate?: string;
  opponent?: string | null;
  playerCount?: number;
  message: string;
  warnings: string[];
}

export async function uploadTitanFile(file: File): Promise<UploadTitanResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/admin/upload-titan", { method: "POST", body: formData });
  const body = await res.json();
  if (!res.ok && res.status !== 422 && res.status !== 409) {
    throw new Error(body?.message ?? `Upload failed (${res.status})`);
  }
  return body;
}

export interface SyncMinutesResult {
  status: "ok" | "error";
  message: string;
  gamesMatched: number;
  gamesSkippedNoBoxscore: number;
  rowsUpserted: number;
  anomalies: string[];
  unmatchedPlayers: string[];
}

export async function syncMinutesFromSidearm(): Promise<SyncMinutesResult> {
  const res = await fetch("/api/admin/sync-minutes", { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? `Sync failed (${res.status})`);
  return body;
}
