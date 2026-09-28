import { useNavigate } from "react-router-dom";
import { useTeamStats } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { TeamLogo } from "../components/TeamLogo";
import { formatDate } from "../lib/format";

export default function TeamStatsView() {
  const { data, isLoading } = useTeamStats();
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="py-20 text-center text-text-dim">Loading team stats…</div>;
  }

  if (!data || data.gameLog.length === 0) {
    return (
      <Card className="mx-auto mt-10 max-w-lg text-center">
        <p className="text-text-dim">
          No game stats yet. Use the <code className="text-teal">Data</code> tab to run “Sync Schedule &amp; Game
          Stats” once fausports.com has published a box score for a completed game.
        </p>
      </Card>
    );
  }

  const totals = data.seasonTotals;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeading title="Season Totals" subtitle="Team goals, assists, and discipline across all games" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {[
            { label: "Goals", value: totals.goals },
            { label: "Assists", value: totals.assists },
            { label: "Points", value: totals.points },
            { label: "Shots", value: totals.shots },
            { label: "SOG", value: totals.shots_on_goal },
            { label: "Fouls", value: totals.fouls },
            { label: "Yellow", value: totals.yellow_cards },
            { label: "Red", value: totals.red_cards },
          ].map((stat) => (
            <Card key={stat.label} className="p-3 text-center">
              <div className="font-display text-xl font-semibold">{stat.value}</div>
              <div className="text-xs uppercase tracking-wide text-text-dim">{stat.label}</div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading title="Player Stats" subtitle="Every player on the roster, points leaders first" />
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 font-medium">GP</th>
                <th className="px-4 py-3 font-medium">GS</th>
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
              {data.topScorers
                .map((p) => (
                  <tr
                    key={p.player_id ?? `gk-${p.player_name}`}
                    onClick={p.player_id ? () => navigate(`/players/${p.player_id}`) : undefined}
                    className={`border-b border-border/60 last:border-0 ${p.player_id ? "cursor-pointer transition-colors hover:bg-surface-raised" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium">
                      {p.player_name}
                      {p.is_goalkeeper ? <span className="ml-2 text-xs font-normal text-text-dim">GK</span> : null}
                    </td>
                    <td className="px-4 py-3 text-text-dim">{p.games_played}</td>
                    <td className="px-4 py-3 text-text-dim">{p.games_started}</td>
                    <td className="px-4 py-3 text-text-dim">{p.minutes}</td>
                    <td className="px-4 py-3">{p.goals}</td>
                    <td className="px-4 py-3">{p.assists}</td>
                    <td className="px-4 py-3 font-semibold text-teal">{p.points}</td>
                    <td className="px-4 py-3 text-text-dim">{p.shots}</td>
                    <td className="px-4 py-3 text-text-dim">{p.shots_on_goal}</td>
                    <td className="px-4 py-3">
                      {p.yellow_cards > 0 && (
                        <span className="mr-1 inline-block h-3 w-2.5 rounded-sm bg-gold" title={`${p.yellow_cards} yellow`} />
                      )}
                      {p.red_cards > 0 && (
                        <span className="inline-block h-3 w-2.5 rounded-sm bg-owl-red" title={`${p.red_cards} red`} />
                      )}
                      {p.yellow_cards === 0 && p.red_cards === 0 && <span className="text-text-dim">—</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      </section>

      {data.goalkeepers && data.goalkeepers.length > 0 && (
        <section>
          <SectionHeading title="Goalkeeping" subtitle="Every keeper on the roster, from the box scores (keepers don't wear trackers)" />
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-medium">Goalkeeper</th>
                  <th className="px-4 py-3 font-medium">GP</th>
                  <th className="px-4 py-3 font-medium">GS</th>
                  <th className="px-4 py-3 font-medium">Min</th>
                  <th className="px-4 py-3 font-medium">Saves</th>
                  <th className="px-4 py-3 font-medium">GA</th>
                  <th className="px-4 py-3 font-medium">GAA</th>
                  <th className="px-4 py-3 font-medium">Save %</th>
                  <th className="px-4 py-3 font-medium">Shutouts</th>
                </tr>
              </thead>
              <tbody>
                {data.goalkeepers.map((k) => {
                  const faced = k.saves + k.goals_allowed;
                  return (
                    <tr key={k.player_name} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {k.jersey_number && <span className="mr-2 text-xs font-normal text-text-dim">#{k.jersey_number}</span>}
                        {k.player_name}
                      </td>
                      <td className="px-4 py-3 text-text-dim">{k.games_played}</td>
                      <td className="px-4 py-3 text-text-dim">{k.games_started}</td>
                      <td className="px-4 py-3 text-text-dim">{k.minutes}</td>
                      <td className="px-4 py-3 font-semibold text-teal">{k.saves}</td>
                      <td className="px-4 py-3">{k.goals_allowed}</td>
                      <td className="px-4 py-3">{k.minutes > 0 ? ((k.goals_allowed * 90) / k.minutes).toFixed(2) : "—"}</td>
                      <td className="px-4 py-3">{faced > 0 ? `${Math.round((k.saves / faced) * 100)}%` : "—"}</td>
                      <td className="px-4 py-3">{k.shutouts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      <section>
        <SectionHeading title="Game-by-Game" subtitle="Team box score totals for each completed game" />
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Opponent</th>
                <th className="px-4 py-3 font-medium">Result</th>
                <th className="px-4 py-3 font-medium">G</th>
                <th className="px-4 py-3 font-medium">A</th>
                <th className="px-4 py-3 font-medium">Sh</th>
                <th className="px-4 py-3 font-medium">SOG</th>
                <th className="px-4 py-3 font-medium">Corners</th>
                <th className="px-4 py-3 font-medium">Fouls</th>
                <th className="px-4 py-3 font-medium">Cards</th>
              </tr>
            </thead>
            <tbody>
              {data.gameLog.map((g) => (
                <tr key={g.schedule_game_id} className="border-b border-border/60 last:border-0">
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
                  <td className="px-4 py-3">{g.goals}</td>
                  <td className="px-4 py-3">{g.assists}</td>
                  <td className="px-4 py-3 text-text-dim">{g.shots}</td>
                  <td className="px-4 py-3 text-text-dim">{g.shots_on_goal}</td>
                  <td className="px-4 py-3 text-text-dim">{g.corners}</td>
                  <td className="px-4 py-3 text-text-dim">{g.fouls}</td>
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
    </div>
  );
}
