import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useNcaaGame } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { Segmented } from "../components/SeasonStats";
import { gamePath, NationalRank, playerPath, Rpi, TeamLink } from "../components/ncaa";
import { PlayerPhoto } from "../components/PlayerPhoto";
import { TeamLogo } from "../components/TeamLogo";
import { formatDate, formatDateLong, kickoffTime } from "../lib/format";
import type { NcaaFormPlayer, NcaaGameDetail, NcaaGamePlayer, NcaaGameTeamStats, NcaaTeamForm } from "../types";

type Team = NcaaGameDetail["teams"][number];
type Rank = { rpi: number | null; pollRank: number | null };

/** One D1 game: before kick-off a preview (form, leaders, head-to-head); live and after, the score, stats, line-ups and play-by-play. */
export default function NcaaGameView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error, dataUpdatedAt } = useNcaaGame(id);
  if (isLoading) return <div className="py-20 text-center text-text-dim">Loading game…</div>;
  if (error || !data) return <Card className="text-sm text-text-dim">Game not found.</Card>;

  const g = data.game;
  const home = data.teams.find((t) => t.isHome) ?? null;
  const away = data.teams.find((t) => !t.isHome) ?? null;
  const live = data.status === "I";
  const final = data.status === "F";
  const upcoming = !live && !final;
  // Our games: the time from our schedule ("7 p.m."); others: NCAA.com's, in Eastern time.
  const kickoff = data.venue?.time ?? (g?.startEpoch ? kickoffTime(g.startEpoch) : null);
  const status = live
    ? `Live · ${data.period || g?.period || ""}${data.clock ? ` ${data.clock}` : g?.clock ? ` ${g.clock}` : ""}`
    : final
      ? g?.finalMessage || "Final"
      : kickoff
        ? `Kick-off ${kickoff}`
        : "Not started";
  const side = (t: Team | null, which: "home" | "away") => {
    const seo = t?.seo ?? g?.[which].seo ?? "";
    return {
      seo,
      name: g?.[which].name ?? t?.name ?? "",
      logo: g?.[which].logo ?? null,
      score: g?.[which].score ?? t?.score ?? null,
      rank: data.ranks?.[seo] ?? null,
    };
  };
  const a = side(away, "away");
  const h = side(home, "home");

  return (
    <div className="flex flex-col gap-6">
      <button onClick={() => navigate(-1)} className="self-start text-sm text-text-dim hover:text-owl-red">
        ← Back
      </button>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide">
          <span className={`flex items-center gap-1.5 ${live ? "text-teal" : "text-text-dim"}`}>
            {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />}
            {status}
          </span>
          <span className="text-right text-text-dim">
            {g && formatDate(g.date)}
            {g && ` · ${g.isConference ? g.home.confName ?? "Conference" : "Non-conference"}`}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamHead {...a} />
          {upcoming ? (
            <div className="font-display text-2xl font-bold text-text-dim sm:text-3xl">vs</div>
          ) : (
            <div className="font-display text-4xl font-bold tabular-nums sm:text-5xl">
              {a.score ?? "–"} <span className="text-text-dim">-</span> {h.score ?? "–"}
            </div>
          )}
          <TeamHead {...h} />
        </div>
        <p className="mt-2 text-center text-xs text-text-dim">Away · Home</p>
        {data.venue?.location && <p className="mt-1 text-center text-xs text-text-dim">{data.venue.location}</p>}
      </Card>

      {upcoming && data.preview ? (
        <Preview data={data} kickoff={kickoff} />
      ) : (
        <>
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
              <SectionHeading title="Team Stats" subtitle={live ? "Live" : undefined} />
              <Card className="flex flex-col gap-3">
                <div className="flex justify-between text-xs font-semibold uppercase tracking-wide text-text-dim">
                  <TeamLink seo={a.seo}>{a.name}</TeamLink>
                  <TeamLink seo={h.seo}>{h.name}</TeamLink>
                </div>
                {STAT_ROWS.map(([label, k]) => (
                  <StatBar key={k} label={label} away={statValue(away.stats!, k)} home={statValue(home.stats!, k)} />
                ))}
              </Card>
            </section>
          )}

          {data.teams.every((t) => t.players.length === 0) ? (
            <Card className="text-sm text-text-dim">{live || final ? "Player stats aren't available for this game yet." : "Player stats appear here once the game kicks off."}</Card>
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              {away && <Lineup team={away} name={a.name} live={live} />}
              {home && <Lineup team={home} name={h.name} live={live} />}
            </div>
          )}

          {data.plays.length > 0 && <PlayByPlay plays={data.plays} home={h} away={a} live={live} />}
          {live && (
            <p className="text-xs text-text-dim">
              Live from NCAA.com · updates every 20 seconds · last checked {new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Before kick-off: when and where, each team's form and leading players, and earlier meetings. */
function Preview({ data, kickoff }: { data: NcaaGameDetail; kickoff: string | null }) {
  const p = data.preview!;
  const g = data.game;
  return (
    <>
      <section>
        <SectionHeading title="Match Details" />
        <Card className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Detail label="Date" value={g ? formatDateLong(g.date) : "—"} />
          <Detail label="Kick-off" value={kickoff ?? "TBA"} />
          <Detail label="Venue" value={data.venue?.location ?? `${p.home.team.name} (home)`} />
          <Detail label="Game" value={g?.isConference ? `${g.home.confName ?? "Conference"} game` : "Non-conference"} />
        </Card>
      </section>

      <section>
        <SectionHeading title="Form" subtitle="Record, national standing and last five results" />
        <div className="grid gap-4 md:grid-cols-2">
          <FormCard form={p.away} label="Away" />
          <FormCard form={p.home} label="Home" />
        </div>
      </section>

      <section>
        <SectionHeading title="Top Players" subtitle="Leading scorers and first-choice keeper this season" />
        <div className="grid gap-4 md:grid-cols-2">
          <Leaders form={p.away} />
          <Leaders form={p.home} />
        </div>
      </section>

      <section>
        <SectionHeading title="Head-to-Head" subtitle="Earlier meetings, this season and the last five" />
        {p.headToHead.length === 0 ? (
          <Card className="text-sm text-text-dim">No meetings between these teams in the last five seasons.</Card>
        ) : (
          <Card className="p-0">
            <HeadToHeadSummary meetings={p.headToHead} a={p.away.team} h={p.home.team} />
            <ul className="divide-y divide-border/60 border-t border-border/60">
              {p.headToHead.map((m) => {
                const row = (
                  <>
                    <span className="w-24 shrink-0 text-xs text-text-dim">
                      {m.linkable ? formatDate(m.date) : `${formatDate(m.date)}, ${m.season}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {m.awayName}{" "}
                      <span className="font-semibold tabular-nums">
                        {m.awayScore}-{m.homeScore}
                      </span>{" "}
                      {m.homeName}
                      {m.note && <span className="ml-1.5 text-[10px] uppercase text-text-dim">{m.note}</span>}
                    </span>
                    {m.linkable && <span className="text-xs text-text-dim">Match stats ›</span>}
                  </>
                );
                return (
                  <li key={m.id}>
                    {m.linkable ? (
                      <Link to={gamePath(m.id)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-raised">
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-2.5 text-sm">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}

/** Wins for each side and draws across the meetings listed. */
function HeadToHeadSummary({ meetings, a, h }: { meetings: NonNullable<NcaaGameDetail["preview"]>["headToHead"]; a: NcaaTeamForm["team"]; h: NcaaTeamForm["team"] }) {
  let aw = 0;
  let hw = 0;
  let d = 0;
  for (const m of meetings) {
    if (m.homeScore === null || m.awayScore === null) continue;
    const winner = m.homeScore > m.awayScore ? m.homeSeo : m.awayScore > m.homeScore ? m.awaySeo : null;
    if (winner === a.seo) aw++;
    else if (winner === h.seo) hw++;
    else d++;
  }
  return (
    <div className="grid grid-cols-3 px-4 py-3 text-center">
      <div>
        <div className="font-display text-2xl font-bold tabular-nums">{aw}</div>
        <div className="truncate text-xs text-text-dim">{a.name} wins</div>
      </div>
      <div>
        <div className="font-display text-2xl font-bold tabular-nums text-text-dim">{d}</div>
        <div className="text-xs text-text-dim">Draws</div>
      </div>
      <div>
        <div className="font-display text-2xl font-bold tabular-nums">{hw}</div>
        <div className="truncate text-xs text-text-dim">{h.name} wins</div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-dim">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

const resultClass = (r: string) => (r.startsWith("W") ? "bg-teal/15 text-teal border-teal/40" : r.startsWith("L") ? "bg-owl-red/15 text-owl-red-light border-owl-red/40" : "bg-gold/15 text-gold border-gold/40");

function FormCard({ form, label }: { form: NcaaTeamForm; label: string }) {
  const t = form.team;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <TeamLogo name={t.name} url={t.logo} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TeamLink seo={t.seo} className="font-display text-base font-semibold">
              {t.name}
            </TeamLink>
            <NationalRank rpi={t.rpi} pollRank={t.pollRank} />
          </div>
          <div className="text-xs text-text-dim">
            {[label, t.record && `${t.record} overall`, t.conferenceRecord && `${t.conferenceRecord} conf`].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      {form.lastFive.length === 0 ? (
        <p className="text-xs text-text-dim">No results yet this season.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {form.lastFive.map((r) => (
            <li key={r.id}>
              <Link to={gamePath(r.id)} className="flex items-center gap-2 text-sm hover:text-owl-red-light">
                <span className={`w-14 shrink-0 rounded-full border px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums ${resultClass(r.result!)}`}>{r.result}</span>
                <TeamLogo name={r.opponent} url={r.opponentLogo} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  {r.home ? "vs " : "at "}
                  {r.opponent}
                  <Rpi seo={r.opponentSeo} />
                </span>
                <span className="shrink-0 text-xs text-text-dim">{formatDate(r.date)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Leaders({ form }: { form: NcaaTeamForm }) {
  const t = form.team;
  const row = (p: NcaaFormPlayer, line: string) => (
    <li key={p.key}>
      <Link to={playerPath(t.seo, p.key)} className="flex items-center gap-2.5 text-sm hover:text-owl-red-light">
        <PlayerPhoto name={p.name} url={p.photo_url} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {p.jersey_number && <span className="mr-1 text-xs font-normal text-text-dim">#{p.jersey_number}</span>}
            {p.name}
          </span>
          <span className="block text-xs text-text-dim">{line}</span>
        </span>
      </Link>
    </li>
  );
  const none = form.scorers.length === 0 && !form.keeper;
  return (
    <Card className="flex flex-col gap-3">
      <TeamLink seo={t.seo} className="text-xs font-semibold uppercase tracking-wide text-text-dim">
        {t.name}
      </TeamLink>
      {none ? (
        <p className="text-sm text-text-dim">Player stats for {t.name} aren't available yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {form.scorers.map((p) => row(p, `${p.goals ?? 0} G · ${p.assists ?? 0} A · ${p.points ?? 0} pts · ${p.gp ?? 0} GP`))}
          {form.keeper &&
            row(
              form.keeper,
              `GK · ${form.keeper.saves ?? 0} saves · ${form.keeper.gaa !== null && form.keeper.gaa !== undefined ? `${Number(form.keeper.gaa).toFixed(2)} GAA` : "— GAA"} · ${form.keeper.shutouts ?? 0} shutouts`,
            )}
        </ul>
      )}
    </Card>
  );
}

const PLAY_ICON: Record<string, string> = { goal: "⚽", shot: "◎", save: "🧤", corner: "⚑", foul: "✕", offside: "⚐", sub: "⇄", yellow: "", red: "", other: "·" };
const KEY_PLAYS = new Set(["goal", "yellow", "red", "sub"]);

function PlayByPlay({ plays, home, away, live }: { plays: NcaaGameDetail["plays"]; home: { seo: string; name: string }; away: { seo: string; name: string }; live: boolean }) {
  const [filter, setFilter] = useState<"key" | "all">("all");
  const shown = (filter === "key" ? plays.filter((p) => KEY_PLAYS.has(p.kind)) : plays).slice().reverse();
  let lastPeriod = "";
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-x-4">
        <SectionHeading title="Play-by-Play" subtitle={live ? "Newest first · live" : "Newest first"} />
        <div className="mb-3">
          <Segmented
            value={filter}
            options={[
              { key: "all", label: "All plays" },
              { key: "key", label: "Key events" },
            ]}
            onChange={setFilter}
            label="Play-by-play filter"
          />
        </div>
      </div>
      <Card className="max-h-[32rem] overflow-y-auto p-0">
        {shown.length === 0 ? (
          <p className="px-4 py-3 text-sm text-text-dim">No key events yet.</p>
        ) : (
          <ul>
            {shown.map((p, i) => {
              const header = p.period !== lastPeriod ? p.period : null;
              lastPeriod = p.period;
              const team = p.seo === home.seo ? home : p.seo === away.seo ? away : null;
              return (
                <li key={i}>
                  {header && <div className="sticky top-0 bg-surface-raised px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-dim">{header}</div>}
                  <div className={`flex items-start gap-3 border-b border-border/60 px-4 py-2 text-sm ${p.kind === "goal" ? "bg-teal/10" : ""}`}>
                    <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-text-dim">{p.clock}</span>
                    <span className="w-5 shrink-0 text-center" aria-hidden>
                      {p.kind === "yellow" ? (
                        <span className="inline-block h-3.5 w-2.5 rounded-sm bg-gold" />
                      ) : p.kind === "red" ? (
                        <span className="inline-block h-3.5 w-2.5 rounded-sm bg-owl-red" />
                      ) : (
                        <span className={p.kind === "goal" ? "" : "text-text-dim"}>{PLAY_ICON[p.kind]}</span>
                      )}
                    </span>
                    <span className={`min-w-0 flex-1 ${p.kind === "goal" ? "font-semibold" : ""}`}>
                      {p.text}
                      {team && <span className="ml-2 text-[11px] uppercase tracking-wide text-text-dim">{team.name}</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}

function TeamHead({ seo, name, logo, rank }: { seo: string; name: string; logo: string | null; rank: Rank | null }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <TeamLogo name={name} url={logo} size="lg" />
      <TeamLink seo={seo} className="font-display text-base font-semibold sm:text-lg">
        {name}
      </TeamLink>
      {rank && <NationalRank rpi={rank.rpi} pollRank={rank.pollRank} className="flex-wrap justify-center" />}
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

/** NCAA's feed sometimes leaves shots at 0 while counting shots on target: show those as unknown. */
function statValue(s: NcaaGameTeamStats, k: keyof NcaaGameTeamStats) {
  if (k === "shots" && s.shots !== null && s.shotsOnGoal !== null && s.shots < s.shotsOnGoal) return null;
  return s[k];
}

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

function Lineup({ team, name, live }: { team: Team; name: string; live: boolean }) {
  const played = [...team.players].sort((x, y) => Number(y.starter) - Number(x.starter) || (y.minutes ?? 0) - (x.minutes ?? 0));
  const keepers = played.filter((p) => p.saves !== null);
  return (
    <section>
      <div className="mb-3">
        <TeamLink seo={team.seo} className="font-display text-lg font-semibold text-text sm:text-xl">
          {name}
        </TeamLink>
        <p className="mt-0.5 text-sm text-text-dim">
          {live && <span className="mr-1 font-semibold text-teal">Live ·</span>}
          {played.filter((p) => p.starter).length} starters · {played.filter((p) => !p.starter).length} subs used
        </p>
      </div>
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
                <td className="px-2 py-2 text-center text-text-dim">{p.minutes === null ? "–" : Math.round(p.minutes)}</td>
                <td className={`px-2 py-2 text-center ${p.goals ? "font-semibold text-teal" : ""}`}>{p.goals}</td>
                <td className={`px-2 py-2 text-center ${p.assists ? "font-semibold" : ""}`}>{p.assists}</td>
                <td className="px-2 py-2 text-center text-text-dim">{p.shots !== null && p.shots >= p.shotsOnGoal ? p.shots : "–"}</td>
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
