import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MINUTES_METRIC } from "./SeasonStats";
import { formatMetricValue } from "../lib/format";
import type { GpsSession, MetricDef } from "../types";

/**
 * Coaches' game breakdown chart: every player's number for one game on the
 * chosen stat (minutes or any GPS stat), highest first, with the team average.
 * Hover for the name; tap a bar to open that player's season view.
 * Tracker glitches are left out; minutes only count players who got on.
 */
export function GameSquadChart({
  sessions,
  metrics,
  teamAverages,
  onSelectPlayer,
}: {
  sessions: GpsSession[];
  metrics: MetricDef[];
  teamAverages: Record<string, number | null>;
  onSelectPlayer: (playerId: number) => void;
}) {
  const all = useMemo(() => [MINUTES_METRIC, ...metrics], [metrics]);
  const [key, setKey] = useState("load");
  const metric = all.find((m) => m.key === key) ?? all[1] ?? all[0];
  const minutes = metric.key === "minutes";

  const rows = useMemo(
    () =>
      sessions
        .filter((s) => (minutes ? (s.minutes_played ?? 0) > 0 : s.flag?.kind !== "glitch"))
        .map((s) => ({
          player_id: s.player_id,
          name: s.player_name ?? "Player",
          value: minutes ? s.minutes_played : ((s as unknown as Record<string, number | null>)[metric.key] ?? null),
          played: Boolean(s.played),
        }))
        .filter((r): r is typeof r & { value: number } => r.value !== null && r.value !== undefined)
        .sort((a, b) => b.value - a.value),
    [sessions, metric.key, minutes],
  );
  const teamAvg = minutes
    ? rows.length
      ? rows.reduce((a, r) => a + r.value, 0) / rows.length
      : null
    : teamAverages[`avg_${metric.key}`];
  const top = rows[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Stat to chart">
        {all.map((m) => (
          <button
            key={m.key}
            role="tab"
            aria-selected={m.key === metric.key}
            onClick={() => setKey(m.key)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              m.key === metric.key ? "border-owl-red bg-owl-red text-white" : "border-border text-text-dim hover:border-text-dim hover:text-text"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-text-dim">
          Team avg: <span className="font-semibold text-text">{formatMetricValue(teamAvg ?? null, metric)}</span>
        </span>
        {top && (
          <span className="text-text-dim">
            Top: <span className="text-text">{top.name}</span> {formatMetricValue(top.value, metric)}
          </span>
        )}
        <span className="text-text-dim">{rows.length} players</span>
        <span className="ml-auto text-xs text-text-dim">Tap a bar to open that player</span>
      </div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="name" tick={false} axisLine={{ stroke: "#2a2e37" }} tickLine={false} />
            <YAxis
              stroke="#9aa0ab"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v) => formatMetricValue(v, { ...metric, decimals: 0, unit: "" })}
            />
            {teamAvg !== null && teamAvg !== undefined && <ReferenceLine y={teamAvg} stroke="#9aa0ab" strokeDasharray="4 4" />}
            <Tooltip
              cursor={{ fill: "#ffffff10" }}
              contentStyle={{ background: "#1c1f26", border: "1px solid #2a2e37", borderRadius: 8, fontSize: 13 }}
              labelStyle={{ color: "#e9eaee", fontWeight: 600 }}
              itemStyle={{ color: "#e9eaee" }}
              formatter={(value: number) => [formatMetricValue(value, metric), metric.label]}
            />
            <Bar
              dataKey="value"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
              className="cursor-pointer"
              onClick={(d: unknown) => onSelectPlayer((d as { payload: { player_id: number } }).payload.player_id)}
            >
              {rows.map((r) => (
                <Cell key={r.player_id} fill="#ff3f5e" fillOpacity={minutes || r.played ? 1 : 0.35} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {!minutes && (
        <div className="flex gap-4 text-xs text-text-dim">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-owl-red-light" /> Played
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-owl-red-light opacity-35" /> Fitness only
          </span>
        </div>
      )}
    </div>
  );
}
