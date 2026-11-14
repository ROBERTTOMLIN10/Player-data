import { useMemo } from "react";
import { Card } from "./Card";
import { SortTh } from "./SortTh";
import { TeamLogo } from "./TeamLogo";
import { OpponentLink } from "./ncaa";
import { formatDate } from "../lib/format";
import { useTableSort } from "../lib/useTableSort";
import type { PlayerGameStat } from "../types";

/**
 * A player's box-score line for every game. Click a column to sort it highest to lowest
 * (click again to flip); until then the games stay in date order.
 */
export function MatchStatsTable({ games, compact = false, newestFirst = false }: { games: PlayerGameStat[]; compact?: boolean; newestFirst?: boolean }) {
  const ordered = useMemo(() => (newestFirst ? [...games].reverse() : games), [games, newestFirst]);
  const { rows, sort, onSort } = useTableSort(ordered, {
    date: (g) => g.game_date,
    opponent: (g) => g.opponent,
    // Best result first: by goal difference.
    result: (g) => (g.status && g.team_score != null && g.opponent_score != null ? g.team_score - g.opponent_score : null),
    minutes: (g) => g.minutes,
    goals: (g) => g.goals,
    assists: (g) => g.assists,
    points: (g) => g.points,
    shots: (g) => g.shots,
    sog: (g) => g.shots_on_goal,
    cards: (g) => g.red_cards * 10 + g.yellow_cards,
  });
  return (
    <Card className="overflow-x-auto p-0">
      <table className={`w-full text-sm ${compact ? "min-w-[420px]" : "min-w-[640px]"}`}>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
            <SortTh col="date" sort={sort} onSort={onSort}>
              Date
            </SortTh>
            <SortTh col="opponent" sort={sort} onSort={onSort}>
              Opponent
            </SortTh>
            <SortTh col="result" sort={sort} onSort={onSort}>
              Result
            </SortTh>
            <SortTh col="minutes" sort={sort} onSort={onSort}>
              Min
            </SortTh>
            <SortTh col="goals" sort={sort} onSort={onSort}>
              G
            </SortTh>
            <SortTh col="assists" sort={sort} onSort={onSort}>
              A
            </SortTh>
            {!compact && (
              <>
                <SortTh col="points" sort={sort} onSort={onSort}>
                  Pts
                </SortTh>
                <SortTh col="shots" sort={sort} onSort={onSort}>
                  Sh
                </SortTh>
                <SortTh col="sog" sort={sort} onSort={onSort}>
                  SOG
                </SortTh>
                <SortTh col="cards" sort={sort} onSort={onSort}>
                  Cards
                </SortTh>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id} className="border-b border-border/60 last:border-0">
              <td className="px-4 py-3 text-text-dim">{formatDate(g.game_date)}</td>
              <td className="px-4 py-3 font-medium">
                <span className="flex items-center gap-2">
                  <TeamLogo name={g.opponent} url={g.opponent_logo_url} size="sm" />
                  <OpponentLink date={g.game_date}>{g.opponent}</OpponentLink>
                </span>
              </td>
              <td className="px-4 py-3 text-text-dim">{g.status ? `${g.status} ${g.team_score}-${g.opponent_score}` : "—"}</td>
              <td className="whitespace-nowrap px-4 py-3">
                {g.minutes ? `${g.minutes}'` : <span className="text-text-dim">DNP</span>}
                {g.started === 1 && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-teal">GS</span>}
              </td>
              <td className="px-4 py-3">{g.goals}</td>
              <td className="px-4 py-3">{g.assists}</td>
              {!compact && (
                <>
                  <td className="px-4 py-3">{g.points}</td>
                  <td className="px-4 py-3 text-text-dim">{g.shots}</td>
                  <td className="px-4 py-3 text-text-dim">{g.shots_on_goal}</td>
                  <td className="px-4 py-3">
                    {g.yellow_cards > 0 && <span className="mr-1 inline-block h-3 w-2.5 rounded-sm bg-gold" title={`${g.yellow_cards} yellow`} />}
                    {g.red_cards > 0 && <span className="inline-block h-3 w-2.5 rounded-sm bg-owl-red" title={`${g.red_cards} red`} />}
                    {g.yellow_cards === 0 && g.red_cards === 0 && <span className="text-text-dim">—</span>}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
