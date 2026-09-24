import { useMemo, useState } from "react";
import { useNcaaRankings, useNcaaScoreboard, useNcaaStandings, useNcaaStat, useNcaaStatsIndex } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { GameCard, NcaaStatTable, StandingsTable, updatedLabel } from "../components/ncaa";
import { formatDateLong } from "../lib/format";
import type { NcaaGame } from "../types";

type Tab = "scores" | "standings" | "stats" | "rankings";
const TABS: { key: Tab; label: string }[] = [
  { key: "scores", label: "Scores" },
  { key: "standings", label: "Standings" },
  { key: "stats", label: "Stats" },
  { key: "rankings", label: "Rankings" },
];

const DEFAULT_CONFERENCE = "american";

function shiftIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const selectClass =
  "rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none focus:border-owl-red";

export default function NcaaView() {
  const [tab, setTab] = useState<Tab>("scores");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <SectionHeading title="NCAA Division I" subtitle="Men's soccer across the country, from NCAA.com" />
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-owl-red text-white" : "text-text-dim hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "scores" && <ScoresTab />}
      {tab === "standings" && <StandingsTab />}
      {tab === "stats" && <StatsTab />}
      {tab === "rankings" && <RankingsTab />}
    </div>
  );
}

// ---- Scores ------------------------------------------------------------------

const STATE_ORDER: Record<string, number> = { I: 0, P: 1, F: 2 };

