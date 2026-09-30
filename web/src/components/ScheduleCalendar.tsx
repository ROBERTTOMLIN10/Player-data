import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "./Card";
import { gamePath, TeamLink } from "./ncaa";
import { TeamLogo } from "./TeamLogo";
import { formatDateLong } from "../lib/format";
import type { ScheduleGame } from "../types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthKey = (iso: string) => iso.slice(0, 7);
const pad = (n: number) => String(n).padStart(2, "0");
const sideLabel = (g: ScheduleGame) => (g.home_away === "A" ? "Away" : g.home_away === "N" ? "Neutral" : "Home");

function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/**
 * The schedule as a month grid: upcoming games stand out with the opponent's
 * logo, Home/Away and kick-off time; games already played show faded with
 * their result. Tap a game day for the details underneath.
 */
export function ScheduleCalendar({ games }: { games: ScheduleGame[] }) {
  const byDate = useMemo(() => {
    const m = new Map<string, ScheduleGame[]>();
    for (const g of games) m.set(g.game_date.slice(0, 10), [...(m.get(g.game_date.slice(0, 10)) ?? []), g]);
    return m;
  }, [games]);
  const months = useMemo(() => [...new Set(games.map((g) => monthKey(g.game_date)))].sort(), [games]);
  const firstUpcoming = games.filter((g) => !g.status).sort((a, b) => a.game_date.localeCompare(b.game_date))[0];
  const [month, setMonth] = useState(() => (firstUpcoming ? monthKey(firstUpcoming.game_date) : months[months.length - 1] ?? new Date().toISOString().slice(0, 7)));
  const [selected, setSelected] = useState<string | null>(firstUpcoming?.game_date.slice(0, 10) ?? null);

  const [y, m] = month.split("-").map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  const today = new Date().toLocaleDateString("en-CA");
  const canPrev = months.length > 0 && month > months[0];
  const canNext = months.length > 0 && month < months[months.length - 1];
  const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const inMonth = games.filter((g) => monthKey(g.game_date) === month && !g.status).length;
  const picked = selected && monthKey(selected) === month ? byDate.get(selected) ?? [] : [];

  return (
    <Card className="p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          onClick={() => setMonth(shiftMonth(month, -1))}
          disabled={!canPrev}
          aria-label="Previous month"
          className="rounded-md border border-border px-2.5 py-1 text-sm text-text-dim hover:text-text disabled:opacity-30"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="font-display text-base font-semibold sm:text-lg">{title}</div>
          <div className="text-[11px] text-text-dim">{inMonth ? `${inMonth} upcoming game${inMonth === 1 ? "" : "s"}` : "No upcoming games this month"}</div>
        </div>
        <button
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={!canNext}
          aria-label="Next month"
          className="rounded-md border border-border px-2.5 py-1 text-sm text-text-dim hover:text-text disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-text-dim sm:text-[11px]">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1">
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const dayGames = byDate.get(date) ?? [];
          const g = dayGames[0];
          const played = g?.status;
          const isSel = selected === date && dayGames.length > 0;
          return (
            <button
              key={date}
              disabled={!g}
              onClick={() => setSelected(date)}
              className={`flex min-h-14 flex-col items-center gap-0.5 rounded-lg border p-1 text-left normal-case tracking-normal sm:min-h-24 sm:p-1.5 ${
                !g
                  ? "border-transparent"
                  : played
                    ? "border-border/60 bg-surface-raised/40 opacity-60 hover:opacity-100"
                    : g.home_away === "A"
                      ? "border-border bg-surface-raised hover:border-owl-red/60"
                      : "border-owl-red/40 bg-owl-red/10 hover:border-owl-red"
              } ${isSel ? "ring-2 ring-owl-red" : ""}`}
            >
              <span className={`self-start text-[11px] tabular-nums ${date === today ? "rounded-full bg-owl-red px-1.5 font-semibold text-white" : "text-text-dim"}`}>
                {Number(date.slice(8))}
              </span>
              {g && (
                <>
                  <TeamLogo name={g.opponent} url={g.opponent_logo_url} size="sm" />
                  <span className="hidden w-full truncate text-center text-[11px] font-medium text-text sm:block">
                    {g.home_away === "A" ? "at " : "vs "}
                    {g.opponent}
                  </span>
                  <span className="w-full truncate text-center text-[10px] text-text-dim">
                    {played ? (
                      <span className={played === "W" ? "text-teal" : played === "L" ? "text-owl-red-light" : "text-gold"}>
                        {played}
                        <span className="hidden sm:inline">{g.team_score != null && g.opponent_score != null ? ` ${g.team_score}–${g.opponent_score}` : ""}</span>
                      </span>
                    ) : (
                      <>
                        <span className="sm:hidden">{g.home_away === "A" ? "A" : g.home_away === "N" ? "N" : "H"}</span>
                        <span className="hidden sm:inline">
                          {sideLabel(g)}
                          {g.game_time ? ` · ${g.game_time}` : ""}
                        </span>
                      </>
                    )}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-owl-red/40 bg-owl-red/10" /> Home
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-border bg-surface-raised" /> Away / Neutral
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-border/60 bg-surface-raised/40 opacity-60" /> Played
        </span>
      </div>

      {picked.map((g) => (
        <div key={g.id} className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-surface-raised/50 p-3">
          <TeamLogo name={g.opponent} url={g.opponent_logo_url} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">
              {g.home_away === "A" ? "at " : "vs "}
              <TeamLink seo={g.opponent_seo}>{g.opponent}</TeamLink>
            </div>
            <div className="truncate text-xs text-text-dim">
              {formatDateLong(g.game_date)}
              {g.game_time ? ` · ${g.game_time}` : ""} · {sideLabel(g)}
            </div>
            {g.location && <div className="truncate text-xs text-text-dim">{g.location}</div>}
            {g.ncaa_game_id && (
              <Link to={gamePath(g.ncaa_game_id)} className="mt-1 inline-block text-xs font-medium text-owl-red-light hover:underline">
                {g.status ? "Match stats ›" : "Game preview ›"}
              </Link>
            )}
          </div>
          {g.status ? (
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {g.status} {g.team_score != null && g.opponent_score != null ? `${g.team_score}–${g.opponent_score}` : ""}
            </span>
          ) : (
            g.is_conference === 1 && (
              <span className="shrink-0 rounded-full border border-owl-red/40 bg-owl-red/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-owl-red-light">
                Conf
              </span>
            )
          )}
        </div>
      ))}
    </Card>
  );
}
