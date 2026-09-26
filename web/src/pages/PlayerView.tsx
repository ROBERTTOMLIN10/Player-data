import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePlayerDetail, usePlayerReadiness, usePlayers, useMetrics, useTeamFitness, useTeamSummary } from "../api/client";
import { GameByGameSection, SeasonStatsSection, SessionTable, type SeasonView } from "../components/SeasonStats";
import { FitnessCard } from "../components/Fitness";
import { Card, SectionHeading } from "../components/Card";
import { TeamLogo } from "../components/TeamLogo";
import { RangePicker, ReadinessHistory } from "../components/ReadinessHistory";
import { formatDate } from "../lib/format";

export default function PlayerView() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const { data: players, isLoading: playersLoading } = usePlayers();
  const { data: metrics } = useMetrics();

  const selectedId = playerId ? Number(playerId) : null;
  const { data: detail, isLoading: detailLoading } = usePlayerDetail(selectedId);
  const { data: fitness } = useTeamFitness(selectedId !== null);
  const myFitness = fitness?.players.find((p) => p.playerId === selectedId);

  const { data: summary } = useTeamSummary();
  const [selectedMetricKey, setSelectedMetricKey] = useState("load");
  const [seasonView, setSeasonView] = useState<SeasonView>("avg");
  const [logView, setLogView] = useState<"chart" | "table">("chart");
  const teamByGame = useMemo(
    () => new Map((summary?.trend ?? []).map((t) => [t.game_id, t as Record<string, unknown>])),
    [summary],
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
                <div className="text-xs text-text-dim">
                  {p.games_played} games played
                  {p.sessions && p.sessions > p.games_played ? ` · ${p.sessions - p.games_played} fitness` : ""}
                </div>
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
        <SectionHeading title={detail.player.canonical_name} subtitle={`${detail.seasonTotals.games_played ?? 0} games played · ${detail.sessions.length} tracked sessions this season`} />
        <button onClick={() => navigate("/players")} className="text-sm text-text-dim hover:text-owl-red">
          ← All players
        </button>
      </div>

      <PlayerReadinessSection playerId={selectedId} />

      {myFitness && fitness && <FitnessCard you={myFitness} thresholds={fitness.thresholds} asOf={fitness.asOf} coach />}

      <SeasonStatsSection
        sessions={detail.sessions}
        metrics={metrics ?? []}
        view={seasonView}
        onViewChange={setSeasonView}
        averages={detail.seasonTotals}
        activeKey={selectedMetricKey}
        onPick={(key) => {
          setSelectedMetricKey(key);
          setLogView("chart");
        }}
        teamAverage={(k) => summary?.seasonAverages[`avg_${k}`]}
        teamHigh={(k) => {
          const best = summary?.highs.find((h) => h.metric === k)?.best;
          return best ? { value: best.value, by: best.player_name } : null;
        }}
        who="Their"
      />

      <GameByGameSection
        sessions={detail.sessions}
        metrics={metrics ?? []}
        teamByGame={teamByGame}
        metricKey={selectedMetricKey}
        onMetricChange={setSelectedMetricKey}
        view={logView}
        onViewChange={setLogView}
        selectedGameId={null}
        onSelectGame={(id) => navigate(`/gps?game=${id}`)}
        table={<SessionTable sessions={detail.sessions} metrics={metrics ?? []} />}
        subtitle="Every tracked game. Fitness = didn't play, load from the warm-up and/or fitness work (it still counts)."
        hint="Tap a bar for that game's full squad breakdown"
      />

      {detail.gameStats.length > 0 && (
        <section>
          <SectionHeading title="Match Stats" subtitle="Minutes, goals, assists, points, and cards per game, from fausports.com box scores (no GPS file needed)" />
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
            {[
              { label: "Minutes", value: Math.round(detail.gameStats.reduce((n, g) => n + (g.minutes ?? 0), 0)) },
              { label: "Starts", value: detail.gameStats.filter((g) => g.started).length },
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
                  <th className="px-4 py-3 font-medium">Min</th>
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
                    <td className="px-4 py-3 font-medium">
                      <span className="flex items-center gap-2">
                        <TeamLogo name={g.opponent} url={g.opponent_logo_url} size="sm" />
                        {g.opponent}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-dim">
                      {g.status ? `${g.status} ${g.team_score}-${g.opponent_score}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {g.minutes ? `${g.minutes}'` : <span className="text-text-dim">DNP</span>}
                      {g.started === 1 && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-teal">GS</span>}
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

function PlayerReadinessSection({ playerId }: { playerId: number }) {
  const [days, setDays] = useState(30);
  const { data } = usePlayerReadiness(playerId, days);
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <SectionHeading title="Readiness" subtitle="Daily check-ins: wellness score and anything sore" />
        <RangePicker days={days} onChange={setDays} />
      </div>
      {data ? (
        <ReadinessHistory history={data} emptyText="No check-ins in this period." />
      ) : (
        <div className="py-8 text-center text-text-dim">Loading…</div>
      )}
    </section>
  );
}
