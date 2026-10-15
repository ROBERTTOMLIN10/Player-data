import { useQuery } from "@tanstack/react-query";
import type {
  AppointmentKind,
  BeforeTrainingResponse,
  ToConfirm,
  PlayLevel,
  CareAlertPrefs,
  CareAlertsResponse,
  CareDay,
  IssueDetail,
  Issue,
  MyCare,
  PlayerCare,
  AlertSettings,
  FollowsResponse,
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
  MyFitness,
  TeamFitness,
  FlaggedSession,
  NcaaScoreboard,
  NcaaStandings,
  NcaaStatsIndex,
  NcaaTable,
  NcaaPlayerPage,
  NcaaTeamPage,
  NcaaGameDetail,
  PlayerRpe,
  RpeSession,
  RpeSessionSummary,
  RpeTrends,
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

export function useFlaggedSessions() {
  return useQuery({ queryKey: ["flaggedSessions"], queryFn: () => fetchJson<FlaggedSession[]>("/api/team/flags") });
}

export function useTeamFitness(enabled = true) {
  return useQuery({ queryKey: ["teamFitness"], queryFn: () => fetchJson<TeamFitness>("/api/team/fitness"), enabled });
}

export function useMyFitness() {
  return useQuery({ queryKey: ["myFitness"], queryFn: () => fetchJson<MyFitness>("/api/me/fitness") });
}

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

// --- RPE ----------------------------------------------------------------------

export function useMyRpe(days = 30) {
  return useQuery({ queryKey: ["myRpe", days], queryFn: () => fetchJson<PlayerRpe>(`/api/me/rpe?days=${days}`) });
}

export function useRpeSession(date: string | null, session: number) {
  return useQuery({
    queryKey: ["rpeSession", date, session],
    queryFn: () => fetchJson<RpeSession>(`/api/rpe/session?session=${session}${date ? `&date=${date}` : ""}`),
  });
}

export function saveRpe(input: { player_id?: number; keeper_name?: string; date: string; session: number; rpe: number | "na" | null }) {
  return sendJson<typeof input>("/api/rpe/score", "PUT", input);
}

export function submitRpeSession(date: string, session: number) {
  return sendJson<{ date: string; session: number }>("/api/rpe/session/submit", "POST", { date, session });
}

export function useRpeSessions() {
  return useQuery({
    queryKey: ["rpeSessions"],
    queryFn: () => fetchJson<{ today: string; sessions: RpeSessionSummary[] }>("/api/rpe/sessions"),
  });
}

export function useRpeTrends() {
  return useQuery({ queryKey: ["rpeTrends"], queryFn: () => fetchJson<RpeTrends>("/api/rpe/trends") });
}

export function usePlayerRpe(playerId: number | null, days = 30) {
  return useQuery({
    queryKey: ["playerRpe", playerId, days],
    queryFn: () => fetchJson<PlayerRpe>(`/api/rpe/player/${playerId}?days=${days}`),
    enabled: playerId !== null,
  });
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

export function createAccount(input: { role: "player" | "coach" | "trainer"; email: string; password: string; playerId?: number }) {
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
  canReplace?: boolean; // a file with this name exists; upload again with replace to swap it
}

export async function uploadTitanFile(file: File, replace = false): Promise<UploadTitanResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (replace) formData.append("replace", "true");
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
  gameIntervalMinutes: number;
  awaitingGame: { opponent: string; game_date: string } | null;
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

export function useNcaaTeam(seo: string | undefined) {
  return useQuery({
    queryKey: ["ncaaTeam", seo],
    queryFn: () => fetchJson<NcaaTeamPage>(`/api/ncaa/team/${seo}`),
    enabled: Boolean(seo),
  });
}

/** One game's box score; live games refresh every 30 seconds. */
export function useNcaaGame(id: string | undefined) {
  return useQuery({
    queryKey: ["ncaaGame", id],
    queryFn: () => fetchJson<NcaaGameDetail>(`/api/ncaa/game/${id}`),
    enabled: Boolean(id),
    // Live games: every 20 seconds (the server re-reads NCAA.com at most that often).
    refetchInterval: (q) => (q.state.data?.status === "I" ? 20_000 : false),
  });
}

export function useNcaaPlayer(seo: string | undefined, key: string | undefined) {
  return useQuery({
    queryKey: ["ncaaPlayer", seo, key],
    queryFn: () => fetchJson<NcaaPlayerPage>(`/api/ncaa/player/${seo}/${encodeURIComponent(key!)}`),
    enabled: Boolean(seo && key),
  });
}

/** Every team's RPI rank by team (for the "RPI n" next to team names). */
export function useRpiRanks() {
  return useQuery({
    queryKey: ["ncaaRpi"],
    queryFn: () => fetchJson<{ updatedAt: string | null; ranks: Record<string, number> }>("/api/ncaa/rpi"),
    staleTime: 10 * 60_000,
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

// --- Favorite teams + game alerts ---------------------------------------------

export function useFollows() {
  return useQuery({ queryKey: ["follows"], queryFn: () => fetchJson<FollowsResponse>("/api/follows"), staleTime: 60_000 });
}

/** Star/unstar a team or change which alerts it sends. */
export function saveFollow(seo: string, change: { starred?: boolean; alerts?: Partial<AlertSettings> }) {
  return sendJson<{ ok: true }>(`/api/follows/${encodeURIComponent(seo)}`, "PUT", change);
}

// --- Player care (AT view) ------------------------------------------------------

export function useCareDay(date: string | null) {
  return useQuery({
    queryKey: ["careDay", date],
    queryFn: () => fetchJson<CareDay>(`/api/care/day${date ? `?date=${date}` : ""}`),
    refetchInterval: 60_000,
  });
}

export function usePlayerCare(playerId: number | null, date: string | null) {
  return useQuery({
    queryKey: ["playerCare", playerId, date],
    queryFn: () => fetchJson<PlayerCare>(`/api/care/player/${playerId}${date ? `?date=${date}` : ""}`),
    enabled: playerId !== null,
  });
}

export function useIssues(includeClosed: boolean) {
  return useQuery({
    queryKey: ["issues", includeClosed],
    queryFn: () => fetchJson<{ today: string; issues: Issue[] }>(`/api/care/issues${includeClosed ? "?include=closed" : ""}`),
  });
}

export function useIssue(id: number | null) {
  return useQuery({
    queryKey: ["issue", id],
    queryFn: () => fetchJson<IssueDetail>(`/api/care/issues/${id}`),
    enabled: id !== null,
  });
}

/** Care writes: every one refreshes the board, the report, the player's panel and the issue lists. */
export const careApi = {
  setAvailability: (playerId: number, body: Record<string, unknown>) => sendJson(`/api/care/availability/${playerId}`, "PUT", body),
  bookTreatment: (body: Record<string, unknown>) => sendJson(`/api/care/treatments`, "POST", body),
  updateTreatment: (id: number, body: Record<string, unknown>) => sendJson(`/api/care/treatments/${id}`, "PATCH", body),
  deleteTreatment: (id: number) => sendJson(`/api/care/treatments/${id}`, "DELETE"),
  addNote: (body: Record<string, unknown>) => sendJson(`/api/care/notes`, "POST", body),
  deleteNote: (id: number) => sendJson(`/api/care/notes/${id}`, "DELETE"),
  addIssue: (body: Record<string, unknown>) => sendJson<{ id: number }>(`/api/care/issues`, "POST", body),
  updateIssue: (id: number, body: Record<string, unknown>) => sendJson(`/api/care/issues/${id}`, "PATCH", body),
  deleteIssue: (id: number) => sendJson(`/api/care/issues/${id}`, "DELETE"),
  addLog: (issueId: number, body: Record<string, unknown>) => sendJson(`/api/care/issues/${issueId}/logs`, "POST", body),
  deleteLog: (issueId: number, logId: number) => sendJson(`/api/care/issues/${issueId}/logs/${logId}`, "DELETE"),
  sendMessage: (body: { player_id: number; date: string; body: string }) => sendJson(`/api/care/messages`, "POST", body),
  // Before training
  flag: (playerId: number, body: { date: string; note?: string | null; flagged?: boolean }) => sendJson(`/api/care/checks/${playerId}/flag`, "POST", body),
  callIn: (playerId: number, body: Record<string, unknown>) => sendJson(`/api/care/checks/${playerId}/call-in`, "POST", body),
  clear: (playerId: number, body: { date: string; cleared?: boolean }) => sendJson(`/api/care/checks/${playerId}/clear`, "POST", body),
  recommend: (playerId: number, body: { date: string; level: PlayLevel; note?: string | null }) => sendJson(`/api/care/checks/${playerId}/recommend`, "POST", body),
  decide: (playerId: number, body: { date: string; level: PlayLevel; note?: string | null }) => sendJson(`/api/care/checks/${playerId}/decide`, "POST", body),
  reopen: (playerId: number, body: { date: string }) => sendJson(`/api/care/checks/${playerId}/reopen`, "POST", body),
  same: (playerId: number, body: { date: string }) => sendJson(`/api/care/checks/${playerId}/same`, "POST", body),
  // Confirming what happened
  confirmVisit: (id: number, happened: boolean) => sendJson(`/api/care/treatments/${id}/confirm`, "POST", { happened }),
  confirmPrehab: (id: number, happened: boolean) => sendJson(`/api/care/prehab/${id}/confirm`, "POST", { happened }),
};
export const CARE_QUERY_KEYS = ["careDay", "playerCare", "issues", "issue", "squadReadiness", "beforeTraining", "toConfirm"];

/** "I came in" taps and pre-hab entries waiting on the AT. */
export function useToConfirm(enabled: boolean) {
  return useQuery({ queryKey: ["toConfirm"], queryFn: () => fetchJson<ToConfirm>("/api/care/to-confirm"), enabled, refetchInterval: 60_000 });
}

/** Who may miss part or all of training today, and where each one is in the AT → coach process. Refreshes every minute. */
export function useBeforeTraining(date: string | null) {
  return useQuery({
    queryKey: ["beforeTraining", date],
    queryFn: () => fetchJson<BeforeTrainingResponse>(`/api/care/before-training${date ? `?date=${date}` : ""}`),
    refetchInterval: 60_000,
  });
}

export function useMyCare() {
  return useQuery({ queryKey: ["myCare"], queryFn: () => fetchJson<MyCare>("/api/me/care"), refetchInterval: 60_000 });
}

/** The player's side of appointments and messages with the AT. */
export const myCareApi = {
  respond: (id: number, body: { action: "accept" | "decline" | "reschedule"; date?: string; time?: string; note?: string }) =>
    sendJson(`/api/me/care/treatments/${id}/respond`, "POST", body),
  request: (body: { date: string; time: string; kind: AppointmentKind; reason?: string; note?: string; injury_id?: number | null }) => sendJson(`/api/me/care/requests`, "POST", body),
  prehab: (body: { injury_id: number; activities: string; minutes?: number | null; date?: string }) => sendJson(`/api/me/care/prehab`, "POST", body),
  message: (body: { quick?: string; body?: string }) => sendJson(`/api/me/care/messages`, "POST", body),
};

export function useCareAlerts() {
  return useQuery({ queryKey: ["careAlerts"], queryFn: () => fetchJson<CareAlertsResponse>("/api/care/alerts") });
}
export const saveCareAlerts = (change: Partial<CareAlertPrefs>) => sendJson<CareAlertsResponse>("/api/care/alerts", "PUT", change);

export const markTreatmentAttended = (id: number) => sendJson(`/api/me/care/treatments/${id}/attended`, "POST");
