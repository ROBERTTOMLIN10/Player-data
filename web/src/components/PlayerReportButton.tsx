import { useState } from "react";
import { fetchPlayerReport } from "../api/client";
import { saveFile } from "../lib/download";
import { playerReportPdf, reportFilename } from "../lib/playerPdf";

const input = "rounded-md border border-border bg-surface-raised px-2 py-1 text-sm text-text outline-none focus:border-owl-red";

/** Aug 1 of the season the day falls in (the season runs Aug–Dec). */
function seasonStart(today: string) {
  const [y, m] = today.split("-").map(Number);
  return `${m >= 7 ? y : y - 1}-08-01`;
}
const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

/**
 * "Download PDF": the player's season report (profile, match stats, physical
 * profile vs the team, game log, every game's GPS numbers) for a date range,
 * to send to coaches or agents. Coaches pass the player; players get their own.
 */
export function PlayerReportButton({ playerId }: { playerId?: number }) {
  const today = todayIso();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(seasonStart(today));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const report = await fetchPlayerReport(playerId ? { playerId } : "me", from, to);
      await saveFile(reportFilename(report), await playerReportPdf(report, { imageProxy: playerId ? "/api/players/report-image" : "/api/me/report-image" }));
      setOpen(false);
    } catch (e) {
      setError((e as Error).message || "Couldn't build the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-raised"
      >
        Download PDF
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 flex w-[min(19rem,calc(100vw-2rem))] flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-xl">
          <div>
            <div className="font-display text-sm font-semibold">Player report (PDF)</div>
            <p className="mt-0.5 text-xs text-text-dim">Match stats, physical profile vs the team, and every game&rsquo;s numbers. Ready to send to coaches or agents.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => {
                setFrom(seasonStart(today));
                setTo(today);
              }}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs text-text-dim hover:text-text"
            >
              This season
            </button>
            <button
              onClick={() => {
                const d = new Date(`${today}T12:00:00Z`);
                d.setUTCDate(d.getUTCDate() - 30);
                setFrom(d.toISOString().slice(0, 10));
                setTo(today);
              }}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs text-text-dim hover:text-text"
            >
              Last 30 days
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-dim">
            <label className="flex flex-col gap-1">
              From
              <input type="date" className={input} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              To
              <input type="date" className={input} value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <button
            onClick={download}
            disabled={busy || !from || !to || from > to}
            className="rounded-md bg-owl-red px-3 py-1.5 text-sm font-semibold text-white hover:bg-owl-red-light disabled:opacity-50"
          >
            {busy ? "Building PDF…" : "Download"}
          </button>
          {error && <p className="text-xs text-owl-red-light">{error}</p>}
        </div>
      )}
    </div>
  );
}
