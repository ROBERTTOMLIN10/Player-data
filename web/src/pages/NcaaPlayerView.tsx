import { Link, useNavigate, useParams } from "react-router-dom";
import { useNcaaPlayer } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { gamePath, TeamLink } from "../components/ncaa";
import { PlayerProfileHeader } from "../components/PlayerProfileHeader";
import { TeamLogo } from "../components/TeamLogo";
import { formatDate } from "../lib/format";
import type { PlayerProfile } from "../types";

const val = (v: unknown, digits = 0) =>
  v === null || v === undefined || v === "" ? "—" : typeof v === "number" && digits ? v.toFixed(digits) : String(v);

/** A D1 player's page: bio, season stats, national rankings and game log. */
export default function NcaaPlayerView() {
  const { seo, key } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useNcaaPlayer(seo, key);
  if (isLoading) return <div className="py-20 text-center text-text-dim">Loading player…</div>;
  if (error || !data) return <Card className="text-sm text-text-dim">Player not found.</Card>;

  const { team, stats, games, national } = data;
  const keeper = Boolean(stats?.is_goalkeeper);
  const fieldTiles: [string, unknown][] = stats
    ? [
        ["Games", stats.gp],
        ["Starts", stats.gs],
        ["Minutes", stats.minutes],
        ["Goals", stats.goals],
        ["Assists", stats.assists],
        ["Points", stats.points],
        ["Shots", stats.shots],
        ["On target", stats.shots_on_goal],
        ["Yellow", stats.yellow_cards],
        ["Red", stats.red_cards],
      ]
    : Object.entries(data.ncaaStats ?? {});
  const keeperTiles: [string, unknown][] = keeper
    ? [
        ["Saves", stats?.saves],
        ["Goals against", stats?.goals_allowed],
        ["GAA", typeof stats?.gaa === "number" ? stats.gaa.toFixed(2) : stats?.gaa],
        ["Save %", typeof stats?.save_pct === "number" ? `${Math.round(stats.save_pct * 100)}%` : null],
        ["Shutouts", stats?.shutouts],
        ["W-L-T", stats?.wins !== undefined && stats?.wins !== null ? `${stats.wins}-${stats.losses}-${stats.ties}` : null],
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => navigate(-1)} className="text-sm text-text-dim hover:text-owl-red">
          ← Back
        </button>
        <span className="flex items-center gap-2 text-sm font-medium">
          <TeamLogo name={team.name} url={team.logo} size="sm" />
          <TeamLink seo={team.seo}>{team.name}</TeamLink>
        </span>
      </div>

      <PlayerProfileHeader
        name={data.name}
        jersey={data.profile?.jersey_number ?? null}
        profile={data.profile as PlayerProfile | null}
        subtitle={[team.name, team.conference].filter(Boolean).join(" · ")}
        bioLabel={`${team.name} bio`}
      />

      {data.source === "ncaa" && (
        <Card className="text-sm text-text-dim">
          We don't read {team.name}'s roster yet, so this profile uses NCAA.com's national leader tables. Full profiles (photo, bio, every
          stat, game log) come as more teams are added.
        </Card>
      )}

      <section>
        <SectionHeading title="Season Stats" subtitle={data.source === "team" ? `From the ${team.name} athletics website` : "From NCAA.com"} />
        {fieldTiles.length === 0 ? (
          <Card className="text-sm text-text-dim">No stats yet this season.</Card>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[...keeperTiles, ...fieldTiles].map(([label, v]) => (
              <Card key={label} className="p-3 text-center">
                <div className="font-display text-xl font-semibold">{val(v)}</div>
                <div className="text-[11px] uppercase tracking-wide text-text-dim">{label}</div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {national.length > 0 && (
        <section>
          <SectionHeading title="National Rankings" subtitle="Where they rank among D1 players on NCAA.com" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {national.map((n) => (
              <Card key={n.category} className="p-3">
                <div className="text-[11px] uppercase tracking-wide text-text-dim">{n.category}</div>
                <div className="mt-1 font-display text-xl font-semibold">
                  #{n.rank} <span className="text-sm font-normal text-text-dim">({n.value})</span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {data.source === "team" && (
        <section>
          <SectionHeading title="Game Log" subtitle={games.length ? "Every game they got on the pitch, from the box scores" : undefined} />
          {games.length === 0 ? (
            <Card className="text-sm text-text-dim">
              {team.covered ? "No appearances yet (or this team's box scores aren't read yet)." : "No game log for this team yet."}
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[620px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-dim">
                    <th className="px-3 py-2.5 font-medium">Date</th>
                    <th className="px-2 py-2.5 font-medium">Opponent</th>
                    <th className="px-2 py-2.5 font-medium">Result</th>
                    <th className="px-2 py-2.5 text-center font-medium">Min</th>
                    {keeper ? (
                      <>
                        <th className="px-2 py-2.5 text-center font-medium">Saves</th>
                        <th className="px-2 py-2.5 text-center font-medium">GA</th>
                      </>
                    ) : (
                      <>
                        <th className="px-2 py-2.5 text-center font-medium">G</th>
                        <th className="px-2 py-2.5 text-center font-medium">A</th>
                        <th className="px-2 py-2.5 text-center font-medium">Sh</th>
                        <th className="px-2 py-2.5 text-center font-medium">SOG</th>
                      </>
                    )}
                    <th className="px-2 py-2.5 text-center font-medium">Cards</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => (
                    <tr key={`${g.game_date}-${g.opponent}`} className="border-b border-border/60 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-text-dim">{formatDate(g.game_date)}</td>
                      <td className="whitespace-nowrap px-2 py-2 font-medium">
                        <span className="mr-1 text-xs font-normal text-text-dim">{g.home_away === "home" ? "vs" : "@"}</span>
                        <TeamLink seo={g.opponent_seo}>{g.opponent}</TeamLink>
                        {g.started === 1 && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-teal">GS</span>}
                      </td>
                      <td className={`whitespace-nowrap px-2 py-2 font-semibold ${g.result?.startsWith("W") ? "text-teal" : g.result?.startsWith("L") ? "text-owl-red-light" : "text-text-dim"}`}>
                        {g.game_id ? (
                          <Link to={gamePath(g.game_id)} className="hover:underline" title="Match stats">
                            {g.result ?? "—"}
                          </Link>
                        ) : (
                          (g.result ?? "—")
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">{val(g.minutes)}</td>
                      {keeper ? (
                        <>
                          <td className="px-2 py-2 text-center">{val(g.saves)}</td>
                          <td className="px-2 py-2 text-center">{val(g.goals_allowed)}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-2 text-center">{val(g.goals)}</td>
                          <td className="px-2 py-2 text-center">{val(g.assists)}</td>
                          <td className="px-2 py-2 text-center text-text-dim">{val(g.shots)}</td>
                          <td className="px-2 py-2 text-center text-text-dim">{val(g.shots_on_goal)}</td>
                        </>
                      )}
                      <td className="px-2 py-2 text-center">
                        {(g.yellow_cards ?? 0) > 0 && <span className="mr-1 inline-block h-3 w-2.5 rounded-sm bg-gold" title="Yellow" />}
                        {(g.red_cards ?? 0) > 0 && <span className="inline-block h-3 w-2.5 rounded-sm bg-owl-red" title="Red" />}
                        {!g.yellow_cards && !g.red_cards && <span className="text-text-dim">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
