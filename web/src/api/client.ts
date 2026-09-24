import { useQuery } from "@tanstack/react-query";
import type {
  CompareResult,
  GameDetail,
  GameSummary,
  MetricDef,
  PlayerDetail,
  ScheduleGame,
  ScheduleGameDetail,
  TeamStats,
  TeamSummary,
  ZoneMetric,
  Player,
  AccountsList,
  Me,
  MyGameGps,
  MyProfile,
  PlayerReadinessHistory,
  ReadinessInput,
  ReadinessToday,
  SquadReadiness,
  NcaaConference,
  NcaaRankings,
  NcaaScoreboard,
  NcaaStandings,
  NcaaStatsIndex,
  NcaaTable,
} from "../types";

/** Thrown on 401 so the app can drop back to the sign-in screen. */
export class AuthError extends Error {}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) throw new AuthError("Signed out");
  if (!res.ok) throw new Error(`Request failed: ${url} (${res.status})`);
  return res.json();
}

/** JSON write request; surfaces the server's { error } message on failure. */
async function sendJson<T>(url: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith("/api/auth/login")) throw new AuthError("Signed out");
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

// --- Auth -------------------------------------------------------------------

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<Me | null> => {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) return null;
      if (!res.ok) throw new Error(`Couldn't reach the server (${res.status})`);
      return res.json();
    },
    staleTime: Infinity,
  });
}

export function login(email: string, password: string) {
  return sendJson<Omit<Me, "authRequired">>("/api/auth/login", "POST", { email, password });
}

export function logout() {
  return sendJson<{ ok: true }>("/api/auth/logout", "POST");
}

// --- Player's own view --------------------------------------------------------

export function useMyProfile() {
  return useQuery({ queryKey: ["myProfile"], queryFn: () => fetchJson<MyProfile>("/api/me/profile") });
}

export function useMyGameGps(gameId: number | null) {
  return useQuery({
    queryKey: ["myGameGps", gameId],
    queryFn: () => fetchJson<MyGameGps>(`/api/me/gps/${gameId}`),
    enabled: gameId !== null,
  });
}

export function useMyReadinessToday() {
  return useQuery({ queryKey: ["myReadinessToday"], queryFn: () => fetchJson<ReadinessToday>("/api/me/readiness/today") });
}

export function saveMyReadiness(input: ReadinessInput) {
  return sendJson<ReadinessToday>("/api/me/readiness/today", "PUT", input);
}

export function useMyReadinessHistory(days = 30) {
  return useQuery({
    queryKey: ["myReadinessHistory", days],
    queryFn: () => fetchJson<PlayerReadinessHistory>(`/api/me/readiness/history?days=${days}`),
  });
}

export interface PushConfig {
  publicKey: string;
  reminderEnabled: boolean;
  reminderTime: string;
  followupTime: string | null; // null when the follow-up is off
}

export function usePushConfig() {
  return useQuery({ queryKey: ["pushConfig"], queryFn: () => fetchJson<PushConfig>("/api/me/push/config"), staleTime: Infinity });
}

// --- Coach readiness + accounts ---------------------------------------------

export function useSquadReadiness(date: string | null) {
  return useQuery({
    queryKey: ["squadReadiness", date],
    queryFn: () => fetchJson<SquadReadiness>(`/api/readiness/squad${date ? `?date=${date}` : ""}`),
    refetchInterval: 60_000,
  });
}

export function usePlayerReadiness(playerId: number | null, days = 30) {
  return useQuery({
    queryKey: ["playerReadiness", playerId, days],
    queryFn: () => fetchJson<PlayerReadinessHistory>(`/api/readiness/player/${playerId}?days=${days}`),
    enabled: playerId !== null,
  });
}

export interface ReminderSettings {
  enabled: boolean;
  time: string;
  followupEnabled: boolean;
  followupTime: string;
  lastSentDate: string | null;
  lastFollowupDate: string | null;
  playersWithNotifications: number;
  timezone: string;
}

export function useReminderSettings() {
  return useQuery({ queryKey: ["reminders"], queryFn: () => fetchJson<ReminderSettings>("/api/admin/reminders") });
}

export function updateReminderSettings(input: { enabled?: boolean; time?: string; followupEnabled?: boolean; followupTime?: string }) {
  return sendJson<ReminderSettings>("/api/admin/reminders", "PUT", input);
}

