import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFlaggedSessions, useGameDetail, useGames, useMetrics, useTeamFitness, useTeamSummary } from "../api/client";
import { NeedsChecking } from "../components/NeedsChecking";
import { SquadFitnessTable } from "../components/Fitness";
import { Card, SectionHeading } from "../components/Card";
import { MetricCard } from "../components/MetricCard";
import { TrendChart } from "../components/TrendChart";
import { formatDate, formatDateLong, formatMetricValue } from "../lib/format";
import { GameRosterTable } from "../components/GameRosterTable";

export default function TeamView() {
  const { data: games, isLoading: gamesLoading } = useGames();
  const { data: summary, isLoading: summaryLoading } = useTeamSummary();
  const { data: metrics } = useMetrics();
  const { data: fitness } = useTeamFitness();
  const { data: flagged } = useFlaggedSessions();
  const navigate = useNavigate();

  const [selectedMetricKey, setSelectedMetricKey] = useState("load");
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);

  const { data: gameDetail } = useGameDetail(selectedGameId);

  const selectedMetric = metrics?.find((m) => m.key === selectedMetricKey);

  const trendData = useMemo(() => summary?.trend ?? [], [summary]);

  if (gamesLoading || summaryLoading) {
    return <div className="py-20 text-center text-text-dim">Loading team data…</div>;
  }

  if (!games || games.length === 0) {
    return (
      <Card className="mx-auto mt-10 max-w-lg text-center">
        <p className="text-text-dim">
          No games imported yet. Drop a Titan export into <code className="text-teal">/data/titan</code> named
          like <code className="text-teal">2026-09-05_Cleveland State.xlsx</code> and run{" "}
          <code className="text-teal">npm run import:titan</code>.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <NeedsChecking sessions={flagged ?? []} />

      {fitness && <SquadFitnessTable data={fitness} />}

      <section>
        <SectionHeading title="Season Averages" subtitle="Click a metric to chart its trend across games" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {metrics?.map((m) => (
            <MetricCard
              key={m.key}
              metric={m}
              value={summary?.seasonAverages[`avg_${m.key}`]}
              onClick={() => setSelectedMetricKey(m.key)}
              active={m.key === selectedMetricKey}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          title={`${selectedMetric?.label ?? ""} Trend`}
          subtitle="Click a point to see that game's full roster breakdown"
        />
        <Card>
          <TrendChart
            data={trendData}
            xKey="game_date"
            xFormatter={formatDate}
            metric={selectedMetric}
            series={[{ dataKey: `avg_${selectedMetricKey}`, name: "Team avg", color: "#ff3f5e" }]}
            onPointClick={(point) => setSelectedGameId(point.game_id as number)}
          />
        </Card>
      </section>

      <section>
        <SectionHeading title="Games" subtitle="Click a row to view that game's roster" />
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Opponent</th>
                <th className="px-4 py-3 font-medium">Players</th>
                <th className="px-4 py-3 font-medium">Avg Load</th>
                <th className="px-4 py-3 font-medium">Avg Distance</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr
                  key={g.id}
                  onClick={() => setSelectedGameId(g.id)}
                  className={`cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised ${
                    selectedGameId === g.id ? "bg-owl-red/10" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-text-dim">{formatDate(g.game_date)}</td>
                  <td className="px-4 py-3 font-medium">{g.opponent ?? "—"}</td>
                  <td className="px-4 py-3">{g.player_count}</td>
                  <td className="px-4 py-3">{formatMetricValue(g.avg_load as number, { key: "load", label: "Load", unit: "", decimals: 0 })}</td>
                  <td className="px-4 py-3">
                    {formatMetricValue(g.avg_distance_mi as number, { key: "distance_mi", label: "Distance", unit: "mi", decimals: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {selectedGameId && gameDetail && (
        <section>
          <SectionHeading
            title={`${gameDetail.game.opponent ?? "Game"} — ${formatDateLong(gameDetail.game.game_date)}`}
            subtitle="Click a player to open their season view"
          />
          <GameRosterTable
            sessions={gameDetail.sessions}
            metrics={metrics ?? []}
            onSelectPlayer={(playerId) => navigate(`/players/${playerId}`)}
          />
        </section>
      )}

      {summary?.highs && (
        <section>
          <SectionHeading title="Season Highs" subtitle="Best single-game performance per metric" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {summary.highs
              .filter((h) => h.best)
              .map((h) => (
                <Card key={h.metric} className="p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-text-dim">{h.label}</div>
                  <div className="mt-1 font-display text-lg font-semibold">
                    {formatMetricValue(h.best!.value, { key: h.metric, label: h.label, unit: h.unit, decimals: 1 })}
                  </div>
                  <div className="mt-1 text-xs text-teal">{h.best!.player_name}</div>
                  <div className="text-xs text-text-dim">
                    vs {h.best!.opponent ?? "—"} · {formatDate(h.best!.game_date)}
                  </div>
                </Card>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
