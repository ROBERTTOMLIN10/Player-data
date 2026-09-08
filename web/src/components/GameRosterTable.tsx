import { useMemo, useState } from "react";
import type { GpsSession, MetricDef } from "../types";
import { formatMetricValue } from "../lib/format";
import { Card } from "./Card";

const DEFAULT_COLUMNS = ["load", "distance_mi", "top_speed_mph", "sprints_count", "sprints_distance_yd"];

export function GameRosterTable({
  sessions,
  metrics,
  onSelectPlayer,
  columns = DEFAULT_COLUMNS,
}: {
  sessions: GpsSession[];
  metrics: MetricDef[];
  onSelectPlayer: (playerId: number) => void;
  columns?: string[];
}) {
  const [sortKey, setSortKey] = useState<string>("load");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const visibleMetrics = columns
    .map((key) => metrics.find((m) => m.key === key))
    .filter((m): m is MetricDef => Boolean(m));

  const sorted = useMemo(() => {
    const copy = [...sessions];
    copy.sort((a, b) => {
      const av = (a as any)[sortKey] ?? -Infinity;
      const bv = (b as any)[sortKey] ?? -Infinity;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [sessions, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
            <th className="px-4 py-3 font-medium">Player</th>
            <th
              onClick={() => toggleSort("minutes_played")}
              className="cursor-pointer select-none whitespace-nowrap px-4 py-3 font-medium hover:text-text"
            >
              Min
              {sortKey === "minutes_played" && <span className="ml-1 text-owl-red">{sortDir === "asc" ? "↑" : "↓"}</span>}
            </th>
            {visibleMetrics.map((m) => (
              <th
                key={m.key}
                onClick={() => toggleSort(m.key)}
                className="cursor-pointer select-none whitespace-nowrap px-4 py-3 font-medium hover:text-text"
              >
                {m.label}
                {sortKey === m.key && <span className="ml-1 text-owl-red">{sortDir === "asc" ? "↑" : "↓"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr
              key={s.id}
              className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised"
              onClick={() => onSelectPlayer(s.player_id)}
            >
              <td className="whitespace-nowrap px-4 py-3 font-medium text-text hover:text-owl-red">
                {s.player_name}
                {s.started === 1 && <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-teal">GS</span>}
              </td>
              <td className="px-4 py-3 text-text-dim">
                {s.minutes_played != null ? `${s.minutes_played}'` : "—"}
              </td>
              {visibleMetrics.map((m) => (
                <td key={m.key} className="px-4 py-3 text-text-dim">
                  {formatMetricValue((s as any)[m.key], m)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
