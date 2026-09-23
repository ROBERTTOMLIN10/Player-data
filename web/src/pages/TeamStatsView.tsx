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
        <SectionHeading title="Top Scorers" subtitle="Season goals/assists/points leaders" />
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 font-medium">GP</th>
                <th className="px-4 py-3 font-medium">G</th>
                <th className="px-4 py-3 font-medium">A</th>
                <th className="px-4 py-3 font-medium">Pts</th>
                <th className="px-4 py-3 font-medium">Cards</th>
              </tr>
            </thead>
            <tbody>
              {data.topScorers
                .filter((p) => p.points > 0 || p.yellow_cards > 0 || p.red_cards > 0)
                .map((p) => (
                  <tr
                    key={p.player_id}
                    onClick={() => navigate(`/players/${p.player_id}`)}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised"
                  >
                    <td className="px-4 py-3 font-medium">{p.player_name}</td>
                    <td className="px-4 py-3 text-text-dim">{p.games_played}</td>
                    <td className="px-4 py-3">{p.goals}</td>
                    <td className="px-4 py-3">{p.assists}</td>
                    <td className="px-4 py-3 font-semibold text-teal">{p.points}</td>
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
