import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompare, useMetrics, usePlayers } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { TrendChart } from "../components/TrendChart";
import { colorForIndex } from "../lib/colors";
import { formatDate, formatMetricValue } from "../lib/format";

export default function CompareView() {
  const { data: players } = usePlayers();
  const { data: metrics } = useMetrics();
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [selectedMetricKey, setSelectedMetricKey] = useState("load");
  const [showTeamAvg, setShowTeamAvg] = useState(true);

  const { data: compareData } = useCompare(selectedPlayerIds);
  const selectedMetric = metrics?.find((m) => m.key === selectedMetricKey);

  function togglePlayer(id: number) {
    setSelectedPlayerIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  const gamesById = useMemo(() => {
    const map = new Map<number, { game_date: string; opponent: string | null; [k: string]: unknown }>();
    for (const s of compareData?.sessions ?? []) {
      const existing = map.get(s.game_id) ?? { game_date: s.game_date!, opponent: s.opponent ?? null };
      existing[`p_${s.player_id}`] = (s as any)[selectedMetricKey];
      map.set(s.game_id, existing);
    }
    return map;
  }, [compareData, selectedMetricKey]);

  const chartData = useMemo(() => [...gamesById.values()].sort((a, b) => a.game_date.localeCompare(b.game_date)), [gamesById]);

  const selectedPlayers = players?.filter((p) => selectedPlayerIds.includes(p.id)) ?? [];

  const barData = useMemo(() => {
    const rows = (compareData?.seasonAverages ?? []).map((row) => ({
      name: row.player_name,
      value: (row as any)[`avg_${selectedMetricKey}`] ?? 0,
    }));
    if (showTeamAvg && compareData?.teamAverages) {
      rows.push({ name: "Team Avg", value: (compareData.teamAverages as any)[`avg_${selectedMetricKey}`] ?? 0 });
    }
    return rows;
  }, [compareData, selectedMetricKey, showTeamAvg]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeading title="Compare Players" subtitle="Select up to 5 players and a metric to overlay" />
        <div className="flex flex-wrap gap-2">
          {players?.map((p) => {
            const active = selectedPlayerIds.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => togglePlayer(p.id)}
                disabled={!active && selectedPlayerIds.length >= 5}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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
            <SectionHeading title={`${selectedMetric?.label ?? ""} Over Time`} subtitle="Hover for exact values per game" />
            <Card>
              <TrendChart
                data={chartData}
                xKey="game_date"
                xFormatter={formatDate}
                metric={selectedMetric}
                series={selectedPlayers.map((p, i) => ({
                  dataKey: `p_${p.id}`,
                  name: p.canonical_name,
                  color: colorForIndex(i),
                }))}
                referenceValue={showTeamAvg ? (compareData?.teamAverages as any)?.[`avg_${selectedMetricKey}`] : undefined}
                referenceLabel="Team avg"
              />
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
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#2a2e37" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" stroke="#9aa0ab" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#2a2e37" }} />
                  <YAxis
                    stroke="#9aa0ab"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(v) => formatMetricValue(v, selectedMetric ? { ...selectedMetric, decimals: 0 } : undefined)}
                  />
                  <Tooltip
                    contentStyle={{ background: "#1c1f26", border: "1px solid #2a2e37", borderRadius: 8, fontSize: 13 }}
                    formatter={(value: number) => [formatMetricValue(value, selectedMetric), selectedMetric?.label ?? ""]}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {barData.map((row, i) => (
                      <Cell key={row.name} fill={row.name === "Team Avg" ? "#9aa0ab" : colorForIndex(i)} />
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