export function sendRemindersNow() {
  return sendJson<{ players: number; sent: number; failed: number }>("/api/admin/reminders/send-now", "POST");
}

export function useAccounts() {
  return useQuery({ queryKey: ["accounts"], queryFn: () => fetchJson<AccountsList>("/api/admin/accounts") });
}

export function createAccount(input: { role: "player" | "coach"; email: string; password: string; playerId?: number }) {
  return sendJson<{ user_id: number }>("/api/admin/accounts", "POST", input);
}

export function updateAccount(userId: number, input: { email?: string; password?: string }) {
  return sendJson<{ ok: true }>(`/api/admin/accounts/${userId}`, "PATCH", input);
}

export function deleteAccount(userId: number) {
  return sendJson<{ ok: true }>(`/api/admin/accounts/${userId}`, "DELETE");
}

// --- Coach dashboard ----------------------------------------------------------

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

export function useTeamStats() {
  return useQuery({ queryKey: ["teamStats"], queryFn: () => fetchJson<TeamStats>("/api/team/stats") });
}

export function useSchedule() {
  return useQuery({ queryKey: ["schedule"], queryFn: () => fetchJson<ScheduleGame[]>("/api/schedule") });
}

export function useScheduleGame(id: number | null) {
  return useQuery({
    queryKey: ["scheduleGame", id],
    queryFn: () => fetchJson<ScheduleGameDetail>(`/api/schedule/${id}`),
    enabled: id !== null,
  });
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

export interface SyncScheduleResult {
  status: "ok" | "error";
  message: string;
  gamesUpserted: number;
  gamesWithStatsSynced: number;
  playerRowsUpserted: number;
  anomalies: string[];
  unmatchedPlayers: string[];
}

export async function syncScheduleFromSidearm(): Promise<SyncScheduleResult> {
  const res = await fetch("/api/admin/sync-schedule", { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? `Sync failed (${res.status})`);
  return body;
}

export interface AutoSyncStatus {
  enabled: boolean;
  intervalMinutes: number;
  running: boolean;
  lastRunAt: string | null;
  lastResult: { schedule: SyncScheduleResult | null; minutes: SyncMinutesResult | null } | null;
  lastError: string | null;
  nextRunAt: string | null;
}

export function useAutoSyncStatus() {
  return useQuery({
    queryKey: ["autoSyncStatus"],
    queryFn: () => fetchJson<AutoSyncStatus>("/api/admin/sync-status"),
    refetchInterval: 60_000,
  });
}

// --- NCAA D1 ------------------------------------------------------------------

/** Scoreboard for a date; refreshes every minute when viewing today (live scores). */
export function useNcaaScoreboard(date: string | null, live: boolean) {
  return useQuery({
    queryKey: ["ncaaScoreboard", date],
    queryFn: () => fetchJson<NcaaScoreboard>(`/api/ncaa/scoreboard${date ? `?date=${date}` : ""}`),
    refetchInterval: live ? 60_000 : false,
  });
}

export function useNcaaStandings() {
  return useQuery({ queryKey: ["ncaaStandings"], queryFn: () => fetchJson<NcaaStandings>("/api/ncaa/standings"), refetchInterval: 5 * 60_000 });
}

export function useNcaaStatsIndex() {
  return useQuery({ queryKey: ["ncaaStatsIndex"], queryFn: () => fetchJson<NcaaStatsIndex>("/api/ncaa/stats") });
}

export function useNcaaStat(key: string | null) {
  return useQuery({
    queryKey: ["ncaaStat", key],
    queryFn: () => fetchJson<NcaaTable & { ourTeam: string }>(`/api/ncaa/stats/${key}`),
    enabled: key !== null,
  });
}

export function useNcaaRankings() {
  return useQuery({
    queryKey: ["ncaaRankings"],
    queryFn: () => fetchJson<NcaaRankings>("/api/ncaa/rankings"),
  });
}

export function useNcaaConference(seo: string) {
  return useQuery({
    queryKey: ["ncaaConference", seo],
    queryFn: () => fetchJson<NcaaConference>(`/api/ncaa/conference/${seo}`),
    refetchInterval: 5 * 60_000,
  });
}
