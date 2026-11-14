import { useNavigate } from "react-router-dom";
import { useTeamStats } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { PlayerPhoto } from "../components/PlayerPhoto";
import { SortTh } from "../components/SortTh";
import { TeamLogo } from "../components/TeamLogo";
import { formatDate } from "../lib/format";
import { useTableSort } from "../lib/useTableSort";
import { OpponentLink } from "../components/ncaa";
import type { TeamStatsGameLog, TeamStatsGoalkeeper, TeamStatsTopScorer } from "../types";

/** Yellow and red card marks (a dash when there are none). */
function CardMarks({ yellow, red }: { yellow: number; red: number }) {
  return (
    <>
      {yellow > 0 && <span className="mr-1 inline-block h-3 w-2.5 rounded-sm bg-gold" title={`${yellow} yellow`} />}
      {red > 0 && <span className="inline-block h-3 w-2.5 rounded-sm bg-owl-red" title={`${red} red`} />}
      {yellow === 0 && red === 0 && <span className="text-text-dim">—</span>}
    </>
  );
}

/** Red cards count for more, so the most carded games and players sort first. */
const cardScore = (yellow: number, red: number) => red * 10 + yellow;
/** Best result first: by goal difference. */
const goalDifference = (g: TeamStatsGameLog) => (g.status && g.team_score != null && g.opponent_score != null ? g.team_score - g.opponent_score : null);

