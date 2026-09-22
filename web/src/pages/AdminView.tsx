import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  syncMinutesFromSidearm,
  syncScheduleFromSidearm,
  uploadTitanFile,
  useAutoSyncStatus,
  type SyncMinutesResult,
  type SyncScheduleResult,
  type UploadTitanResult,
} from "../api/client";
import { AccountsPanel } from "../components/AccountsPanel";
import { Card, SectionHeading } from "../components/Card";

export default function AdminView() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: autoSyncStatus } = useAutoSyncStatus();

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadTitanResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncMinutesResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [syncingSchedule, setSyncingSchedule] = useState(false);
  const [syncScheduleResult, setSyncScheduleResult] = useState<SyncScheduleResult | null>(null);
  const [syncScheduleError, setSyncScheduleError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadResult(null);
    setUploadError(null);
    try {
      const result = await uploadTitanFile(file);
      setUploadResult(result);
      if (result.status === "imported") {
        queryClient.invalidateQueries();
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const result = await syncMinutesFromSidearm();
      setSyncResult(result);
      queryClient.invalidateQueries();
    } catch (err) {
      setSyncError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncSchedule() {
    setSyncingSchedule(true);
    setSyncScheduleResult(null);
    setSyncScheduleError(null);
    try {
      const result = await syncScheduleFromSidearm();
      setSyncScheduleResult(result);
      queryClient.invalidateQueries();
    } catch (err) {
      setSyncScheduleError((err as Error).message);
    } finally {
      setSyncingSchedule(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading title="Data" subtitle="Add a new game's GPS file, refresh minutes played, and manage logins — no terminal needed" />

      <Card className="flex flex-col gap-1 text-sm">
        <div className="flex items-center gap-2 font-medium text-text">
          <span className={`h-2 w-2 rounded-full ${autoSyncStatus?.enabled ? "bg-teal" : "bg-text-dim"}`} />
          Auto-sync {autoSyncStatus?.enabled ? "active" : "starting…"}
        </div>
        <div className="text-text-dim">
          {autoSyncStatus
            ? `Checks fausports.com every ${autoSyncStatus.intervalMinutes} minutes for schedule updates, game stats, and minutes played — no action needed.`
            : "Loading status…"}
          {autoSyncStatus?.lastRunAt && (
            <> Last checked {new Date(autoSyncStatus.lastRunAt).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}.</>
          )}
          {autoSyncStatus?.running && <> Running now…</>}
        </div>
        {autoSyncStatus?.lastError && (
          <div className="mt-1 text-xs text-yellow-300/90">Last background run had an issue: {autoSyncStatus.lastError}</div>
        )}
      </Card>

      <section>
        <SectionHeading
          title="Upload GPS File"
          subtitle="Drop in a Titan/Hudl .xlsx export. Name it like 2026-09-12_Opponent.xlsx so the opponent shows up correctly."
        />
        <Card className="flex flex-col gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
            className="text-sm text-text-dim file:mr-3 file:rounded-md file:border-0 file:bg-owl-red file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-owl-red/90 disabled:opacity-50"
          />
          {uploading && <div className="text-sm text-text-dim">Uploading and importing…</div>}
          {uploadError && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{uploadError}</div>
          )}
          {uploadResult && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                uploadResult.status === "imported"
                  ? "border-teal/40 bg-teal/10 text-teal"
                  : "border-yellow-700/50 bg-yellow-950/30 text-yellow-300"
              }`}
            >
              <div className="font-medium">{uploadResult.filename}</div>
              <div>{uploadResult.message}</div>
              {uploadResult.warnings.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-xs opacity-80">
                  {uploadResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeading
          title="Sync Minutes Played"
          subtitle="Runs automatically in the background. Use this button to force an immediate refresh instead of waiting for the next check."
        />
        <Card className="flex flex-col gap-4">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-fit rounded-md bg-owl-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-owl-red/90 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          {syncError && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{syncError}</div>
          )}
          {syncResult && (
            <div className="rounded-lg border border-teal/40 bg-teal/10 p-3 text-sm text-teal">
              <div>{syncResult.message}</div>
              {syncResult.anomalies.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium text-yellow-300">Data anomalies (auto-resolved, worth a sanity check):</div>
                  <ul className="mt-1 list-inside list-disc text-xs text-yellow-300/90">
                    {syncResult.anomalies.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {syncResult.unmatchedPlayers.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium text-yellow-300">Unmatched players:</div>
                  <ul className="mt-1 list-inside list-disc text-xs text-yellow-300/90">
                    {syncResult.unmatchedPlayers.map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeading
          title="Sync Schedule & Game Stats"
          subtitle="Runs automatically in the background. Use this button to force an immediate refresh instead of waiting for the next check."
        />
        <Card className="flex flex-col gap-4">
          <button
            onClick={handleSyncSchedule}
            disabled={syncingSchedule}
            className="w-fit rounded-md bg-owl-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-owl-red/90 disabled:opacity-50"
          >
            {syncingSchedule ? "Syncing…" : "Sync now"}
          </button>
          {syncScheduleError && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{syncScheduleError}</div>
          )}
          {syncScheduleResult && (
            <div className="rounded-lg border border-teal/40 bg-teal/10 p-3 text-sm text-teal">
              <div>{syncScheduleResult.message}</div>
              {syncScheduleResult.anomalies.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium text-yellow-300">Data anomalies (auto-resolved, worth a sanity check):</div>
                  <ul className="mt-1 list-inside list-disc text-xs text-yellow-300/90">
                    {syncScheduleResult.anomalies.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {syncScheduleResult.unmatchedPlayers.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium text-yellow-300">Unmatched players:</div>
                  <ul className="mt-1 list-inside list-disc text-xs text-yellow-300/90">
                    {syncScheduleResult.unmatchedPlayers.map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      </section>

      <AccountsPanel />
    </div>
  );
}
