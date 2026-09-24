import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMetrics, useMyFitness, useMyGameGps, useMyProfile } from "../../api/client";
import { FitnessCard, MinutesCell } from "../../components/Fitness";
import { SessionFlagTag } from "../../components/SessionFlag";
import { Card, SectionHeading } from "../../components/Card";
import { GameByGameChart, type GameBar } from "../../components/GameByGameChart";
import { formatDate, formatMetricValue } from "../../lib/format";
import type { MetricDef, MyProfile } from "../../types";

type SeasonView = "avg" | "high" | "low";
const SEASON_TABS: { key: SeasonView; label: string }[] = [
  { key: "avg", label: "Averages" },
  { key: "high", label: "Highs" },
  { key: "low", label: "Lows" },
];
const MINUTES: MetricDef = { key: "minutes", label: "Minutes", unit: "min", decimals: 0 };

/** Two-to-four option segmented control (quicker than a dropdown). */
function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex w-fit gap-1 rounded-lg border border-border bg-surface p-1" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            value === o.key ? "bg-owl-red text-white" : "text-text-dim hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function MyGpsView() {
  const { data: profile, isLoading } = useMyProfile();
  const { data: fitness } = useMyFitness();
  const { data: metrics } = useMetrics();
  const [metricKey, setMetricKey] = useState("load");
  const [gameId, setGameId] = useState<number | null>(null);
  const [seasonView, setSeasonView] = useState<SeasonView>("avg");
  const [logView, setLogView] = useState<"chart" | "table">("chart");
  const chartMetrics = useMemo(() => [MINUTES, ...(metrics ?? [])], [metrics]);
  const metric = chartMetrics.find((m) => m.key === metricKey);
  // The game breakdown compares GPS stats only.
  const breakdownMetric = metrics?.find((m) => m.key === metricKey) ?? metrics?.find((m) => m.key === "load");

  // Highs and lows over games with minutes (a fitness-only session would always
  // be the "low"), tracker glitches left out. Falls back to every clean session
  // for a player without minutes yet.
  const extremes = useMemo(() => {
    const clean = (profile?.sessions ?? []).filter((s) => s.flag?.kind !== "glitch");
    const played = clean.filter((s) => s.played);
    const pool = played.length ? played : clean;
    const out: Record<string, { high: (typeof pool)[number] | null; low: (typeof pool)[number] | null }> = {};
    for (const m of metrics ?? []) {
      const withValue = pool.filter((s) => (s as unknown as Record<string, number | null>)[m.key] !== null);
      const v = (s: (typeof pool)[number]) => (s as unknown as Record<string, number>)[m.key];
      out[m.key] = {
        high: withValue.reduce<(typeof pool)[number] | null>((best, s) => (!best || v(s) > v(best) ? s : best), null),
        low: withValue.reduce<(typeof pool)[number] | null>((best, s) => (!best || v(s) < v(best) ? s : best), null),
      };
    }
    return { out, playedOnly: played.length > 0 };
  }, [profile, metrics]);

  const bars = useMemo((): GameBar[] => {
    if (!profile || !metric) return [];
    const team = new Map(profile.teamTrend.map((t) => [t.game_id, t]));
    return profile.sessions.map((s) => {
      const glitch = s.flag?.kind === "glitch";
      const raw = metric.key === "minutes" ? (s.minutes_played ?? null) : (s as unknown as Record<string, number | null>)[metric.key];
      return {
        game_id: s.game_id,
        game_date: s.game_date!,
        opponent: s.opponent ?? null,
        value: glitch && metric.key !== "minutes" ? null : raw,
        team: metric.key === "minutes" ? null : (team.get(s.game_id)?.[`avg_${metric.key}`] ?? null),
        played: Boolean(s.played),
        glitch: glitch && metric.key !== "minutes",
        minutes: s.minutes_played ?? null,
      };
    });
  }, [profile, metric]);

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

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <SectionHeading
            title={`Season ${SEASON_TABS.find((t) => t.key === seasonView)!.label}`}
            subtitle={
              seasonView === "avg"
                ? "Tap a stat to chart it below"
                : `Your ${seasonView === "high" ? "best" : "lowest"} single game for each stat${extremes.playedOnly ? " (games you played; fitness-only sessions left out)" : ""}. Tap to chart it.`
            }
          />
          <div className="mb-3">
            <Segmented value={seasonView} options={SEASON_TABS} onChange={setSeasonView} label="Season stats" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {metrics?.map((m) => {
            const rank = profile.ranks[m.key];
            const active = m.key === metricKey;
            const game = seasonView === "high" ? extremes.out[m.key]?.high : seasonView === "low" ? extremes.out[m.key]?.low : null;
            const value =
              seasonView === "avg" ? profile.seasonTotals[`avg_${m.key}`] : game ? (game as unknown as Record<string, number | null>)[m.key] : null;
            return (
              <button
                key={m.key}
                onClick={() => {
                  setMetricKey(m.key);
                  setLogView("chart");
                }}
                className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                  active ? "border-owl-red bg-owl-red/10" : "border-border bg-surface-raised hover:border-text-dim"
                }`}
              >
                <span className="text-xs font-medium uppercase tracking-wide text-text-dim">{m.label}</span>
                <span className="mt-1 font-display text-xl font-semibold">{formatMetricValue(value, m)}</span>
                {seasonView === "avg" && (
                  <>
                    <span className="mt-1 text-xs text-text-dim">Team {formatMetricValue(profile.teamAverages[`avg_${m.key}`], m)}</span>
                    {rank && (
                      <span className="mt-0.5 text-xs text-teal">
                        #{rank.rank} of {rank.outOf} in squad
                      </span>
                    )}
                  </>
                )}
                {seasonView !== "avg" && game && (
                  <span className="mt-1 text-xs text-text-dim">
                    {game.opponent ?? "Game"} · {formatDate(game.game_date!)}
                  </span>
                )}
                {seasonView === "high" && (
                  <span className="mt-0.5 text-xs text-teal">Squad best {formatMetricValue(profile.teamHighs[`max_${m.key}`], m)}</span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <SectionHeading
            title="Game by Game"
            subtitle="Every tracked game. Fitness = you didn't play, load from the warm-up and/or fitness work (it still counts)."
          />
          <div className="mb-3">
            <Segmented
              value={logView}
              options={[
                { key: "chart", label: "Chart" },
                { key: "table", label: "Table" },
              ]}
              onChange={setLogView}
              label="Game by game view"
            />
          </div>
        </div>
        {logView === "chart" ? (
          <Card className="flex flex-col gap-3">
            <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Stat to chart">
              {chartMetrics.map((m) => (
                <button
                  key={m.key}
                  role="tab"
                  aria-selected={m.key === metricKey}
                  onClick={() => setMetricKey(m.key)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    m.key === metricKey ? "border-owl-red bg-owl-red text-white" : "border-border text-text-dim hover:border-text-dim hover:text-text"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {metric && (
              <GameByGameChart
                data={bars}
                metric={metric}
                selectedGameId={selectedGameId}
                onSelectGame={(id) => {
                  setGameId(id);
                  document.getElementById("game-breakdown")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                showTeam={metric.key !== "minutes"}
              />
            )}
          </Card>
        ) : (
          <SessionTable sessions={sessions} metrics={metrics ?? []} />
        )}
      </section>

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

function SessionTable({ sessions, metrics }: { sessions: MyProfile["sessions"]; metrics: MetricDef[] }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Opponent</th>
            <th className="px-4 py-3 font-medium">Min</th>
            {metrics.map((m) => (
              <th key={m.key} className="whitespace-nowrap px-4 py-3 font-medium">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...sessions].reverse().map((s) => (
            <tr key={s.id} className="border-b border-border/60 last:border-0">
              <td className="whitespace-nowrap px-4 py-3 text-text-dim">{formatDate(s.game_date!)}</td>
              <td className="whitespace-nowrap px-4 py-3 font-medium">
                {s.opponent ?? "—"}
                <SessionFlagTag s={s} />
              </td>
              <td className="px-4 py-3 text-text-dim">
                <MinutesCell s={s} />
              </td>
              {metrics.map((m) => (
                <td key={m.key} className="whitespace-nowrap px-4 py-3 text-text-dim">
                  {formatMetricValue((s as unknown as Record<string, number | null>)[m.key], m)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
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