function PlayerStatsTable({ players }: { players: TeamStatsTopScorer[] }) {
  const navigate = useNavigate();
  const { rows, sort, onSort } = useTableSort(players, {
    player: (p) => p.player_name,
    gp: (p) => p.games_played,
    gs: (p) => p.games_started,
    min: (p) => p.minutes,
    g: (p) => p.goals,
    a: (p) => p.assists,
    pts: (p) => p.points,
    sh: (p) => p.shots,
    sog: (p) => p.shots_on_goal,
    cards: (p) => cardScore(p.yellow_cards, p.red_cards),
  });
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
            <SortTh col="player" sort={sort} onSort={onSort}>
              Player
            </SortTh>
            <SortTh col="gp" sort={sort} onSort={onSort}>
              GP
            </SortTh>
            <SortTh col="gs" sort={sort} onSort={onSort}>
              GS
            </SortTh>
            <SortTh col="min" sort={sort} onSort={onSort}>
              Min
            </SortTh>
            <SortTh col="g" sort={sort} onSort={onSort}>
              G
            </SortTh>
            <SortTh col="a" sort={sort} onSort={onSort}>
              A
            </SortTh>
            <SortTh col="pts" sort={sort} onSort={onSort}>
              Pts
            </SortTh>
            <SortTh col="sh" sort={sort} onSort={onSort}>
              Sh
            </SortTh>
            <SortTh col="sog" sort={sort} onSort={onSort}>
              SOG
            </SortTh>
            <SortTh col="cards" sort={sort} onSort={onSort}>
              Cards
            </SortTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.player_id ?? `gk-${p.player_name}`}
              onClick={p.player_id ? () => navigate(`/players/${p.player_id}`) : undefined}
              className={`border-b border-border/60 last:border-0 ${p.player_id ? "cursor-pointer transition-colors hover:bg-surface-raised" : ""}`}
            >
              <td className="px-4 py-3 font-medium">
                <span className="flex items-center">
                  <PlayerPhoto name={p.player_name} url={p.photo_url} size={30} className="mr-2.5" />
                  {p.jersey_number && <span className="mr-2 text-xs font-normal text-text-dim">#{p.jersey_number}</span>}
                  {p.player_name}
                  {p.is_goalkeeper ? <span className="ml-2 text-xs font-normal text-text-dim">GK</span> : null}
                </span>
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
                <CardMarks yellow={p.yellow_cards} red={p.red_cards} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function GoalkeepingTable({ keepers }: { keepers: TeamStatsGoalkeeper[] }) {
  const gaa = (k: TeamStatsGoalkeeper) => (k.minutes > 0 ? (k.goals_allowed * 90) / k.minutes : null);
  const savePct = (k: TeamStatsGoalkeeper) => (k.saves + k.goals_allowed > 0 ? k.saves / (k.saves + k.goals_allowed) : null);
  const { rows, sort, onSort } = useTableSort(keepers, {
    player: (k) => k.player_name,
    gp: (k) => k.games_played,
    gs: (k) => k.games_started,
    min: (k) => k.minutes,
    saves: (k) => k.saves,
    ga: (k) => k.goals_allowed,
    gaa,
    savePct,
    shutouts: (k) => k.shutouts,
  });
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
            <SortTh col="player" sort={sort} onSort={onSort}>
              Goalkeeper
            </SortTh>
            <SortTh col="gp" sort={sort} onSort={onSort}>
              GP
            </SortTh>
            <SortTh col="gs" sort={sort} onSort={onSort}>
              GS
            </SortTh>
            <SortTh col="min" sort={sort} onSort={onSort}>
              Min
            </SortTh>
            <SortTh col="saves" sort={sort} onSort={onSort}>
              Saves
            </SortTh>
            <SortTh col="ga" sort={sort} onSort={onSort}>
              GA
            </SortTh>
            <SortTh col="gaa" sort={sort} onSort={onSort}>
              GAA
            </SortTh>
            <SortTh col="savePct" sort={sort} onSort={onSort}>
              Save %
            </SortTh>
            <SortTh col="shutouts" sort={sort} onSort={onSort}>
              Shutouts
            </SortTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((k) => {
            const pct = savePct(k);
            const avg = gaa(k);
            return (
              <tr key={k.player_name} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 font-medium">
                  <span className="flex items-center">
                    <PlayerPhoto name={k.player_name} url={k.photo_url} size={30} className="mr-2.5" />
                    {k.jersey_number && <span className="mr-2 text-xs font-normal text-text-dim">#{k.jersey_number}</span>}
                    {k.player_name}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-dim">{k.games_played}</td>
                <td className="px-4 py-3 text-text-dim">{k.games_started}</td>
                <td className="px-4 py-3 text-text-dim">{k.minutes}</td>
                <td className="px-4 py-3 font-semibold text-teal">{k.saves}</td>
                <td className="px-4 py-3">{k.goals_allowed}</td>
                <td className="px-4 py-3">{avg !== null ? avg.toFixed(2) : "—"}</td>
                <td className="px-4 py-3">{pct !== null ? `${Math.round(pct * 100)}%` : "—"}</td>
                <td className="px-4 py-3">{k.shutouts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function GameLogTable({ games }: { games: TeamStatsGameLog[] }) {
  const { rows, sort, onSort } = useTableSort(games, {
    date: (g) => g.game_date,
    opponent: (g) => g.opponent,
    result: goalDifference,
    g: (g) => g.goals,
    a: (g) => g.assists,
    sh: (g) => g.shots,
    sog: (g) => g.shots_on_goal,
    corners: (g) => g.corners,
    fouls: (g) => g.fouls,
    cards: (g) => cardScore(g.yellow_cards, g.red_cards),
  });
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[720px] text-sm">
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
            <SortTh col="g" sort={sort} onSort={onSort}>
              G
            </SortTh>
            <SortTh col="a" sort={sort} onSort={onSort}>
              A
            </SortTh>
            <SortTh col="sh" sort={sort} onSort={onSort}>
              Sh
            </SortTh>
            <SortTh col="sog" sort={sort} onSort={onSort}>
              SOG
            </SortTh>
            <SortTh col="corners" sort={sort} onSort={onSort}>
              Corners
            </SortTh>
            <SortTh col="fouls" sort={sort} onSort={onSort}>
              Fouls
            </SortTh>
            <SortTh col="cards" sort={sort} onSort={onSort}>
              Cards
            </SortTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.schedule_game_id} className="border-b border-border/60 last:border-0">
              <td className="px-4 py-3 text-text-dim">{formatDate(g.game_date)}</td>
              <td className="px-4 py-3 font-medium">
                <span className="flex items-center gap-2">
                  <TeamLogo name={g.opponent} url={g.opponent_logo_url} size="sm" />
                  <OpponentLink date={g.game_date}>{g.opponent}</OpponentLink>
                </span>
              </td>
              <td className="px-4 py-3 text-text-dim">{g.status ? `${g.status} ${g.team_score}-${g.opponent_score}` : "—"}</td>
              <td className="px-4 py-3">{g.goals}</td>
              <td className="px-4 py-3">{g.assists}</td>
              <td className="px-4 py-3 text-text-dim">{g.shots}</td>
              <td className="px-4 py-3 text-text-dim">{g.shots_on_goal}</td>
              <td className="px-4 py-3 text-text-dim">{g.corners}</td>
              <td className="px-4 py-3 text-text-dim">{g.fouls}</td>
              <td className="px-4 py-3">
                <CardMarks yellow={g.yellow_cards} red={g.red_cards} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function TeamStatsView() {
  const { data, isLoading } = useTeamStats();

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
        <SectionHeading title="Player Stats" subtitle="Every player on the roster, points leaders first. Click a column to sort it." />
        <PlayerStatsTable players={data.topScorers} />
      </section>

      {data.goalkeepers && data.goalkeepers.length > 0 && (
        <section>
          <SectionHeading title="Goalkeeping" subtitle="Every keeper on the roster, from the box scores (keepers don't wear trackers)" />
          <GoalkeepingTable keepers={data.goalkeepers} />
        </section>
      )}

      <section>
        <SectionHeading title="Game-by-Game" subtitle="Team box score totals for each completed game" />
        <GameLogTable games={data.gameLog} />
      </section>
    </div>
  );
}
