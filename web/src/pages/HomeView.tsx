import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useNcaaConference, useSchedule, useTeamStats } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { ScheduleCalendar } from "../components/ScheduleCalendar";
import { Segmented } from "../components/SeasonStats";
import { TeamLogo } from "../components/TeamLogo";
import { gamePath, NcaaStatTable, Rpi, StandingsTable, TeamLink, updatedLabel } from "../components/ncaa";
import { formatDateLong } from "../lib/format";
import type { ScheduleGame } from "../types";

function resultBadgeClass(status: string | null): string {
  if (status === "W") return "bg-teal/15 text-teal border-teal/40";
  if (status === "L") return "bg-owl-red/15 text-owl-red-light border-owl-red/40";
  if (status === "T") return "bg-gold/15 text-gold border-gold/40";
  return "bg-surface-raised text-text-dim border-border";
}

function OpponentLogo({ game }: { game: ScheduleGame }) {
  return <TeamLogo name={game.opponent} url={game.opponent_logo_url} />;
}

type UpcomingView = "list" | "calendar";
const VIEW_KEY = "home-upcoming-view";

/** List or calendar, remembered on this device. */
function useUpcomingView(): [UpcomingView, (v: UpcomingView) => void] {
  const [view, setView] = useState<UpcomingView>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "calendar" ? "calendar" : "list";
    } catch {
      return "list";
    }
  });
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem(VIEW_KEY, v);
      } catch {
        /* not remembered */
      }
    },
  ];
}

