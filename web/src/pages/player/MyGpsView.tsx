import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMetrics, useMyFitness, useMyGameGps, useMyProfile } from "../../api/client";
import { FitnessCard } from "../../components/Fitness";
import { Card, SectionHeading } from "../../components/Card";
import { GameByGameSection, SeasonStatsSection, SessionTable, type SeasonView } from "../../components/SeasonStats";
import { formatDate, formatMetricValue } from "../../lib/format";
import type { MetricDef, MyProfile } from "../../types";

export default function MyGpsView() {
  const { data: profile, isLoading } = useMyProfile();
  const { data: fitness } = useMyFitness();
  const { data: metrics } = useMetrics();
  const [metricKey, setMetricKey] = useState("load");
  const [gameId, setGameId] = useState<number | null>(null);
  const [seasonView, setSeasonView] = useState<SeasonView>("avg");
  const [logView, setLogView] = useState<"chart" | "table">("chart");
  const teamByGame = useMemo(
    () => new Map((profile?.teamTrend ?? []).map((t) => [t.game_id, t as Record<string, unknown>])),
    [profile],
  );
  // The game breakdown compares GPS stats only.
  const breakdownMetric = metrics?.find((m) => m.key === metricKey) ?? metrics?.find((m) => m.key === "load");

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
        subtitle={`${profile.seasonTotals.games_played ?? 0} game${profile.seasonTotals.games_played === 1 ? "" : "s"} played · ${sessions.length} tracked session${sessions.length === 1 ? "" : "s"} · compared against the squad (teammates stay anonymous)`}
      />

      {fitness?.you && <FitnessCard you={fitness.you} thresholds={fitness.thresholds} asOf={fitness.asOf} title="Your Fitness vs Match Group" />}

      <SeasonStatsSection
        sessions={sessions}
        metrics={metrics ?? []}
        view={seasonView}
        onViewChange={setSeasonView}
        averages={profile.seasonTotals}
        activeKey={metricKey}
        onPick={(key) => {
          setMetricKey(key);
          setLogView("chart");
        }}
        teamAverage={(k) => profile.teamAverages[`avg_${k}`]}
        rank={(k) => profile.ranks[k]}
        teamHigh={(k) => ({ value: profile.teamHighs[`max_${k}`] ?? null })}
      />

      <GameByGameSection
        sessions={sessions}
        metrics={metrics ?? []}
        teamByGame={teamByGame}
        metricKey={metricKey}
        onMetricChange={setMetricKey}
        view={logView}
        onViewChange={setLogView}
        selectedGameId={selectedGameId}
        onSelectGame={(id) => {
          setGameId(id);
          document.getElementById("game-breakdown")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        table={<SessionTable sessions={sessions} metrics={metrics ?? []} />}
        subtitle="Every tracked game. Fitness = you didn't play, load from the warm-up and/or fitness work (it still counts)."
      />

      <section id="game-breakdown" className="scroll-mt-20">
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
          <GameDistribution gameId={selectedGameId} metric={breakdownMetric} />
        </Card>
      </section>

      {profile.gameStats.length > 0 && (
        <section>
          <SectionHeading
            title="My Minutes"
            subtitle={`${Math.round(profile.gameStats.reduce((n, g) => n + (g.minutes ?? 0), 0))} minutes · ${profile.gameStats.filter((g) => g.started).length} starts, from the official box scores`}
          />
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Opponent</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 font-medium">Min</th>
                  <th className="px-4 py-3 font-medium">G</th>
                  <th className="px-4 py-3 font-medium">A</th>
                </tr>
              </thead>
              <tbody>
                {[...profile.gameStats].reverse().map((g) => (
                  <tr key={g.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 text-text-dim">{formatDate(g.game_date)}</td>
                    <td className="px-4 py-3 font-medium">{g.opponent}</td>
                    <td className="px-4 py-3 text-text-dim">{g.status ? `${g.status} ${g.team_score}-${g.opponent_score}` : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {g.minutes ? `${g.minutes}'` : <span className="text-text-dim">DNP</span>}
                      {g.started === 1 && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-teal">GS</span>}
                    </td>
                    <td className="px-4 py-3">{g.goals}</td>
                    <td className="px-4 py-3">{g.assists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

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
              <Cell key={r.slot} fill={r.you ? "#ff3f5e" : "#3b404b"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
