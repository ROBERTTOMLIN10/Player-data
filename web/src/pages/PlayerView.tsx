import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePlayerDetail, usePlayers, useMetrics } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { MetricCard } from "../components/MetricCard";
import { TrendChart } from "../components/TrendChart";
import { formatDate, formatMetricValue } from "../lib/format";

export default function PlayerView() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const { data: players, isLoading: playersLoading } = usePlayers();
  const { data: metrics } = useMetrics();

  const selectedId = playerId ? Number(playerId) : null;
  const { data: detail, isLoading: detailLoading } = usePlayerDetail(selectedId);

  const [selectedMetricKey, setSelectedMetricKey] = useState("load");
  const selectedMetric = metrics?.find((m) => m.key === selectedMetricKey);

  const chartData = useMemo(
    () => (detail?.sessions ?? []).map((s) => ({ ...s, label: `${s.opponent ?? ""} ${s.game_date}` })),
    [detail],
  );

  if (!selectedId) {
    return (
      <div className="flex flex-col gap-4">
        <SectionHeading title="Players" subtitle="Select a player to see their season profile" />
        {playersLoading ? (
          <div className="py-10 text-center text-text-dim">Loading roster…</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {players?.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/players/${p.id}`)}
                className="rounded-lg border border-border bg-surface-raised p-3 text-left transition-colors hover:border-owl-red"
              >
                <div className="font-medium">{p.canonical_name}</div>
                <div className="text-xs text-text-dim">{p.games_played} games</div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (detailLoading || !detail) {
    return <div className="py-20 text-center text-text-dim">Loading player…</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading title={detail.player.canonical_name} subtitle={`${detail.sessions.length} games this season`} />
        <button onClick={() => navigate("/players")} className="text-sm text-text-dim hover:text-owl-red">
          ← All players
        </button>
      </div>

      <section>
        <SectionHeading title="Season Averages" subtitle="Click a metric to chart its trend across games" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {metrics?.map((m) => (
            <MetricCard
              key={m.key}
              metric={m}
              value={detail.seasonTotals[`avg_${m.key}`]}
              onClick={() => setSelectedMetricKey(m.key)}
              active={m.key === selectedMetricKey}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading title={`${selectedMetric?.label ?? ""} Trend`} subtitle="Per-game values this season" />
        <Card>
          <TrendChart
            data={chartData}
            xKey="game_date"
            xFormatter={formatDate}
            metric={selectedMetric}
            series={[{ dataKey: selectedMetricKey, name: detail.player.canonical_name, color: "#ff3f5e" }]}
          />
        </Card>
      </section>

      <section>
        <SectionHeading title="Game Log" />
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
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
              {detail.sessions.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-text-dim">{formatDate(s.game_date!)}</td>
                  <td className="px-4 py-3 font-medium">
                    {s.opponent ?? "—"}
                    {s.started === 1 && <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-teal">GS</span>}
                  </td>
                  <td className="px-4 py-3 text-text-dim">{s.minutes_played != null ? `${s.minutes_played}'` : "—"}</td>
                  {metrics?.slice(0, 5).map((m) => (
                    <td key={m.key} className="px-4 py-3 text-text-dim">
                      {formatMetricValue((s as any)[m.key], m)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {detail.gameStats.length > 0 && (
        <section>
          <SectionHeading title="Match Stats" subtitle="Goals, assists, points, and cards per game (from fausports.com box scores)" />
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { label: "Goals", value: detail.statTotals.goals },
              { label: "Assists", value: detail.statTotals.assists },
              { label: "Points", value: detail.statTotals.points },
              { label: "Shots", value: detail.statTotals.shots },
              { label: "SOG", value: detail.statTotals.shots_on_goal },
              { label: "Yellow", value: detail.statTotals.yellow_cards },
              { label: "Red", value: detail.statTotals.red_cards },
            ].map((stat) => (
              <Card key={stat.label} className="p-3 text-center">
                <div className="font-display text-xl font-semibold">{stat.value}</div>
                <div className="text-xs uppercase tracking-wide text-text-dim">{stat.label}</div>
              </Card>
            ))}
          </div>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Opponent</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 font-medium">G</th>
                  <th className="px-4 py-3 font-medium">A</th>
                  <th className="px-4 py-3 font-medium">Pts</th>
                  <th className="px-4 py-3 font-medium">Sh</th>
                  <th className="px-4 py-3 font-medium">SOG</th>
                  <th className="px-4 py-3 font-medium">Cards</th>
                </tr>
              </thead>
              <tbody>
                {detail.gameStats.map((g) => (
                  <tr key={g.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 text-text-dim">{formatDate(g.game_date)}</td>
                    <td className="px-4 py-3 font-medium">{g.opponent}</td>
                    <td className="px-4 py-3 text-text-dim">
                      {g.status ? `${g.status} ${g.team_score}-${g.opponent_score}` : "—"}
                    </td>
                    <td className="px-4 py-3">{g.goals}</td>
                    <td className="px-4 py-3">{g.assists}</td>
                    <td className="px-4 py-3">{g.points}</td>
                    <td className="px-4 py-3 text-text-dim">{g.shots}</td>
                    <td className="px-4 py-3 text-text-dim">{g.shots_on_goal}</td>
                    <td className="px-4 py-3">
                      {g.yellow_cards > 0 && (
                        <span className="mr-1 inline-block h-3 w-2.5 rounded-sm bg-gold" title={`${g.yellow_cards} yellow`} />
                      )}
                      {g.red_cards > 0 && (
                        <span className="inline-block h-3 w-2.5 rounded-sm bg-owl-red" title={`${g.red_cards} red`} />
                      )}
                      {g.yellow_cards === 0 && g.red_cards === 0 && <span className="text-text-dim">—</span>}
                    </td>
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