export default function HomeView() {
  const { data: schedule, isLoading: scheduleLoading } = useSchedule();
  const { data: teamStats } = useTeamStats();
  const [upcomingView, setUpcomingView] = useUpcomingView();

  const { upcoming, results, nextGame } = useMemo(() => {
    const games = schedule ?? [];
    const upcoming = games.filter((g) => !g.status).sort((a, b) => a.game_date.localeCompare(b.game_date));
    const results = games.filter((g) => g.status).sort((a, b) => b.game_date.localeCompare(a.game_date));
    return { upcoming, results, nextGame: upcoming[0] ?? null };
  }, [schedule]);

  const record = teamStats?.record;
  const recordLabel =
    record && (record.wins || record.losses || record.ties)
      ? `${record.wins ?? 0}-${record.losses ?? 0}${record.ties ? `-${record.ties}` : ""}`
      : "—";

  if (scheduleLoading) {
    return <div className="py-20 text-center text-text-dim">Loading schedule…</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <div className="text-xs font-medium uppercase tracking-wide text-text-dim">Season Record</div>
          <div className="mt-2 font-display text-3xl font-bold">{recordLabel}</div>
          <div className="mt-1 text-xs text-text-dim">Wins–Losses–Ties</div>
        </Card>

        <Card className="sm:col-span-2">
          <div className="text-xs font-medium uppercase tracking-wide text-text-dim">Next Game</div>
          {nextGame ? (
            <div className="mt-2 flex items-center gap-3">
              <OpponentLogo game={nextGame} />
              <div>
                <div className="font-display text-lg font-semibold">
                  {nextGame.home_away === "A" ? "at " : "vs "}
                  <TeamLink seo={nextGame.opponent_seo}>{nextGame.opponent}</TeamLink>
                  <Rpi seo={nextGame.opponent_seo} className="text-xs" />
                </div>
                <div className="text-sm text-text-dim">
                  {formatDateLong(nextGame.game_date)}
                  {nextGame.game_time ? ` · ${nextGame.game_time}` : ""}
                  {nextGame.location ? ` · ${nextGame.location}` : ""}
                </div>
                {nextGame.ncaa_game_id && (
                  <Link to={gamePath(nextGame.ncaa_game_id)} className="mt-1 inline-block text-xs text-teal hover:underline">
                    Game preview ›
                  </Link>
                )}
              </div>
              {nextGame.is_conference === 1 && (
                <span className="ml-auto rounded-full border border-owl-red/40 bg-owl-red/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-owl-red-light">
                  Conference
                </span>
              )}
            </div>
          ) : (
            <div className="mt-2 text-sm text-text-dim">No upcoming games scheduled.</div>
          )}
        </Card>
      </section>

      <ConferenceSection />

      <section>
        <div className="flex flex-wrap items-end justify-between gap-x-4">
          <SectionHeading title="Upcoming Games" subtitle="Rest of the season schedule" />
          <div className="mb-3">
            <Segmented
              value={upcomingView}
              options={[
                { key: "list", label: "List" },
                { key: "calendar", label: "Calendar" },
              ]}
              onChange={setUpcomingView}
              label="Upcoming games view"
            />
          </div>
        </div>
        {upcoming.length === 0 ? (
          <Card className="text-center text-sm text-text-dim">No upcoming games on the published schedule yet.</Card>
        ) : upcomingView === "calendar" ? (
          <ScheduleCalendar games={schedule ?? []} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((g) => (
              <GameCardLink key={g.id} game={g}>
                <OpponentLogo game={g} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {g.home_away === "A" ? "at " : "vs "}
                    <TeamLink seo={g.opponent_seo}>{g.opponent}</TeamLink>
                    <Rpi seo={g.opponent_seo} />
                  </div>
                  <div className="truncate text-xs text-text-dim">
                    {formatDateLong(g.game_date)}
                    {g.game_time ? ` · ${g.game_time}` : ""}
                  </div>
                  {g.location && <div className="truncate text-xs text-text-dim">{g.location}</div>}
                </div>
                {g.is_conference === 1 && (
                  <span className="shrink-0 rounded-full border border-owl-red/40 bg-owl-red/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-owl-red-light">
                    Conf
                  </span>
                )}
              </GameCardLink>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeading title="Previous Results" subtitle="Most recent first" />
        {results.length === 0 ? (
          <Card className="text-center text-sm text-text-dim">No completed games yet this season.</Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Opponent</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((g) => (
                  <tr key={g.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 text-text-dim">{formatDateLong(g.game_date)}</td>
                    <td className="px-4 py-3 font-medium">
                      <span className="flex items-center gap-2">
                        <TeamLogo name={g.opponent} url={g.opponent_logo_url} size="sm" />
                        <span>
                          {g.home_away === "A" ? "at " : "vs "}
                          <TeamLink seo={g.opponent_seo}>{g.opponent}</TeamLink>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${resultBadgeClass(g.status)}`}>
                        {g.status ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-dim">
                      {g.team_score != null && g.opponent_score != null ? `${g.team_score}–${g.opponent_score}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {g.ncaa_game_id && (
                        <Link to={gamePath(g.ncaa_game_id)} className="mr-3 text-xs font-medium text-owl-red-light hover:underline">
                          Match stats ›
                        </Link>
                      )}
                      {g.boxscore_url && (
                        <a
                          href={g.boxscore_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-teal hover:underline"
                        >
                          Box Score ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}

/** An upcoming game as a card that opens its game page (the opponent's name still opens their team page). */
function GameCardLink({ game, children }: { game: ScheduleGame; children: React.ReactNode }) {
  const navigate = useNavigate();
  const to = game.ncaa_game_id ? gamePath(game.ncaa_game_id) : null;
  return (
    <div
      role={to ? "link" : undefined}
      tabIndex={to ? 0 : undefined}
      onClick={() => to && navigate(to)}
      onKeyDown={(e) => to && e.key === "Enter" && navigate(to)}
      className={`flex items-center gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5 ${to ? "cursor-pointer transition-colors hover:border-owl-red/60" : ""}`}
    >
      {children}
    </div>
  );
}

/** American Conference standings (calculated from results) and stat leaders, from NCAA.com. */
function ConferenceSection() {
  const { data } = useNcaaConference("american");
  if (!data) return null;
  const hasStandings = data.standings.length > 0;
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading
        title={data.name}
        subtitle="Conference standings and stats across every team · from NCAA.com"
      />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="p-2 sm:p-3">
          <div className="px-2 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-text-dim">Standings</div>
          {hasStandings ? (
            <StandingsTable rows={data.standings} ourTeam={data.ourTeam} compact />
          ) : (
            <div className="py-8 text-center text-sm text-text-dim">Standings appear once results have loaded.</div>
          )}
          <p className="px-2 pt-2 text-[11px] text-text-dim">Conference games only · 3 pts win, 1 pt tie · arrows: movement since the last round of games</p>
        </Card>
        <div className="flex flex-col gap-4">
          {data.playerLeaders.slice(0, 1).map((t) => (
            <Card key={t.label} className="p-2 sm:p-3">
              <div className="px-2 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-text-dim">{t.label} · conference</div>
              <NcaaStatTable table={t} ourTeam={data.ourTeam} limit={8} hideColumns={["Rank", "Cl"]} />
            </Card>
          ))}
        </div>
      </div>
      {(data.teamStats.length > 0 || data.playerLeaders.length > 1) && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...data.playerLeaders.slice(1), ...data.teamStats].map((t) => (
            <Card key={t.label} className="p-2 sm:p-3">
              <div className="px-2 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-text-dim">{t.label}</div>
              <NcaaStatTable table={t} ourTeam={data.ourTeam} limit={10} hideColumns={["Rank", "Cl"]} />
            </Card>
          ))}
        </div>
      )}
      {data.teamStats[0]?.updatedAt && <p className="text-[11px] text-text-dim">{updatedLabel(data.teamStats[0].updatedAt)}</p>}
    </section>
  );
}
