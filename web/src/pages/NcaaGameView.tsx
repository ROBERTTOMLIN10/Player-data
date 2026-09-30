import { Link, useNavigate, useParams } from "react-router-dom";
import { useNcaaGame } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { playerPath, TeamLink } from "../components/ncaa";
import { PlayerPhoto } from "../components/PlayerPhoto";
import { TeamLogo } from "../components/TeamLogo";
import { formatDate } from "../lib/format";
import type { NcaaGameDetail, NcaaGamePlayer, NcaaGameTeamStats } from "../types";

type Team = NcaaGameDetail["teams"][number];

/** One D1 game: score, goals, team stats and both line-ups (live games refresh themselves). */
export default function NcaaGameView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useNcaaGame(id);
  if (isLoading) return <div className="py-20 text-center text-text-dim">Loading game…</div>;
  if (error || !data) return <Card className="text-sm text-text-dim">Game not found.</Card>;

  const g = data.game;
  const home = data.teams.find((t) => t.isHome) ?? null;
  const away = data.teams.find((t) => !t.isHome) ?? null;
  const live = data.status === "I";
  const final = data.status === "F";
  const status = live ? `Live · ${g?.period || data.period || ""}${g?.clock ? ` ${g.clock}` : ""}` : final ? g?.finalMessage || "Final" : "Not started";
  const side = (t: Team | null, which: "home" | "away") => ({
    seo: t?.seo ?? g?.[which].seo ?? "",
    name: g?.[which].name ?? t?.name ?? "",
    logo: g?.[which].logo ?? null,
    score: g?.[which].score ?? null,
  });
  const a = side(away, "away");
  const h = side(home, "home");

  return (
    <div className="flex flex-col gap-6">
      <button onClick={() => navigate(-1)} className="self-start text-sm text-text-dim hover:text-owl-red">
        ← Back
      </button>

      <Card>
        <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide">
          <span className={`flex items-center gap-1.5 ${live ? "text-teal" : "text-text-dim"}`}>
            {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />}
            {status}
          </span>
          <span className="text-text-dim">
            {g && formatDate(g.date)}
            {g && ` · ${g.isConference ? g.home.confName ?? "Conference" : "Non-conference"}`}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamHead {...a} />
          <div className="font-display text-4xl font-bold tabular-nums sm:text-5xl">
            {a.score ?? "–"} <span className="text-text-dim">-</span> {h.score ?? "–"}
          </div>
          <TeamHead {...h} />
        </div>
        <p className="mt-2 text-center text-xs text-text-dim">Away · Home</p>
      </Card>

      {data.goals.length > 0 && (
        <section>
          <SectionHeading title="Goals" />
          <Card className="p-0">
            <ul className="divide-y divide-border/60">
              {data.goals.map((goal, i) => (
                <li key={i} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${goal.seo === h.seo ? "flex-row-reverse text-right" : ""}`}>
                  <span className="w-12 shrink-0 text-xs text-text-dim">{goal.time}&prime;</span>
                  <span className="min-w-0 flex-1">⚽ {goal.text}</span>
                  <span className="shrink-0 font-display font-semibold tabular-nums">
                    {goal.awayScore}-{goal.homeScore}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {away?.stats && home?.stats && (
        <section>
          <SectionHeading title="Team Stats" />
          <Card className="flex flex-col gap-3">
            <div className="flex justify-between text-xs font-semibold uppercase tracking-wide text-text-dim">
              <span>{a.name}</span>
              <span>{h.name}</span>
            </div>
            {STAT_ROWS.map(([label, k]) => (
              <StatBar key={k} label={label} away={away.stats![k]} home={home.stats![k]} />
            ))}
          </Card>
        </section>
      )}

      {data.teams.every((t) => t.players.length === 0) ? (
        <Card className="text-sm text-text-dim">{live || final ? "Player stats aren't available for this game yet." : "Player stats appear here once the game kicks off."}</Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {away && <Lineup team={away} name={a.name} />}
          {home && <Lineup team={home} name={h.name} />}
        </div>
      )}
      {live && <p className="text-xs text-text-dim">Updates every 30 seconds while the game is live.</p>}
    </div>
  );
}

function TeamHead({ seo, name, logo }: { seo: string; name: string; logo: string | null }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <TeamLogo name={name} url={logo} size="lg" />
      <TeamLink seo={seo} className="font-display text-base font-semibold sm:text-lg">
        {name}
      </TeamLink>
    </div>
  );
}

const STAT_ROWS: [string, keyof NcaaGameTeamStats][] = [
  ["Shots", "shots"],
  ["On target", "shotsOnGoal"],
  ["Corners", "corners"],
  ["Saves", "saves"],
  ["Fouls", "fouls"],
  ["Offsides", "offsides"],
  ["Yellow cards", "yellowCards"],
  ["Red cards", "redCards"],
];

function StatBar({ label, away, home }: { label: string; away: number | null; home: number | null }) {
  if (away === null && home === null) return null;
  const total = (away ?? 0) + (home ?? 0);
  const awayPct = total ? ((away ?? 0) / total) * 100 : 50;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm tabular-nums">
        <span className="font-semibold">{away ?? "–"}</span>
        <span className="text-xs text-text-dim">{label}</span>
        <span className="font-semibold">{home ?? "–"}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-raised">
        <div className="bg-owl-red" style={{ width: `${awayPct}%` }} />
        <div className="flex-1 bg-teal" />
      </div>
    </div>
  );
}

function Lineup({ team, name }: { team: Team; name: string }) {
  const played = [...team.players].sort((x, y) => Number(y.starter) - Number(x.starter) || (y.minutes ?? 0) - (x.minutes ?? 0));
  const keepers = played.filter((p) => p.saves !== null);
  return (
    <section>
      <SectionHeading title={name} subtitle={`${played.filter((p) => p.starter).length} starters · ${played.filter((p) => !p.starter).length} subs used`} />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[520px] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-dim">
              <th className="px-3 py-2.5 font-medium">Player</th>
              <th className="px-2 py-2.5 text-center font-medium">Min</th>
              <th className="px-2 py-2.5 text-center font-medium">G</th>
              <th className="px-2 py-2.5 text-center font-medium">A</th>
              <th className="px-2 py-2.5 text-center font-medium">Sh</th>
              <th className="px-2 py-2.5 text-center font-medium">SOG</th>
              <th className="px-2 py-2.5 text-center font-medium">Cards</th>
            </tr>
          </thead>
          <tbody>
            {played.map((p, i) => (
              <tr key={`${p.name}-${i}`} className={`border-b border-border/60 last:border-0 ${!p.starter && i > 0 && played[i - 1].starter ? "border-t-2 border-t-border" : ""}`}>
                <td className="px-3 py-2">
                  <PlayerName team={team.seo} p={p} />
                </td>
                <td className="px-2 py-2 text-center text-text-dim">{p.minutes ?? "–"}</td>
                <td className={`px-2 py-2 text-center ${p.goals ? "font-semibold text-teal" : ""}`}>{p.goals}</td>
                <td className={`px-2 py-2 text-center ${p.assists ? "font-semibold" : ""}`}>{p.assists}</td>
                <td className="px-2 py-2 text-center text-text-dim">{p.shots}</td>
                <td className="px-2 py-2 text-center text-text-dim">{p.shotsOnGoal}</td>
                <td className="px-2 py-2 text-center">
                  {p.yellowCards > 0 && <span className="mr-1 inline-block h-3 w-2.5 rounded-sm bg-gold" title="Yellow" />}
                  {p.redCards > 0 && <span className="inline-block h-3 w-2.5 rounded-sm bg-owl-red" title="Red" />}
                  {!p.yellowCards && !p.redCards && <span className="text-text-dim">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {keepers.length > 0 && (
          <div className="border-t border-border px-3 py-2.5 text-xs text-text-dim">
            {keepers.map((k) => `${k.name}: ${k.saves} saves, ${k.goalsAllowed} against`).join(" · ")}
          </div>
        )}
      </Card>
    </section>
  );
}

function PlayerName({ team, p }: { team: string; p: NcaaGamePlayer }) {
  const inner = (
    <span className="flex items-center gap-2">
      <PlayerPhoto name={p.name} url={p.photo_url} size={26} />
      <span className="whitespace-nowrap">
        {p.number && <span className="mr-1 text-xs font-normal text-text-dim">#{p.number}</span>}
        {p.name}
        {p.position && <span className="ml-1.5 text-[10px] uppercase text-text-dim">{p.position}</span>}
      </span>
    </span>
  );
  return p.key ? (
    <Link to={playerPath(team, p.key)} className="font-medium hover:text-owl-red-light">
      {inner}
    </Link>
  ) : (
    <span className="font-medium">{inner}</span>
  );
}
