import { Link, useNavigate, useParams } from "react-router-dom";
import { useNcaaTeam } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { gamePath, NationalRank, playerPath, TeamLink, updatedLabel } from "../components/ncaa";
import { PlayerPhoto } from "../components/PlayerPhoto";
import { TeamLogo } from "../components/TeamLogo";
import { formatDate } from "../lib/format";
import type { NcaaSquadPlayer } from "../types";

const dash = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "—" : digits ? v.toFixed(digits) : String(v));
const height = (p: NcaaSquadPlayer) => (p.height_feet ? `${p.height_feet}'${p.height_inches ?? 0}"` : "");

/** A D1 team's page: header, the whole squad (photos, numbers, stats) and the season's games. */
export default function NcaaTeamView() {
  const { seo } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useNcaaTeam(seo);
  if (isLoading) return <div className="py-20 text-center text-text-dim">Loading team…</div>;
  if (error || !data) return <Card className="text-sm text-text-dim">Team not found.</Card>;

  const { team, squad, games } = data;
  const field = squad; // everyone, keepers included
  const keepers = squad.filter((p) => p.is_goalkeeper || /^g/i.test(p.position_short ?? ""));
  const played = games.filter((g) => g.result);
  const upcoming = games.filter((g) => !g.result);

  return (
    <div className="flex flex-col gap-6">
      <button onClick={() => navigate(-1)} className="self-start text-sm text-text-dim hover:text-owl-red">
        ← Back
      </button>
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <TeamLogo name={team.name} url={team.logo} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-display text-2xl font-bold">{team.name}</h2>
            <NationalRank rpi={team.rpi} pollRank={team.pollRank} />
          </div>
          <p className="text-sm text-text-dim">
            {[team.conference, team.record && `${team.record} overall`, team.conferenceRecord && `${team.conferenceRecord} conference`, team.conferencePosition && `${ordinal(team.conferencePosition)} of ${team.conferenceTeams}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {team.site && (
            <a href={team.site} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-owl-red-light hover:underline">
              Team website ↗
            </a>
          )}
        </div>
      </Card>

      <section>
        <SectionHeading
          title="Squad"
          subtitle={team.covered ? `From the ${team.name} athletics website · ${updatedLabel(team.updatedAt)}` : "Squad details for this team aren't read yet"}
        />
        {squad.length === 0 ? (
          <Card className="text-sm text-text-dim">
            We don't read {team.name}'s roster yet (we're rolling out team by team). Their results are below, and any of their players in the national leader tables open a profile from NCAA.com.
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-dim">
                  <th className="sticky left-0 z-10 bg-surface px-3 py-2.5 font-medium">Player</th>
                  <th className="px-2 py-2.5 font-medium">Pos</th>
                  <th className="px-2 py-2.5 font-medium">Yr</th>
                  <th className="px-2 py-2.5 font-medium">Ht</th>
                  <th className="px-2 py-2.5 text-center font-medium">GP</th>
                  <th className="px-2 py-2.5 text-center font-medium">GS</th>
                  <th className="px-2 py-2.5 text-center font-medium">Min</th>
                  <th className="px-2 py-2.5 text-center font-medium">G</th>
                  <th className="px-2 py-2.5 text-center font-medium">A</th>
                  <th className="px-2 py-2.5 text-center font-medium">Pts</th>
                  <th className="px-2 py-2.5 text-center font-medium">Sh</th>
                  <th className="px-2 py-2.5 text-center font-medium">SOG</th>
                  <th className="px-2 py-2.5 text-center font-medium">YC</th>
                  <th className="px-2 py-2.5 text-center font-medium">RC</th>
                </tr>
              </thead>
              <tbody>
                {field.map((p) => (
                  <tr key={p.key} className="group border-b border-border/60 last:border-0 hover:bg-surface-raised">
                    <td className="sticky left-0 z-10 bg-surface px-3 py-2 group-hover:bg-surface-raised">
                      <Link to={playerPath(team.seo, p.key)} className="flex items-center gap-2 font-medium hover:text-owl-red-light">
                        <PlayerPhoto name={p.name} url={p.photo_url} size={30} />
                        <span className="whitespace-nowrap">
                          {p.jersey_number && <span className="mr-1 text-xs font-normal text-text-dim">#{p.jersey_number}</span>}
                          {p.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-text-dim">{p.position_short ?? ""}</td>
                    <td className="px-2 py-2 text-text-dim">{p.academic_year ?? ""}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-text-dim">{height(p)}</td>
                    <td className="px-2 py-2 text-center text-text-dim">{dash(p.gp)}</td>
                    <td className="px-2 py-2 text-center text-text-dim">{dash(p.gs)}</td>
                    <td className="px-2 py-2 text-center text-text-dim">{dash(p.minutes)}</td>
                    <td className="px-2 py-2 text-center">{dash(p.goals)}</td>
                    <td className="px-2 py-2 text-center">{dash(p.assists)}</td>
                    <td className="px-2 py-2 text-center font-semibold text-teal">{dash(p.points)}</td>
                    <td className="px-2 py-2 text-center text-text-dim">{dash(p.shots)}</td>
                    <td className="px-2 py-2 text-center text-text-dim">{dash(p.shots_on_goal)}</td>
                    <td className="px-2 py-2 text-center text-text-dim">{dash(p.yellow_cards)}</td>
                    <td className="px-2 py-2 text-center text-text-dim">{dash(p.red_cards)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {keepers.some((k) => k.gp || k.saves !== null) && (
        <section>
          <SectionHeading title="Goalkeeping" />
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-dim">
                  <th className="px-3 py-2.5 font-medium">Goalkeeper</th>
                  <th className="px-2 py-2.5 text-center font-medium">GP</th>
                  <th className="px-2 py-2.5 text-center font-medium">GS</th>
                  <th className="px-2 py-2.5 text-center font-medium">Saves</th>
                  <th className="px-2 py-2.5 text-center font-medium">GA</th>
                  <th className="px-2 py-2.5 text-center font-medium">GAA</th>
                  <th className="px-2 py-2.5 text-center font-medium">Save %</th>
                  <th className="px-2 py-2.5 text-center font-medium">Shutouts</th>
                </tr>
              </thead>
              <tbody>
                {keepers.map((k) => (
                  <tr key={k.key} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      <Link to={playerPath(team.seo, k.key)} className="flex items-center gap-2 font-medium hover:text-owl-red-light">
                        <PlayerPhoto name={k.name} url={k.photo_url} size={30} />
                        {k.jersey_number && <span className="text-xs font-normal text-text-dim">#{k.jersey_number}</span>}
                        {k.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-center text-text-dim">{dash(k.gp)}</td>
                    <td className="px-2 py-2 text-center text-text-dim">{dash(k.gs)}</td>
                    <td className="px-2 py-2 text-center font-semibold text-teal">{dash(k.saves)}</td>
                    <td className="px-2 py-2 text-center">{dash(k.goals_allowed)}</td>
                    <td className="px-2 py-2 text-center">{dash(k.gaa, 2)}</td>
                    <td className="px-2 py-2 text-center">{k.save_pct === null ? "—" : `${Math.round(k.save_pct * 100)}%`}</td>
                    <td className="px-2 py-2 text-center">{dash(k.shutouts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <GameList title="Results" games={played} ourTeam={data.ourTeam} />
        <GameList title="Fixtures" games={upcoming} ourTeam={data.ourTeam} />
      </section>
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function GameList({ title, games, ourTeam }: { title: string; games: import("../types").NcaaTeamGame[]; ourTeam: string }) {
  const navigate = useNavigate();
  return (
    <div>
      <SectionHeading title={title} subtitle={`${games.length} game${games.length === 1 ? "" : "s"}`} />
      <Card className="p-0">
        {games.length === 0 ? (
          <div className="px-4 py-4 text-sm text-text-dim">None.</div>
        ) : (
          <ul className="divide-y divide-border/60">
            {games.map((g) => (
              <li
                key={`${g.date}-${g.opponentSeo}`}
                onClick={g.result ? () => navigate(gamePath(g.id)) : undefined}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm ${g.opponentSeo === ourTeam ? "bg-owl-red/10" : ""} ${
                  g.result ? "cursor-pointer hover:bg-surface-raised" : ""
                }`}
              >
                <span className="w-14 shrink-0 text-text-dim">{formatDate(g.date)}</span>
                <span className="w-5 shrink-0 text-center text-xs text-text-dim">{g.home ? "vs" : "@"}</span>
                <TeamLogo name={g.opponent} url={g.opponentLogo} size="sm" />
                <TeamLink seo={g.opponentSeo} className="min-w-0 flex-1 truncate font-medium">
                  {g.opponent}
                </TeamLink>
                {g.isConference && <span className="text-[10px] uppercase tracking-wide text-text-dim">Conf</span>}
                <span
                  className={`w-16 shrink-0 text-right font-semibold ${
                    g.result?.startsWith("W") ? "text-teal" : g.result?.startsWith("L") ? "text-owl-red-light" : "text-text-dim"
                  }`}
                >
                  {g.result ??
                    (g.startEpoch ? new Date(g.startEpoch * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "TBA")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
