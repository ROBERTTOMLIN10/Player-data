import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMetrics, useMyGameGps, useMyProfile } from "../../api/client";
import { Card, SectionHeading } from "../../components/Card";
import { TrendChart } from "../../components/TrendChart";
import { formatDate, formatMetricValue } from "../../lib/format";
import type { MetricDef } from "../../types";

const YOU_COLOR = "#ff3f5e";
const TEAM_COLOR = "#9aa0ab";

export default function MyGpsView() {
  const { data: profile, isLoading } = useMyProfile();
  const { data: metrics } = useMetrics();
  const [metricKey, setMetricKey] = useState("load");
  const [gameId, setGameId] = useState<number | null>(null);
  const metric = metrics?.find((m) => m.key === metricKey);

  const trendData = useMemo(() => {
    if (!profile) return [];
    const mine = new Map(profile.sessions.map((s) => [s.game_id, s]));
    return profile.teamTrend.map((t) => ({
      game_date: t.game_date,
      opponent: t.opponent,
      you: (mine.get(t.game_id) as Record<string, unknown> | undefined)?.[metricKey] ?? null,
      team: t[`avg_${metricKey}`],
    }));
  }, [profile, metricKey]);

  if (isLoading || !profile) return <div className="py-20 text-center text-text-dim">Loading your GPS…</div>;

  const sessions = profile.sessions;
  const selectedGameId = gameId ?? sessions[sessions.length - 1]?.game_id ?? null;

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeading title="My GPS" />
        <Card className="text-sm text-text-dim">No GPS data for you yet. It shows up here after your first tracked game.</Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        title="My GPS"
        subtitle={`${sessions.length} tracked game${sessions.length === 1 ? "" : "s"} · compared against the squad (teammates stay anonymous)`}
      />

      <section>
        <SectionHeading title="Season Averages" subtitle="Tap a metric to chart it below" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {metrics?.map((m) => {
            const rank = profile.ranks[m.key];
            const active = m.key === metricKey;
            return (
              <button
                key={m.key}
                onClick={() => setMetricKey(m.key)}
                className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                  active ? "border-owl-red bg-owl-red/10" : "border-border bg-surface-raised hover:border-text-dim"
                }`}
              >
                <span className="text-xs font-medium uppercase tracking-wide text-text-dim">{m.label}</span>
                <span className="mt-1 font-display text-xl font-semibold">
                  {formatMetricValue(profile.seasonTotals[`avg_${m.key}`], m)}
                </span>
                <span className="mt-1 text-xs text-text-dim">Team {formatMetricValue(profile.teamAverages[`avg_${m.key}`], m)}</span>
                {rank && (
                  <span className="mt-0.5 text-xs text-teal">
                    #{rank.rank} of {rank.outOf} in squad
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SectionHeading title={`${metric?.label ?? ""}: You vs Team`} subtitle="Your number each game against the squad average" />
        <Card>
          <TrendChart
            data={trendData}
            xKey="game_date"
            xFormatter={formatDate}
            metric={metric}
            series={[
              { dataKey: "you", name: "You", color: YOU_COLOR },
              { dataKey: "team", name: "Team avg", color: TEAM_COLOR },
            ]}
          />
        </Card>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <SectionHeading title="Game Breakdown" subtitle="Every player's number for one game. Red is you." />
          <select
            value={selectedGameId ?? ""}
            onChange={(e) => setGameId(Number(e.target.value))}
            className="mb-3 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none focus:border-owl-red"
          >
            {[...sessions].reverse().map((s) => (
              <option key={s.game_id} value={s.game_id}>
                {formatDate(s.game_date!)} · {s.opponent ?? "Game"}
              </option>
            ))}
          </select>
        </div>
        <Card>
          <GameDistribution gameId={selectedGameId} metric={metric} />
        </Card>
      </section>

      <section>
        <SectionHeading title="My Game Log" />
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Opponent</th>
                <th className="px-4 py-3 font-medium">Min</th>
                {metrics?.slice(0, 5).map((m) => (
                  <th key={m.key} className="whitespace-nowrap px-4 py-3 font-medium">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...sessions].reverse().map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-text-dim">{formatDate(s.game_date!)}</td>
                  <td className="px-4 py-3 font-medium">{s.opponent ?? "—"}</td>
                  <td className="px-4 py-3 text-text-dim">{s.minutes_played != null ? `${s.minutes_played}'` : "—"}</td>
                  {metrics?.slice(0, 5).map((m) => (
                    <td key={m.key} className="px-4 py-3 text-text-dim">
                      {formatMetricValue((s as unknown as Record<string, number | null>)[m.key], m)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}

function GameDistribution({ gameId, metric }: { gameId: number | null; metric?: MetricDef }) {
  const { data, isLoading } = useMyGameGps(gameId);
  if (!metric || isLoading || !data) return <div className="py-16 text-center text-text-dim">Loading…</div>;

  const rows = [
    ...data.others.map((o) => ({ value: o[metric.key], you: false })),
    ...(data.you ? [{ value: data.you[metric.key], you: true }] : []),
  ]
    .filter((r): r is { value: number; you: boolean } => r.value !== null && r.value !== undefined)
    .sort((a, b) => b.value - a.value)
    .map((r, i) => ({ ...r, slot: i + 1 }));
  const yourRank = rows.find((r) => r.you)?.slot;
  const teamAvg = data.teamAverages[`avg_${metric.key}`];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          You: <span className="font-semibold text-owl-red-light">{formatMetricValue(data.you?.[metric.key], metric)}</span>
        </span>
        <span className="text-text-dim">Team avg: {formatMetricValue(teamAvg, metric)}</span>
        {yourRank && (
          <span className="text-text-dim">
            #{yourRank} of {rows.length}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="slot" tick={false} axisLine={{ stroke: "#2a2e37" }} tickLine={false} />
          <YAxis
            stroke="#9aa0ab"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v) => formatMetricValue(v, { ...metric, decimals: 0 })}
          />
          {teamAvg !== null && teamAvg !== undefined && (
            <ReferenceLine y={teamAvg} stroke="#9aa0ab" strokeDasharray="4 4" />
          )}
          <Tooltip
            cursor={{ fill: "#ffffff10" }}
            contentStyle={{ background: "#1c1f26", border: "1px solid #2a2e37", borderRadius: 8, fontSize: 13 }}
            labelFormatter={(_, payload) => (payload?.[0]?.payload?.you ? "You" : "Teammate")}
            formatter={(value: number) => [formatMetricValue(value, metric), metric.label]}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.slot} fill={r.you ? YOU_COLOR : "#3b404b"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