function ScoresTab() {
  const [date, setDate] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const { data, isLoading } = useNcaaScoreboard(date, true);
  const isToday = data ? data.date === data.today : true;

  const conferences = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of data?.games ?? [])
      for (const s of [g.home, g.away]) if (s.conf && s.confName) map.set(s.conf, s.confName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const games = useMemo(() => {
    const keep = (g: NcaaGame) =>
      filter === "all" ||
      (filter === "top25" && (g.home.rank || g.away.rank)) ||
      (filter === "live" && g.state === "I") ||
      g.home.conf === filter ||
      g.away.conf === filter;
    return (data?.games ?? [])
      .filter(keep)
      .sort((a, b) => (STATE_ORDER[a.state] ?? 3) - (STATE_ORDER[b.state] ?? 3) || (a.startEpoch ?? 0) - (b.startEpoch ?? 0));
  }, [data, filter]);

  const liveCount = data?.games.filter((g) => g.state === "I").length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => data && setDate(shiftIso(data.date, -1))} className="rounded-md border border-border px-2.5 py-1.5 text-sm text-text-dim hover:text-text" aria-label="Previous day">
            ←
          </button>
          <input
            type="date"
            value={data?.date ?? ""}
            onChange={(e) => setDate(e.target.value || null)}
            className="rounded-md border border-border bg-surface-raised px-2 py-1.5 text-sm text-text outline-none focus:border-owl-red"
          />
          <button onClick={() => data && setDate(shiftIso(data.date, 1))} className="rounded-md border border-border px-2.5 py-1.5 text-sm text-text-dim hover:text-text" aria-label="Next day">
            →
          </button>
          {!isToday && (
            <button onClick={() => setDate(null)} className="ml-1 text-sm text-owl-red-light hover:underline">
              Today
            </button>
          )}
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={selectClass} aria-label="Filter games">
          <option value="all">All games</option>
          {liveCount > 0 && <option value="live">Live now ({liveCount})</option>}
          <option value="top25">Top 25</option>
          {conferences.map(([seo, name]) => (
            <option key={seo} value={seo}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-display font-semibold">{data ? formatDateLong(data.date) : ""}</span>
        <span className="text-xs text-text-dim">
          {data && `${data.games.length} games`}
          {isToday && liveCount > 0 && ` · ${liveCount} live · scores refresh every minute`}
          {data?.updatedAt && ` · ${updatedLabel(data.updatedAt)}`}
        </span>
      </div>
      {isLoading ? (
        <div className="py-16 text-center text-text-dim">Loading scores…</div>
      ) : games.length === 0 ? (
        <Card className="text-center text-sm text-text-dim">No games {filter === "all" ? "on this date" : "match this filter"}.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <GameCard key={g.id} game={g} ourTeam={data!.ourTeam} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Standings -----------------------------------------------------------------

function StandingsTab() {
  const { data, isLoading } = useNcaaStandings();
  const [conf, setConf] = useState(DEFAULT_CONFERENCE);
  if (isLoading || !data) return <div className="py-16 text-center text-text-dim">Loading standings…</div>;
  const shown = conf === "all" ? data.conferences : data.conferences.filter((c) => c.seo === conf);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={conf} onChange={(e) => setConf(e.target.value)} className={selectClass} aria-label="Conference">
          <option value="all">All conferences</option>
          {data.conferences.map((c) => (
            <option key={c.seo} value={c.seo}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-dim">
          Conference games only · 3 pts win, 1 pt tie · calculated from NCAA.com results · arrows show today&rsquo;s movement
        </span>
      </div>
      {shown.map((c) => (
        <Card key={c.seo} className="p-0 sm:p-0">
          <div className="border-b border-border px-4 py-3 font-display font-semibold">{c.name}</div>
          <div className="px-2 pb-2">
            <StandingsTable rows={c.rows} ourTeam={data.ourTeam} />
          </div>
        </Card>
      ))}
      {shown.length === 0 && <Card className="text-center text-sm text-text-dim">No results for this conference yet.</Card>}
    </div>
  );
}

// ---- Stats --------------------------------------------------------------------

function StatsTab() {
  const { data: index } = useNcaaStatsIndex();
  const [kind, setKind] = useState<"individual" | "team">("individual");
  const [key, setKey] = useState<string | null>(null);
  const [conf, setConf] = useState("all");
  const categories = index?.categories.filter((c) => c.kind === kind) ?? [];
  const activeKey = key && categories.some((c) => c.key === key) ? key : (categories[0]?.key ?? null);
  const { data: table, isLoading, error } = useNcaaStat(activeKey);

  const filtered = useMemo(() => {
    if (!table || conf === "all") return table;
    const keep = table.rows.map((_, i) => i).filter((i) => table.teams[i]?.conf === conf);
    return { ...table, rows: keep.map((i) => table.rows[i]), teams: keep.map((i) => table.teams[i]), moves: keep.map((i) => table.moves?.[i] ?? null) };
  }, [table, conf]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {(["individual", "team"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${kind === k ? "bg-owl-red text-white" : "text-text-dim hover:text-text"}`}
            >
              {k === "individual" ? "Players" : "Teams"}
            </button>
          ))}
        </div>
        <select value={activeKey ?? ""} onChange={(e) => setKey(e.target.value)} className={selectClass} aria-label="Stat">
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <select value={conf} onChange={(e) => setConf(e.target.value)} className={selectClass} aria-label="Conference">
          <option value="all">All of D1</option>
          {index?.conferences.map((c) => (
            <option key={c.seo} value={c.seo}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <Card className="p-2 sm:p-3">
        {isLoading ? (
          <div className="py-12 text-center text-text-dim">Loading…</div>
        ) : error || !filtered ? (
          <div className="py-12 text-center text-sm text-text-dim">These stats haven&rsquo;t loaded yet. Check back in a few minutes.</div>
        ) : (
          <NcaaStatTable table={filtered} ourTeam={table!.ourTeam} />
        )}
      </Card>
      <p className="text-xs text-text-dim">
        {table?.updatedAt && `${updatedLabel(table.updatedAt)} · `}
        {kind === "individual" ? "Player tables cover NCAA's national top 200." : "All D1 teams."} Arrows show movement since the previous day.
        Source: NCAA.com.
      </p>
    </div>
  );
}

// ---- Rankings -----------------------------------------------------------------

function RankingsTab() {
  const { data, isLoading } = useNcaaRankings();
  const [conf, setConf] = useState("all");
  if (isLoading || !data) return <div className="py-16 text-center text-text-dim">Loading rankings…</div>;
  const [poll, rpi] = data.tables;
  const rpiConfs = [...new Set(rpi?.teams.filter(Boolean).map((t) => t!.conf).filter(Boolean) as string[])].sort();
  const rpiFiltered =
    rpi && conf !== "all"
      ? (() => {
          const keep = rpi.rows.map((_, i) => i).filter((i) => rpi.teams[i]?.conf === conf);
          return { ...rpi, rows: keep.map((i) => rpi.rows[i]), teams: keep.map((i) => rpi.teams[i]), moves: keep.map((i) => rpi.moves?.[i] ?? null) };
        })()
      : rpi;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="min-w-0">
        <SectionHeading title={poll?.label ?? "Top 25"} subtitle={updatedLabel(poll?.updatedAt)} />
        <Card className="p-2 sm:p-3">
          {poll?.rows.length ? <NcaaStatTable table={poll} ourTeam={data.ourTeam} /> : <Empty />}
        </Card>
      </section>
      <section className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <SectionHeading title={rpi?.label ?? "RPI"} subtitle={updatedLabel(rpi?.updatedAt)} />
          <select value={conf} onChange={(e) => setConf(e.target.value)} className={`${selectClass} mb-3`} aria-label="Conference">
            <option value="all">All teams</option>
            {rpiConfs.map((c) => (
              <option key={c} value={c}>
                {rpi?.rows[rpi.teams.findIndex((t) => t?.conf === c)]?.[3] ?? c}
              </option>
            ))}
          </select>
        </div>
        <Card className="p-2 sm:p-3">
          {rpiFiltered?.rows.length ? (
            <NcaaStatTable table={rpiFiltered} ourTeam={data.ourTeam} hideColumns={["Non-Div I", "Prev"]} />
          ) : (
            <Empty />
          )}
        </Card>
      </section>
    </div>
  );
}

function Empty() {
  return <div className="py-12 text-center text-sm text-text-dim">Not loaded yet. Check back in a few minutes.</div>;
}
