import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompare, useMetrics, usePlayers, useSchedule } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { TrendChart } from "../components/TrendChart";
import { colorForIndex } from "../lib/colors";
import { formatDate, formatMetricValue } from "../lib/format";
import { POSITION_GROUP_ORDER, positionGroup } from "../lib/positions";
import type { Player } from "../types";

export default function CompareView() {
  const { data: players } = usePlayers();
  const { data: metrics } = useMetrics();
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [selectedMetricKey, setSelectedMetricKey] = useState("load");
  const [showTeamAvg, setShowTeamAvg] = useState(true);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const { data: schedule } = useSchedule();

  const { data: compareData } = useCompare(selectedPlayerIds);
  const selectedMetric = metrics?.find((m) => m.key === selectedMetricKey);

  function togglePlayer(id: number) {
    setSelectedPlayerIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  /** Select (or clear, if all are already selected) a set of players. */
  function toggleMany(ids: number[]) {
    setSelectedPlayerIds((prev) => {
      const allOn = ids.every((id) => prev.includes(id));
      return allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])];
    });
  }

  // Opponent (and logo, from the schedule) per game date, for the chart's tooltip and axis.
  const opponentByDate = useMemo(() => {
    const map = new Map<string, { opponent: string | null; logo: string | null }>();
    for (const s of compareData?.sessions ?? []) map.set(s.game_date!, { opponent: s.opponent ?? null, logo: null });
    for (const g of schedule ?? []) {
      const known = map.get(g.game_date);
      if (known) map.set(g.game_date, { opponent: known.opponent ?? g.opponent, logo: g.opponent_logo_url });
    }
    return map;
  }, [compareData, schedule]);

  const gamesById = useMemo(() => {
    const map = new Map<number, { game_date: string; opponent: string | null; [k: string]: unknown }>();
    for (const s of compareData?.sessions ?? []) {
      const existing = map.get(s.game_id) ?? { game_date: s.game_date!, opponent: s.opponent ?? null };
      // Tracker glitches (impossible readings) don't draw on the chart.
      existing[`p_${s.player_id}`] = s.flag?.kind === "glitch" ? null : (s as any)[selectedMetricKey];
      map.set(s.game_id, existing);
    }
    return map;
  }, [compareData, selectedMetricKey]);

  const chartData = useMemo(() => [...gamesById.values()].sort((a, b) => a.game_date.localeCompare(b.game_date)), [gamesById]);

  const selectedPlayers = players?.filter((p) => selectedPlayerIds.includes(p.id)) ?? [];

  const groupedPlayers = useMemo(() => {
    const groups = new Map<string, Player[]>();
    for (const g of POSITION_GROUP_ORDER) groups.set(g, []);
    for (const p of players ?? []) {
      groups.get(positionGroup(p.position))!.push(p);
    }
    return groups;
  }, [players]);

  const barData = useMemo(() => {
    const order = new Map(selectedPlayers.map((p, i) => [p.canonical_name, i]));
    const rows = (compareData?.seasonAverages ?? []).map((row) => ({
      name: row.player_name,
      value: (row as any)[`avg_${selectedMetricKey}`] ?? 0,
      color: colorForIndex(order.get(row.player_name) ?? 0),
    }));
    if (showTeamAvg && compareData?.teamAverages) {
      rows.push({ name: "Team Avg", value: (compareData.teamAverages as any)[`avg_${selectedMetricKey}`] ?? 0, color: "#9aa0ab" });
    }
    return rows.sort((a, b) => b.value - a.value);
  }, [compareData, selectedMetricKey, showTeamAvg, selectedPlayers]);
  const horizontal = barData.length > 7; // many players: names down the side

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <SectionHeading title="Compare Players" subtitle="Pick players (or everyone) and a metric to overlay" />
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setSelectedPlayerIds((players ?? []).map((p) => p.id))}
              className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-text hover:border-owl-red"
            >
              Select all
            </button>
            <button
              onClick={() => setSelectedPlayerIds([])}
              disabled={selectedPlayerIds.length === 0}
              className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-dim hover:border-text-dim disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {POSITION_GROUP_ORDER.filter((g) => (groupedPlayers.get(g)?.length ?? 0) > 0).map((group) => (
            <div key={group}>
              <div className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-dim">
                {group}
                <button
                  onClick={() => toggleMany(groupedPlayers.get(group)!.map((p) => p.id))}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-text-dim hover:border-owl-red hover:text-text"
                >
                  {groupedPlayers.get(group)!.every((p) => selectedPlayerIds.includes(p.id)) ? "None" : "All"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {groupedPlayers.get(group)!.map((p) => {
                  const active = selectedPlayerIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePlayer(p.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        active
                          ? "border-owl-red bg-owl-red/15 text-text"
                          : "border-border bg-surface-raised text-text-dim hover:border-text-dim"
                      }`}
                    >
                      {p.canonical_name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {selectedPlayerIds.length === 0 ? (
        <Card className="text-center text-text-dim">Pick at least one player above to see comparisons.</Card>
      ) : (
        <>
          <section>
            <SectionHeading title="Metric" />
            <div className="flex flex-wrap gap-2">
              {metrics?.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setSelectedMetricKey(m.key)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    m.key === selectedMetricKey
                      ? "border-owl-red bg-owl-red/15 text-text"
                      : "border-border bg-surface-raised text-text-dim hover:border-text-dim"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <SectionHeading
              title={`${selectedMetric?.label ?? ""} Over Time`}
              subtitle="Hover a dot for every player's value that game (highest first). Hover a name below to highlight their line."
            />
            <Card className="flex flex-col gap-3">
              <TrendChart
                data={chartData}
                xKey="game_date"
                xFormatter={formatDate}
                labelFor={(d) => `${formatDate(d)} · ${opponentByDate.get(d)?.opponent ?? "Game"}`}
                logoFor={(d) => opponentByDate.get(d)?.logo}
                metric={selectedMetric}
                series={selectedPlayers.map((p, i) => ({
                  dataKey: `p_${p.id}`,
                  name: p.canonical_name,
                  color: colorForIndex(i),
                  faded: highlightId !== null && highlightId !== p.id,
                }))}
                referenceValue={showTeamAvg ? (compareData?.teamAverages as any)?.[`avg_${selectedMetricKey}`] : undefined}
                referenceLabel="Team avg"
              />
              <div className="flex flex-wrap gap-x-3 gap-y-1.5" onMouseLeave={() => setHighlightId(null)}>
                {selectedPlayers.map((p, i) => (
                  <button
                    key={p.id}
                    onMouseEnter={() => setHighlightId(p.id)}
                    onFocus={() => setHighlightId(p.id)}
                    onClick={() => setHighlightId((h) => (h === p.id ? null : p.id))}
                    className={`flex items-center gap-1.5 text-xs transition-opacity ${
                      highlightId !== null && highlightId !== p.id ? "opacity-40" : ""
                    }`}
                  >
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorForIndex(i) }} />
                    <span className="text-text">{p.canonical_name}</span>
                  </button>
                ))}
              </div>
            </Card>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <SectionHeading title="Season Average Comparison" />
              <label className="flex items-center gap-2 text-sm text-text-dim">
                <input
                  type="checkbox"
                  checked={showTeamAvg}
                  onChange={(e) => setShowTeamAvg(e.target.checked)}
                  className="accent-owl-red"
                />
                Show team average
              </label>
            </div>
            <Card>
              <ResponsiveContainer width="100%" height={horizontal ? Math.max(260, barData.length * 26 + 20) : 260}>
                <BarChart
                  data={barData}
                  layout={horizontal ? "vertical" : "horizontal"}
                  margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 8 : 0 }}
                >
                  <CartesianGrid stroke="#2a2e37" strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />
                  {horizontal ? (
                    <>
                      <YAxis type="category" dataKey="name" stroke="#9aa0ab" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={150} interval={0} />
                      <XAxis
                        type="number"
                        stroke="#9aa0ab"
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={{ stroke: "#2a2e37" }}
                        tickFormatter={(v) => formatMetricValue(v, selectedMetric ? { ...selectedMetric, decimals: 0, unit: "" } : undefined)}
                      />
                    </>
                  ) : (
                    <>
                      <XAxis dataKey="name" stroke="#9aa0ab" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#2a2e37" }} />
                      <YAxis
                        stroke="#9aa0ab"
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        tickFormatter={(v) => formatMetricValue(v, selectedMetric ? { ...selectedMetric, decimals: 0 } : undefined)}
                      />
                    </>
                  )}
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={{ background: "#1c1f26", border: "1px solid #2a2e37", borderRadius: 8, fontSize: 13 }}
                    formatter={(value: number) => [formatMetricValue(value, selectedMetric), selectedMetric?.label ?? ""]}
                  />
                  <Bar dataKey="value" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 18 : 48} isAnimationActive={false}>
                    {barData.map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
