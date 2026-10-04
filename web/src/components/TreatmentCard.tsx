import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { markTreatmentAttended, useMyCare } from "../api/client";
import { timeLabel } from "../lib/care";
import { formatDate } from "../lib/format";

/** On the player's check-in screen: treatment the athletic trainer booked, with "I came in". */
export function TreatmentCard() {
  const { data } = useMyCare();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<number | null>(null);
  const list = data?.treatments ?? [];
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {list.map((t) => {
        const today = t.treat_date === data!.today;
        const when = [today ? "Today" : formatDate(t.treat_date), timeLabel(t.treat_time)].filter(Boolean).join(" · ");
        return (
          <div key={t.id} className={`rounded-xl border p-4 ${t.status === "attended" ? "border-teal/40 bg-teal/5" : "border-sky-400/40 bg-sky-400/5"}`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg" aria-hidden>
                ✚
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-sky-300">Treatment · {when}</div>
                <div className="mt-0.5 font-medium">{t.treat_time ? `Come in at ${timeLabel(t.treat_time)}` : "See the athletic trainer"}</div>
                {t.instructions && <p className="mt-1 text-sm text-text-dim">{t.instructions}</p>}
              </div>
            </div>
            <div className="mt-3">
              {t.status === "attended" ? (
                <span className="text-sm font-medium text-teal">✓ You came in</span>
              ) : today ? (
                <button
                  disabled={busy === t.id}
                  onClick={async () => {
                    setBusy(t.id);
                    try {
                      await markTreatmentAttended(t.id);
                      await qc.invalidateQueries({ queryKey: ["myCare"] });
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
                >
                  {busy === t.id ? "Saving…" : "I came in"}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
