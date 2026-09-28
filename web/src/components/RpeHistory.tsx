import { useMemo } from "react";
import { Card } from "./Card";
import { TrendChart } from "./TrendChart";
import { formatDate, formatDateLong } from "../lib/format";
import { formatRpe, rpeBand, rpeLabel, RPE_STYLE } from "../lib/rpe";
import type { MetricDef, PlayerRpe, RpeScore } from "../types";

const RPE_METRIC: MetricDef = { key: "rpe", label: "RPE", unit: "", decimals: 0 };

/** "Sep 26" or "Sep 26 · Session 2" (pre-season double days). */
export const sessionLabel = (s: Pick<RpeScore, "session_date" | "session">, long = false) =>
  `${long ? formatDateLong(s.session_date) : formatDate(s.session_date)}${s.session === 2 ? " · Session 2" : ""}`;

export function RpePill({ rpe, withLabel = false }: { rpe: number; withLabel?: boolean }) {
  const style = RPE_STYLE[rpeBand(rpe)];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-sm font-semibold ${style.pill}`}>
      {rpe}
      {withLabel && <span className="text-xs font-normal">{rpeLabel(rpe)}</span>}
    </span>
  );
}

function Tile({ label, value, sub, rpe }: { label: string; value: string; sub?: string; rpe?: number | null }) {
  return (
    <Card className="flex flex-col p-3">
      <span className="text-xs font-medium uppercase tracking-wide text-text-dim">{label}</span>
      <span className="mt-1 font-display text-2xl font-semibold" style={rpe ? { color: RPE_STYLE[rpeBand(Math.round(rpe))].hex } : undefined}>
        {value}
      </span>
      {sub && <span className="text-xs text-text-dim">{sub}</span>}
    </Card>
  );
}

/**
 * A player's post-training RPE: their latest score, 7-day and Last Month
 * averages, a chart over the chosen range, and every session listed.
 * Shared by the player's Readiness → RPE view and the coach player page.
 */
export function RpeHistory({ data, emptyText }: { data: PlayerRpe; emptyText: string }) {
  const { latest, averages, entries } = data;
  const chartData = useMemo(
    () =>
      [...entries]
        .reverse()
        .map((e) => ({ key: `${e.session_date}#${e.session}`, rpe: e.rpe, session_date: e.session_date, session: e.session })),
    [entries],
  );
  const keyLabel = (key: string) => {
    const [session_date, session] = key.split("#");
    return sessionLabel({ session_date, session: Number(session) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile
          label="Last session"
          value={latest ? String(latest.rpe) : "—"}
          sub={latest ? `${rpeLabel(latest.rpe)} · ${sessionLabel(latest)}` : "No score yet"}
          rpe={latest?.rpe}
        />
        <Tile
          label="7-day"
          value={formatRpe(averages.week)}
          sub={`${averages.weekSessions} session${averages.weekSessions === 1 ? "" : "s"}`}
          rpe={averages.week}
        />
        <Tile
          label="Last Month"
          value={formatRpe(averages.month)}
          sub={`${averages.monthSessions} session${averages.monthSessions === 1 ? "" : "s"}`}
          rpe={averages.month}
        />
      </div>

      {entries.length === 0 ? (
        <Card className="text-sm text-text-dim">{emptyText}</Card>
      ) : (
        <>
          {entries.length > 1 && (
            <Card>
              <TrendChart
                data={chartData}
                xKey="key"
                xFormatter={keyLabel}
                metric={RPE_METRIC}
                series={[{ dataKey: "rpe", name: "RPE", color: "#fb923c" }]}
                referenceValue={averages.month ?? undefined}
                referenceLabel="Month avg"
                height={220}
                yDomain={[0, 10]}
                labelFor={(k) => {
                  const point = chartData.find((p) => p.key === k);
                  return point ? `${keyLabel(k)} · ${rpeLabel(point.rpe)}` : keyLabel(k);
                }}
              />
            </Card>
          )}
          <Card className="p-0">
            <ul className="divide-y divide-border/60">
              {entries.map((e) => (
                <li key={`${e.session_date}#${e.session}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-text-dim">{sessionLabel(e, true)}</span>
                  <RpePill rpe={e.rpe} withLabel />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
