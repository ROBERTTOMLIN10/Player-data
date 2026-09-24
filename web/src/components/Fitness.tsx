import { useNavigate } from "react-router-dom";
import { Card, SectionHeading } from "./Card";
import type { FitnessStatus, FitnessWindow, GpsSession, PlayerFitness, TeamFitness } from "../types";

/**
 * Fitness vs the match group: a player's GPS load over the last 7 / 28 days as
 * a % of what the players getting minutes averaged in the same games. Load
 * from warm-up and fitness work (no minutes) counts too.
 */

const STATUS_CLASS: Record<FitnessStatus, string> = {
  ok: "text-emerald-400",
  amber: "text-amber-400",
  red: "text-red-400",
};

const STATUS_DOT: Record<FitnessStatus, string> = {
  ok: "bg-emerald-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
};

export function FitnessPct({ w }: { w: FitnessWindow }) {
  if (w.pct === null) return <span className="text-text-dim">—</span>;
  return <span className={`font-display font-semibold ${w.status ? STATUS_CLASS[w.status] : ""}`}>{w.pct}%</span>;
}

function sessionsLabel(p: PlayerFitness) {
  const parts = [`${p.gamesPlayed} game${p.gamesPlayed === 1 ? "" : "s"} played`];
  if (p.fitnessSessions) parts.push(`${p.fitnessSessions} fitness-only`);
  return parts.join(" · ");
}

/** Minutes cell for a GPS session: minutes played, "Fitness" (load but no minutes), or a dash when the game has no box score. */
export function MinutesCell({ s }: { s: GpsSession }) {
  if (s.minutes_played != null && s.minutes_played > 0) return <>{s.minutes_played}&rsquo;</>;
  if (s.box_score)
    return (
      <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal" title="Didn't play: load from the warm-up and/or fitness work">
        Fitness
      </span>
    );
  return <>—</>;
}

/** Coaches: the whole squad, furthest behind first. */
export function SquadFitnessTable({ data }: { data: TeamFitness }) {
  const navigate = useNavigate();
  if (!data.players.length) return null;
  return (
    <section>
      <SectionHeading
        title="Fitness vs Match Group"
        subtitle={`Load over the last 7 and 28 days as a % of what players getting minutes averaged (to ${data.asOf}). Amber under ${data.thresholds.amber}%, red under ${data.thresholds.red}%.`}
      />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
              <th className="px-4 py-3 font-medium">Player</th>
              <th className="px-4 py-3 font-medium">Games</th>
              {data.players[0].windows.map((w) => (
                <th key={w.days} className="px-4 py-3 text-right font-medium">
                  {w.days} days
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.players.map((p) => {
              const status = p.windows[p.windows.length - 1].status;
              return (
                <tr
                  key={p.playerId}
                  onClick={() => navigate(`/players/${p.playerId}`)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-4 py-3 font-medium">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${status ? STATUS_DOT[status] : "bg-border"}`} />
                      {p.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-text-dim">{sessionsLabel(p)}</td>
                  {p.windows.map((w) => (
                    <td key={w.days} className="px-4 py-3 text-right" title={`${w.load} vs ${w.matchLoad} load over ${w.games} games`}>
                      <FitnessPct w={w} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

/** One player's own numbers (their view, or the coach's player page). */
export function FitnessCard({ you, thresholds, asOf, title = "Fitness vs Match Group", coach = false }: {
  you: PlayerFitness;
  thresholds: { amber: number; red: number };
  asOf: string | null;
  title?: string;
  coach?: boolean; // a coach looking at a player (third person)
}) {
  const status = you.windows[you.windows.length - 1].status;
  const message =
    status === "red"
      ? `Well behind the players getting minutes.${coach ? " Needs extra fitness work." : " Top up your fitness work."}`
      : status === "amber"
        ? `A little behind the players getting minutes.${coach ? " Worth topping up." : " Keep topping up."}`
        : "On track with the players getting minutes.";
  return (
    <section>
      <SectionHeading title={title} subtitle={`${coach ? "Load" : "Your load"} as a % of what players getting minutes averaged in the same games${asOf ? ` (to ${asOf})` : ""}`} />
      <Card className="flex flex-wrap items-center gap-6">
        {you.windows.map((w) => (
          <div key={w.days} className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-text-dim">Last {w.days} days</span>
            <span className="text-3xl">
              <FitnessPct w={w} />
            </span>
            <span className="text-xs text-text-dim">
              {w.load} of {w.matchLoad} load · {w.games} game{w.games === 1 ? "" : "s"}
            </span>
          </div>
        ))}
        <div className="min-w-[200px] flex-1 text-sm">
          <p className={status ? STATUS_CLASS[status] : "text-text-dim"}>{message}</p>
          <p className="mt-1 text-xs text-text-dim">
            {sessionsLabel(you)}. Amber under {thresholds.amber}%, red under {thresholds.red}%. Load from warm-ups and fitness work counts.
          </p>
        </div>
      </Card>
    </section>
  );
}
