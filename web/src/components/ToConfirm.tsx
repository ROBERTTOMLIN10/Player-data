import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CARE_QUERY_KEYS, careApi, useToConfirm } from "../api/client";
import { kindLabel, timeLabel } from "../lib/care";
import { formatDate } from "../lib/format";
import { Card } from "./Card";

/**
 * For the AT: players who said "I came in" and pre-hab players logged, waiting on
 * the AT to confirm it happened (it only counts in the treatment log once confirmed).
 * Hidden when there's nothing to confirm.
 */
export function ToConfirm() {
  const { data } = useToConfirm(true);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  if (!data || data.visits.length + data.prehab.length === 0) return null;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await Promise.all([...CARE_QUERY_KEYS, "myCare"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } finally {
      setBusy(null);
    }
  };
  const buttons = (key: string, confirm: () => Promise<unknown>, reject: () => Promise<unknown>) => (
    <span className="ml-auto flex shrink-0 gap-1.5">
      <button disabled={busy === key} onClick={() => run(key, confirm)} className="rounded-md bg-teal px-2.5 py-1 text-xs font-semibold text-ink hover:opacity-90 disabled:opacity-50">
        Confirm
      </button>
      <button disabled={busy === key} onClick={() => run(key, reject)} className="rounded-md border border-border px-2.5 py-1 text-xs text-text-dim hover:text-text disabled:opacity-50">
        Didn&rsquo;t happen
      </button>
    </span>
  );

  return (
    <Card className="p-0">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-display text-base font-semibold">To confirm · {data.visits.length + data.prehab.length}</h2>
        <p className="text-xs text-text-dim">Players&rsquo; &ldquo;I came in&rdquo; and pre-hab. It goes in their treatment log once you confirm it.</p>
      </div>
      <ul className="divide-y divide-border/60">
        {data.visits.map((t) => (
          <li key={`v${t.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-sm">
            <span className="font-medium">{t.player_name}</span>
            <span className="text-text-dim">
              came in · {kindLabel(t.kind)} {t.treat_date === data.today ? "" : `${formatDate(t.treat_date)} `}
              {timeLabel(t.treat_time)}
              {t.injury ? ` · ${t.injury}` : ""}
            </span>
            {buttons(`v${t.id}`, () => careApi.confirmVisit(t.id, true), () => careApi.confirmVisit(t.id, false))}
          </li>
        ))}
        {data.prehab.map((p) => (
          <li key={`p${p.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-sm">
            <span className="font-medium">{p.player_name}</span>
            <span className="text-text-dim">
              pre-hab {p.log_date === data.today ? "today" : formatDate(p.log_date)} · {p.activities}
              {p.minutes ? ` · ${p.minutes} min` : ""}
              {p.injury ? ` · ${p.injury}` : ""}
            </span>
            {buttons(`p${p.id}`, () => careApi.confirmPrehab(p.id, true), () => careApi.confirmPrehab(p.id, false))}
          </li>
        ))}
      </ul>
    </Card>
  );
}
