import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { saveCareAlerts, useCareAlerts } from "../api/client";
import type { CareAlertPrefs, CareAlertsResponse } from "../types";
import { PushSwitch } from "./Favorites";

const KINDS: { key: "severe" | "moderate" | "low_readiness"; label: string }[] = [
  { key: "severe", label: "Severe soreness" },
  { key: "moderate", label: "Moderate soreness" },
  { key: "low_readiness", label: "Low readiness" },
];

/**
 * Which morning check-ins reach this staff member's phone: a player flagging severe
 * or moderate soreness, or readiness at or below a chosen %. The alert opens that
 * player's care panel. On for athletic trainers by default; coaches can opt in.
 */
export function CheckinAlerts() {
  const { data } = useCareAlerts();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!data) return null;
  const prefs = data.prefs;
  const anyOn = Boolean(prefs && (prefs.severe || prefs.moderate || prefs.low_readiness));

  const change = async (c: Partial<CareAlertPrefs>) => {
    if (!prefs) return;
    setError(null);
    qc.setQueryData<CareAlertsResponse>(["careAlerts"], { ...data, prefs: { ...prefs, ...c } });
    try {
      qc.setQueryData(["careAlerts"], await saveCareAlerts(c));
    } catch (e) {
      setError((e as Error).message);
      void qc.invalidateQueries({ queryKey: ["careAlerts"] });
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${anyOn ? "border-teal/40 text-teal" : "border-border text-text-dim hover:text-text"}`}
      >
        {anyOn ? "🔔 Check-in alerts on" : "🔕 Check-in alerts"}
      </button>
      {open && (
        <div className="fixed left-4 right-4 z-30 mt-2 rounded-xl sm:absolute sm:left-auto sm:right-0 sm:w-80 border border-border bg-surface p-4 shadow-xl">
          <div className="font-display text-sm font-semibold">Check-in alerts</div>
          <p className="mt-1 text-xs text-text-dim">
            Get a phone notification when a player&rsquo;s morning check-in flags something. Tap it to open their care panel and book them in.
          </p>
          {!data.signedIn || !prefs ? (
            <p className="mt-3 text-xs text-text-dim">Sign in with your own account to choose alerts.</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {KINDS.map((k) => {
                  const on = prefs[k.key];
                  return (
                    <button
                      key={k.key}
                      onClick={() => void change({ [k.key]: !on })}
                      aria-pressed={on}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        on ? "border-owl-red/50 bg-owl-red/15 text-owl-red-light" : "border-border text-text-dim hover:text-text"
                      }`}
                    >
                      {k.label}
                    </button>
                  );
                })}
              </div>
              {prefs.low_readiness && (
                <label className="mt-3 flex items-center gap-2 text-xs text-text-dim">
                  Low readiness means
                  <select
                    value={prefs.readiness_below}
                    onChange={(e) => void change({ readiness_below: Number(e.target.value) })}
                    className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-text outline-none focus:border-owl-red"
                  >
                    {data.thresholds.map((t) => (
                      <option key={t} value={t}>
                        {t}% or lower
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="mt-4 flex justify-end">
                <PushSwitch publicKey={data.publicKey} />
              </div>
            </>
          )}
          {error && <p className="mt-2 text-xs text-owl-red-light">{error}</p>}
        </div>
      )}
    </div>
  );
}
