import { useMemo, type ReactNode } from "react";
import { Card, SectionHeading } from "./Card";
import { GameByGameChart, type GameBar } from "./GameByGameChart";
import { MinutesCell } from "./Fitness";
import { SessionFlagTag } from "./SessionFlag";
import { formatDate, formatMetricValue } from "../lib/format";
import type { GpsSession, MetricDef } from "../types";

/**
 * Season stats (Averages / Highs / Lows) and the game-by-game chart, shared by
 * the player's My GPS page and the coaches' player page so both show the same.
 */

export type SeasonView = "avg" | "high" | "low";
const SEASON_TABS: { key: SeasonView; label: string }[] = [
  { key: "avg", label: "Averages" },
  { key: "high", label: "Highs" },
  { key: "low", label: "Lows" },
];
export const MINUTES_METRIC: MetricDef = { key: "minutes", label: "Minutes", unit: "min", decimals: 0 };

const val = (s: GpsSession, key: string) => (s as unknown as Record<string, number | null>)[key];

/** Two-to-four option segmented control (quicker than a dropdown). */
export function Segmented<T extends string>({ value, options, onChange, label }: {
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

/**
 * Highs and lows over games with minutes (a fitness-only session would always
 * be the "low"), tracker glitches left out. Falls back to every clean session
 * for a player without minutes yet.
 */
export function useExtremes(sessions: GpsSession[], metrics: MetricDef[]) {
  return useMemo(() => {
    const clean = sessions.filter((s) => s.flag?.kind !== "glitch");
    const played = clean.filter((s) => s.played);
    const pool = played.length ? played : clean;
    const out: Record<string, { high: GpsSession | null; low: GpsSession | null }> = {};
    for (const m of metrics) {
      const withValue = pool.filter((s) => val(s, m.key) !== null && val(s, m.key) !== undefined);
      out[m.key] = {
        high: withValue.reduce<GpsSession | null>((b, s) => (!b || val(s, m.key)! > val(b, m.key)! ? s : b), null),
        low: withValue.reduce<GpsSession | null>((b, s) => (!b || val(s, m.key)! < val(b, m.key)! ? s : b), null),
      };
    }
    return { out, playedOnly: played.length > 0 };
  }, [sessions, metrics]);
}

export function SeasonStatsSection({
  sessions,
  metrics,
  view,
  onViewChange,
  averages,
  activeKey,
  onPick,
  teamAverage,
  rank,
  teamHigh,
  who = "Your",
}: {
  sessions: GpsSession[];
  metrics: MetricDef[];
  view: SeasonView;
  onViewChange: (v: SeasonView) => void;
  averages: Record<string, number | null>; // avg_<metric>
  activeKey: string;
  onPick: (key: string) => void;
  teamAverage: (key: string) => number | null | undefined;
  rank?: (key: string) => { rank: number; outOf: number } | null | undefined;
  teamHigh: (key: string) => { value: number | null; by?: string } | null | undefined;
  who?: string; // "Your" or "His"
}) {
  const extremes = useExtremes(sessions, metrics);
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <SectionHeading
          title={`Season ${SEASON_TABS.find((t) => t.key === view)!.label}`}
          subtitle={
            view === "avg"
              ? "Tap a stat to chart it below"
              : `${who} ${view === "high" ? "best" : "lowest"} single game for each stat${extremes.playedOnly ? " (games played; fitness-only sessions left out)" : ""}. Tap to chart it.`
          }
        />
        <div className="mb-3">
          <Segmented value={view} options={SEASON_TABS} onChange={onViewChange} label="Season stats" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {metrics.map((m) => {
          const game = view === "high" ? extremes.out[m.key]?.high : view === "low" ? extremes.out[m.key]?.low : null;
          const value = view === "avg" ? averages[`avg_${m.key}`] : game ? val(game, m.key) : null;
          const r = rank?.(m.key);
          const best = teamHigh(m.key);
          return (
            <button
              key={m.key}
              onClick={() => onPick(m.key)}
              className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                m.key === activeKey ? "border-owl-red bg-owl-red/10" : "border-border bg-surface-raised hover:border-text-dim"
              }`}
            >
              <span className="text-xs font-medium uppercase tracking-wide text-text-dim">{m.label}</span>
              <span className="mt-1 font-display text-xl font-semibold">{formatMetricValue(value, m)}</span>
              {view === "avg" && (
                <>
                  <span className="mt-1 text-xs text-text-dim">Team {formatMetricValue(teamAverage(m.key), m)}</span>
                  {r && (
                    <span className="mt-0.5 text-xs text-teal">
                      #{r.rank} of {r.outOf} in squad
                    </span>
                  )}
                </>
              )}
              {view !== "avg" && game && (
                <span className="mt-1 text-xs text-text-dim">
                  {game.opponent ?? "Game"} · {formatDate(game.game_date!)}
                </span>
              )}
              {view === "high" && best && (
                <span className="mt-0.5 text-xs text-teal">
                  Squad best {formatMetricValue(best.value, m)}
                  {best.by ? ` (${best.by})` : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Bars for the game-by-game chart: one per tracked session. */
export function sessionBars(sessions: GpsSession[], metric: MetricDef, teamByGame: Map<number, Record<string, unknown>>): GameBar[] {
  return sessions.map((s) => {
    const minutes = metric.key === "minutes";
    const glitch = s.flag?.kind === "glitch" && !minutes;
    const team = teamByGame.get(s.game_id)?.[`avg_${metric.key}`];
    return {
      game_id: s.game_id,
      game_date: s.game_date!,
      opponent: s.opponent ?? null,
      value: glitch ? null : minutes ? (s.minutes_played ?? null) : val(s, metric.key),
      team: minutes || typeof team !== "number" ? null : team,
      played: Boolean(s.played),
      glitch,
      minutes: s.minutes_played ?? null,
    };
  });
}

export function GameByGameSection({
  sessions,
  metrics,
  teamByGame,
  metricKey,
  onMetricChange,
  view,
  onViewChange,
  selectedGameId,
  onSelectGame,
  table,
  subtitle,
  hint,
}: {
  sessions: GpsSession[];
  metrics: MetricDef[];
  teamByGame: Map<number, Record<string, unknown>>;
  metricKey: string;
  onMetricChange: (key: string) => void;
  view: "chart" | "table";
  onViewChange: (v: "chart" | "table") => void;
  selectedGameId: number | null;
  onSelectGame: (gameId: number) => void;
  table: ReactNode;
  subtitle: string;
  hint?: string;
}) {
  const chartMetrics = useMemo(() => [MINUTES_METRIC, ...metrics], [metrics]);
  const metric = chartMetrics.find((m) => m.key === metricKey) ?? chartMetrics[1] ?? chartMetrics[0];
  const bars = useMemo(() => sessionBars(sessions, metric, teamByGame), [sessions, metric, teamByGame]);
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <SectionHeading title="Game by Game" subtitle={subtitle} />
        <div className="mb-3">
          <Segmented
            value={view}
            options={[
              { key: "chart", label: "Chart" },
              { key: "table", label: "Table" },
            ]}
            onChange={onViewChange}
            label="Game by game view"
          />
        </div>
      </div>
      {view === "chart" ? (
        <Card className="flex flex-col gap-3">
          <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Stat to chart">
            {chartMetrics.map((m) => (
              <button
                key={m.key}
                role="tab"
                aria-selected={m.key === metric.key}
                onClick={() => onMetricChange(m.key)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  m.key === metric.key ? "border-owl-red bg-owl-red text-white" : "border-border text-text-dim hover:border-text-dim hover:text-text"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <GameByGameChart
            data={bars}
            metric={metric}
            selectedGameId={selectedGameId}
            onSelectGame={onSelectGame}
            showTeam={metric.key !== "minutes"}
            hint={hint}
          />
        </Card>
      ) : (
        table
      )}
    </section>
  );
}

/** Every tracked game with all stats; flag tags and Fitness minutes. */
export function SessionTable({ sessions, metrics }: { sessions: GpsSession[]; metrics: MetricDef[] }) {
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
