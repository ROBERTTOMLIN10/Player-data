import { useMemo } from "react";
import { useNcaaConference, useSchedule, useTeamStats } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { TeamLogo } from "../components/TeamLogo";
import { NcaaStatTable, StandingsTable, updatedLabel } from "../components/ncaa";
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

export default function HomeView() {
  const { data: schedule, isLoading: scheduleLoading } = useSchedule();
  const { data: teamStats } = useTeamStats();

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
                  {nextGame.home_away === "A" ? "at " : nextGame.home_away === "N" ? "vs " : "vs "}
                  {nextGame.opponent}
                </div>
                <div className="text-sm text-text-dim">
                  {formatDateLong(nextGame.game_date)}
                  {nextGame.game_time ? ` · ${nextGame.game_time}` : ""}
                  {nextGame.location ? ` · ${nextGame.location}` : ""}
                </div>
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
        <SectionHeading title="Upcoming Games" subtitle="Rest of the season schedule" />
        {upcoming.length === 0 ? (
          <Card className="text-center text-sm text-text-dim">No upcoming games on the published schedule yet.</Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((g) => (
              <Card key={g.id} className="flex items-center gap-3">
                <OpponentLogo game={g} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {g.home_away === "A" ? "at " : "vs "}
                    {g.opponent}
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
              </Card>
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
                          {g.opponent}
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
                    <td className="px-4 py-3 text-right">
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
