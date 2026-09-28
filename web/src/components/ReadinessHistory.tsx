import { useMemo, useState } from "react";
import { Card } from "./Card";
import { ReadinessSummary } from "./ReadinessSummary";
import { TrendChart } from "./TrendChart";
import { useOpponentLogos, useOpponentNames } from "./DateLogoTick";
import { regionLabel, SEVERITY_STYLE } from "../lib/bodyRegions";
import { formatDate, formatDateLong } from "../lib/format";
import { scoreBand, STATUS_STYLE } from "../lib/readiness";
import type { MetricDef, PlayerReadinessHistory } from "../types";

// No unit so axis ticks stay compact ("80", not "80 %"); the chart title says it's a percentage.
const SCORE_METRIC: MetricDef = { key: "readiness_score", label: "Readiness %", unit: "", decimals: 0 };

function shiftIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Trend chart + day-by-day list of check-ins (newest first). */
export function ReadinessHistory({ history, emptyText, days }: { history: PlayerReadinessHistory; emptyText: string; days?: number }) {
  const [openId, setOpenId] = useState<number | null>(null);
  // Game days get the opponent's logo on the axis and in the tooltip.
  const logoFor = useOpponentLogos();
  const opponentFor = useOpponentNames();
  const entries = history.entries;

  // Every day in the range gets a spot on the chart (blank when there was no
  // check-in), so game days always appear even if the player skipped that day.
  const chartData = useMemo(() => {
    const byDate = new Map(entries.map((e) => [e.entry_date, e.readiness_score]));
    const oldest = entries.length ? entries[entries.length - 1].entry_date : history.today;
    const start = days ? shiftIso(history.today, -(days - 1)) : oldest;
    const out: { entry_date: string; readiness_score: number | null }[] = [];
    for (let d = start; d <= history.today; d = shiftIso(d, 1)) {
      out.push({ entry_date: d, readiness_score: byDate.get(d) ?? null });
    }
    // Skip an empty lead-in (e.g. the summer before preseason on the 90-day view).
    const first = out.findIndex((p) => p.readiness_score !== null || opponentFor(p.entry_date));
    return first > 0 ? out.slice(first) : out;
  }, [entries, history.today, days, opponentFor]);
  // Label the first and last day plus every game day (so game logos always show); normal labels when there were no games.
  // Long ranges get too crowded for logos, so they use plain date labels (game days are still named in the tooltip).
  const crowded = chartData.length > 45;
  const gameDays = chartData.filter((d) => opponentFor(d.entry_date)).map((d) => d.entry_date);
  const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
  const farFromGames = (d: string) => gameDays.every((g) => daysApart(d, g) > 2); // keep labels from overlapping
  const gameDayTicks = gameDays.length && !crowded
    ? [chartData[0].entry_date, chartData[chartData.length - 1].entry_date]
        .filter(farFromGames)
        .concat(gameDays)
        .sort()
    : undefined;
  const stats = useMemo(() => {
    const avg = entries.length ? Math.round(entries.reduce((a, e) => a + e.readiness_score, 0) / entries.length) : null;
    const regionTally = new Map<string, number>();
    for (const e of entries) for (const s of e.soreness) regionTally.set(s.region, (regionTally.get(s.region) ?? 0) + 1);
    const topRegion = [...regionTally.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    return { avg, topRegion };
  }, [entries]);

  if (entries.length === 0) return <Card className="text-sm text-text-dim">{emptyText}</Card>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Check-ins" value={String(entries.length)} />
        <Stat label="Avg readiness" value={stats.avg === null ? "—" : `${stats.avg}%`} />
        <Stat
          label="Most sore"
          value={stats.topRegion ? regionLabel(stats.topRegion[0]) : "—"}
          sub={stats.topRegion ? `${stats.topRegion[1]} day${stats.topRegion[1] === 1 ? "" : "s"}` : undefined}
        />
      </div>

      {entries.length > 1 && (
        <Card>
          <TrendChart
            data={chartData}
            xKey="entry_date"
            xFormatter={formatDate}
            metric={SCORE_METRIC}
            series={[{ dataKey: "readiness_score", name: "Readiness", color: "#2dd4bf" }]}
            referenceValue={75}
            referenceLabel="Good"
            height={240}
            logoFor={crowded ? undefined : logoFor}
            ticks={gameDayTicks}
            labelFor={(d) => (opponentFor(d) ? `${formatDate(d)} · Game day vs ${opponentFor(d)}` : formatDate(d))}
          />
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {entries.map((e) => {
          const band = e.status && e.status !== "missing" ? e.status : scoreBand(e.readiness_score);
          const open = openId === e.id;
          return (
            <div key={e.id} className="rounded-xl border border-border bg-surface">
              <button
                onClick={() => setOpenId(open ? null : e.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                aria-expanded={open}
              >
                <span className={`rounded-md border px-2 py-0.5 font-display text-sm font-semibold ${STATUS_STYLE[band].pill}`}>
                  {e.readiness_score}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {formatDateLong(e.entry_date)}
                    {e.is_game_day === 1 && (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-owl-red-light">Game day</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {e.soreness.length === 0 && <span className="text-xs text-text-dim">No soreness</span>}
                    {e.soreness.map((s) => (
                      <span key={s.region} className={`rounded-full border px-1.5 py-px text-[11px] ${SEVERITY_STYLE[s.severity].chip}`}>
                        {regionLabel(s.region)}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-text-dim">{open ? "−" : "+"}</span>
              </button>
              {open && (
                <div className="border-t border-border p-2">
                  <ReadinessSummary entry={e} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-3 sm:p-3">
      <div className="text-[11px] uppercase tracking-wide text-text-dim">{label}</div>
      <div className="mt-0.5 font-display text-base font-semibold leading-tight sm:text-lg">{value}</div>
      {sub && <div className="text-xs text-text-dim">{sub}</div>}
    </Card>
  );
}

const RANGES = [14, 30, 90];

export function RangePicker({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div className="mb-3 flex gap-1 rounded-lg border border-border bg-surface p-1">
      {RANGES.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`rounded-md px-3 py-1 text-xs font-medium ${d === days ? "bg-owl-red text-white" : "text-text-dim hover:text-text"}`}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}
