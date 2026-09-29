import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { usePlayerDetail, usePlayerReadiness, usePlayerRpe, usePlayers, useMetrics, useTeamFitness, useTeamSummary } from "../api/client";
import { GameByGameSection, Segmented, SeasonStatsSection, SessionTable, type SeasonView } from "../components/SeasonStats";
import { FitnessCard } from "../components/Fitness";
import { Card, SectionHeading } from "../components/Card";
import { TeamLogo } from "../components/TeamLogo";
import { RangePicker, ReadinessHistory } from "../components/ReadinessHistory";
import { RpeHistory } from "../components/RpeHistory";
import { PlayerProfileHeader } from "../components/PlayerProfileHeader";
import { PlayerPhoto } from "../components/PlayerPhoto";
import { formatDate } from "../lib/format";
import { positionGroup, ROSTER_SECTIONS } from "../lib/positions";

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
  // Player page sections: Stats (default), Readiness, RPE. Kept in the URL (?section=readiness).
  const [params, setParams] = useSearchParams();
  const section: PlayerSection = PLAYER_SECTIONS.find((x) => x.key === params.get("section"))?.key ?? "stats";
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
          <div className="flex flex-col gap-6">
            {ROSTER_SECTIONS.map(({ group, label }) => {
              const inGroup = (players ?? [])
                .filter((p) => positionGroup(p.position) === group)
                .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
              if (!inGroup.length) return null;
              return (
                <section key={group}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-text">{label}</h3>
                    <span className="text-xs text-text-dim">{inGroup.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {inGroup.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/players/${p.id}`)}
                        className="rounded-lg border border-border bg-surface-raised p-3 text-left transition-colors hover:border-owl-red"
                      >
                        <div className="flex items-center gap-2 font-medium">
                          <PlayerPhoto name={p.canonical_name} url={p.photo_url} size={28} />
                          <span className="min-w-0 truncate">
                            {p.jersey_number && <span className="mr-1.5 text-xs font-normal text-text-dim">#{p.jersey_number}</span>}
                            {p.canonical_name}
                          </span>
                        </div>
                        <div className="text-xs text-text-dim">
                          {p.sessions
                            ? `${p.games_played} game${p.games_played === 1 ? "" : "s"} played · ${p.sessions} tracked`
                            : "No GPS data yet"}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
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
      <PlayerProfileHeader
        name={detail.player.canonical_name}
        jersey={detail.player.jersey_number}
        profile={detail.profile}
        subtitle={`${detail.seasonTotals.games_played ?? 0} games played · ${detail.sessions.length} tracked sessions this season`}
        onBack={() => navigate("/players")}
      />

      <div className="-mt-4 flex justify-center">
        <Segmented
          value={section}
          options={PLAYER_SECTIONS}
          onChange={(v) => setParams(v === "stats" ? {} : { section: v }, { replace: true })}
          label="Player sections"
        />
      </div>

      {section === "readiness" && <PlayerReadinessSection playerId={selectedId} />}
      {section === "rpe" && <PlayerRpeSection playerId={selectedId} />}
      {section === "stats" && (
        <>
      {detail.sessions.length === 0 ? (
        <Card className="text-sm text-text-dim">
          No GPS data yet. Their stats will show here once a GPS file includes them.
        </Card>
      ) : (
        <>
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
        </>
      )}

      {myFitness && fitness && <FitnessCard you={myFitness} thresholds={fitness.thresholds} asOf={fitness.asOf} coach />}

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
        </>
      )}
    </div>
  );
}

type PlayerSection = "stats" | "readiness" | "rpe";
const PLAYER_SECTIONS: { key: PlayerSection; label: string }[] = [
  { key: "stats", label: "Stats" },
  { key: "readiness", label: "Readiness" },
  { key: "rpe", label: "RPE" },
];

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
        <ReadinessHistory history={data} days={days} emptyText="No check-ins in this period." />
      ) : (
        <div className="py-8 text-center text-text-dim">Loading…</div>
      )}
    </section>
  );
}

function PlayerRpeSection({ playerId }: { playerId: number }) {
  const [days, setDays] = useState(30);
  const { data } = usePlayerRpe(playerId, days);
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <SectionHeading title="RPE" subtitle="How hard each training session felt (1 very easy – 10 maximal)" />
        <RangePicker days={days} onChange={setDays} />
      </div>
      {data ? (
        <div className="flex flex-col gap-3">
          {data.flags && data.flags.length > 0 && (
            <Card className="border-gold/40 text-sm text-gold">{data.flags.join(" · ")}</Card>
          )}
          <RpeHistory data={data} emptyText="No RPE scores in this period. Log them on the RPE tab after training." />
        </div>
      ) : (
        <div className="py-8 text-center text-text-dim">Loading…</div>
      )}
    </section>
  );
}
