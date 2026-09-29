import { Link } from "react-router-dom";
import { PlayerPhoto } from "./PlayerPhoto";
import { TeamLogo } from "./TeamLogo";
import type { NcaaGame, NcaaSide, NcaaStandingRow, NcaaTable } from "../types";

export const teamPath = (seo: string) => `/ncaa/team/${seo}`;
export const playerPath = (seo: string, key: string) => `/ncaa/player/${seo}/${encodeURIComponent(key)}`;

/** A team's name as a link to its team page. */
export function TeamLink({ seo, children, className = "" }: { seo: string | null | undefined; children: React.ReactNode; className?: string }) {
  if (!seo) return <span className={className}>{children}</span>;
  return (
    <Link to={teamPath(seo)} className={`hover:text-owl-red-light hover:underline ${className}`} onClick={(e) => e.stopPropagation()}>
      {children}
    </Link>
  );
}

/** Shared NCAA D1 pieces: game card, standings table, stat table. */

/** Movement since the last update: green ▲n up, red ▼n down, nothing when unchanged or new. */
export function Movement({ move }: { move: number | null | undefined }) {
  if (!move) return <span className="inline-block w-7" aria-hidden />;
  const up = move > 0;
  return (
    <span
      className={`inline-flex w-7 items-center text-[11px] font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}
      title={`${up ? "Up" : "Down"} ${Math.abs(move)} since the last update`}
      aria-label={`${up ? "up" : "down"} ${Math.abs(move)}`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(move)}
    </span>
  );
}

export function GameCard({ game, ourTeam }: { game: NcaaGame; ourTeam: string }) {
  const live = game.state === "I";
  const final = game.state === "F";
  const ours = game.home.seo === ourTeam || game.away.seo === ourTeam;
  const status = live
    ? `${game.period}${game.clock ? ` ${game.clock}` : ""}`
    : final
      ? game.finalMessage || "Final"
      : game.startEpoch
        ? new Date(game.startEpoch * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : "TBA";

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border bg-surface p-3 ${
        ours ? "border-owl-red/60" : live ? "border-teal/50" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide">
        <span className={`flex items-center gap-1.5 ${live ? "text-teal" : "text-text-dim"}`}>
          {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />}
          {live ? `Live · ${status}` : status}
        </span>
        <span className="text-text-dim">{game.isConference ? game.home.confName : "Non-conference"}</span>
      </div>
      <TeamLine side={game.away} other={game.home} final={final} showScore={live || final} />
      <TeamLine side={game.home} other={game.away} final={final} showScore={live || final} />
    </div>
  );
}

function TeamLine({ side, other, final, showScore }: { side: NcaaSide; other: NcaaSide; final: boolean; showScore: boolean }) {
  const won = final && side.score !== null && other.score !== null && side.score > other.score;
  const lost = final && side.score !== null && other.score !== null && side.score < other.score;
  return (
    <div className="flex items-center gap-2">
      <TeamLogo name={side.name} url={side.logo} size="sm" />
      <span className={`min-w-0 flex-1 truncate text-sm ${lost ? "text-text-dim" : "font-medium"}`}>
        {side.rank && <span className="mr-1 text-[11px] text-text-dim">{side.rank}</span>}
        <TeamLink seo={side.seo}>{side.name}</TeamLink>
      </span>
      {showScore && (
        <span className={`font-display text-base font-semibold tabular-nums ${won ? "text-text" : "text-text-dim"}`}>
          {side.score ?? "–"}
        </span>
      )}
    </div>
  );
}

export function StandingsTable({ rows, ourTeam, compact = false }: { rows: NcaaStandingRow[]; ourTeam: string; compact?: boolean }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-dim">
            <th className="w-16 px-2 py-2 font-medium">#</th>
            <th className="px-2 py-2 font-medium">Team</th>
            <th className="px-2 py-2 text-center font-medium">GP</th>
            <th className="px-2 py-2 text-center font-medium">W</th>
            <th className="px-2 py-2 text-center font-medium">L</th>
            <th className="px-2 py-2 text-center font-medium">T</th>
            {!compact && <th className="px-2 py-2 text-center font-medium">GF</th>}
            {!compact && <th className="px-2 py-2 text-center font-medium">GA</th>}
            <th className="px-2 py-2 text-center font-medium">GD</th>
            <th className="px-2 py-2 text-center font-medium">Pts</th>
            <th className="px-2 py-2 text-center font-medium">Overall</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.seo}
              className={`border-b border-border/60 last:border-0 ${r.seo === ourTeam ? "bg-owl-red/10" : ""}`}
            >
              <td className="whitespace-nowrap px-2 py-2 text-text-dim">
                <span className="inline-block w-5">{i + 1}</span>
                <Movement move={r.move} />
              </td>
              <td className="px-2 py-2">
                <span className="flex items-center gap-2 font-medium">
                  <TeamLogo name={r.name} url={r.logo} size="sm" />
                  <TeamLink seo={r.seo}>{r.name}</TeamLink>
                </span>
              </td>
              <td className="px-2 py-2 text-center text-text-dim">{r.gp}</td>
              <td className="px-2 py-2 text-center">{r.w}</td>
              <td className="px-2 py-2 text-center">{r.l}</td>
              <td className="px-2 py-2 text-center">{r.t}</td>
              {!compact && <td className="px-2 py-2 text-center text-text-dim">{r.gf}</td>}
              {!compact && <td className="px-2 py-2 text-center text-text-dim">{r.ga}</td>}
              <td className="px-2 py-2 text-center text-text-dim">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              <td className="px-2 py-2 text-center font-display font-semibold">{r.pts}</td>
              <td className="px-2 py-2 text-center text-text-dim">{r.overall}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Any NCAA stat/rankings table, with logos next to team names and our team highlighted. */
/** Our wording for NCAA column names: an away record is "Away", not "Road". */
const columnLabel = (c: string) => c.replace(/\bRoad\b/i, "Away");

export function NcaaStatTable({
  table,
  ourTeam,
  limit,
  hideColumns = [],
}: {
  table: NcaaTable;
  ourTeam: string;
  limit?: number;
  hideColumns?: string[];
}) {
  const teamCol = table.columns.findIndex((c) => ["team", "school"].includes(c.toLowerCase()));
  const nameCol = table.columns.findIndex((c) => c.toLowerCase() === "name");
  const shown = table.columns.map((c, i) => ({ c, i })).filter(({ c }) => !hideColumns.includes(c));
  const rows = table.rows.slice(0, limit ?? table.rows.length);
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-dim">
            {shown.map(({ c, i }) => (
              <th key={i} className={`px-2 py-2 font-medium ${i === shown[shown.length - 1].i ? "text-right" : ""}`}>
                {columnLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const team = table.teams[ri];
            return (
              <tr key={ri} className={`border-b border-border/60 last:border-0 ${team?.seo === ourTeam ? "bg-owl-red/10" : ""}`}>
                {shown.map(({ i }) => (
                  <td
                    key={i}
                    className={`px-2 py-2 ${i === teamCol ? "" : "whitespace-nowrap"} ${
                      i === shown[shown.length - 1].i ? "text-right font-display font-semibold" : ""
                    } ${i === 0 ? "text-text-dim" : ""}`}
                  >
                    {i === 0 && table.moves ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block min-w-[1.5rem]">{r[i]}</span>
                        <Movement move={table.moves[ri]} />
                      </span>
                    ) : i === teamCol ? (
                      <span className="flex items-center gap-2">
                        <TeamLogo name={r[i]} url={team?.logo} size="sm" />
                        <TeamLink seo={team?.seo} className="truncate">
                          {r[i]}
                        </TeamLink>
                      </span>
                    ) : i === nameCol && table.players ? (
                      <PlayerCell name={r[i]} seo={team?.seo} link={table.players[ri]} />
                    ) : (
                      r[i]
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={shown.length} className="px-2 py-6 text-center text-text-dim">
                No rows.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function updatedLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso.replace(" ", "T")}Z`);
  return `Updated ${d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

/** A leader-table player: photo, squad number and name, linking to their profile. */
function PlayerCell({ name, seo, link }: { name: string; seo: string | null | undefined; link: { key: string; photo_url: string | null; jersey_number: string | null } | null }) {
  const inner = (
    <span className="flex items-center gap-2">
      <PlayerPhoto name={name} url={link?.photo_url} size={26} />
      <span className="whitespace-nowrap">
        {link?.jersey_number && <span className="mr-1 text-[11px] text-text-dim">#{link.jersey_number}</span>}
        {name}
      </span>
    </span>
  );
  if (!seo || !link) return inner;
  return (
    <Link to={playerPath(seo, link.key)} className="hover:text-owl-red-light [&_span.whitespace-nowrap]:hover:underline">
      {inner}
    </Link>
  );
}
