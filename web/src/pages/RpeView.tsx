import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { saveRpe, useRpeSession, useRpeTrends } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { RpePill, sessionLabel } from "../components/RpeHistory";
import { Segmented } from "../components/SeasonStats";
import { TrendChart } from "../components/TrendChart";
import { formatDate, formatDateLong } from "../lib/format";
import { positionGroup, ROSTER_SECTIONS } from "../lib/positions";
import { STATUS_STYLE } from "../lib/readiness";
import { formatRpe, rpeBand, rpeLabel, RPE_SCALE, RPE_STYLE } from "../lib/rpe";
import type { MetricDef, ReadinessStatus, RpeSession, RpeSessionPlayer } from "../types";

type View = "log" | "trends";
const VIEWS: { key: View; label: string }[] = [
  { key: "log", label: "Log" },
  { key: "trends", label: "Trends" },
];

const RPE_METRIC: MetricDef = { key: "average", label: "Squad RPE", unit: "", decimals: 1 };

function shiftIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const jersey = (n: string | null) => (n ? <span className="mr-1.5 text-xs font-normal text-text-dim">#{n}</span> : null);

/**
 * Coaches' RPE tab. Log: after training, ask each player and tap their 1–10
 * score (saved straight away; tap it again to clear). Trends: each player's
 * 7-day and Last Month averages, flags for planning the next session, and the
 * squad's average over the last month.
 */
export default function RpeView() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "trends" ? "trends" : "log";
  const set = (next: Record<string, string | null>) => {
    const merged = Object.fromEntries(params.entries());
    for (const [k, v] of Object.entries(next)) if (v === null) delete merged[k];
    else merged[k] = v;
    setParams(merged, { replace: true });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-center">
        <Segmented value={view} options={VIEWS} onChange={(v) => set({ view: v === "log" ? null : v })} label="RPE" />
      </div>
      {view === "trends" ? <Trends /> : <LogSession date={params.get("date")} session={params.get("session") === "2" ? 2 : 1} set={set} />}
    </div>
  );
}

function LogSession({ date, session, set }: { date: string | null; session: number; set: (n: Record<string, string | null>) => void }) {
  const { data, isLoading } = useRpeSession(date, session);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const [error, setError] = useState<string | null>(null);

  const sections = useMemo(() => {
    const list = (data?.players ?? []).filter((p) => filter === "all" || p.rpe === null);
    return ROSTER_SECTIONS.map(({ group, label }) => ({
      label,
      players: list.filter((p) => positionGroup(p.position) === group).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((s) => s.players.length);
  }, [data, filter]);

  if (isLoading || !data) return <div className="py-20 text-center text-text-dim">Loading RPE…</div>;

  const key = ["rpeSession", date, session];
  const isToday = data.date === data.today;
  const flagged = data.players.filter((p) => p.flags.length);
  const hard = data.players.filter((p) => p.rpe !== null && p.rpe >= 7).length;

  async function log(p: RpeSessionPlayer, rpe: number | null) {
    setError(null);
    const previous = queryClient.getQueryData<RpeSession>(key);
    // Show it straight away; the server's averages and flags follow on refetch.
    queryClient.setQueryData<RpeSession>(key, (old) => {
      if (!old) return old;
      const players = old.players.map((x) => (x.player_id === p.player_id ? { ...x, rpe } : x));
      const logged = players.filter((x) => x.rpe !== null);
      const average = logged.length ? Math.round((logged.reduce((a, x) => a + x.rpe!, 0) / logged.length) * 10) / 10 : null;
      return { ...old, players, summary: { ...old.summary, logged: logged.length, average } };
    });
    try {
      await saveRpe({ player_id: p.player_id, date: data!.date, session, rpe });
      queryClient.invalidateQueries({ queryKey: ["rpeSession"] });
      queryClient.invalidateQueries({ queryKey: ["rpeTrends"] });
      queryClient.invalidateQueries({ queryKey: ["playerRpe", p.player_id] });
    } catch (err) {
      queryClient.setQueryData(key, previous);
      setError(`Couldn't save ${p.name}'s score: ${(err as Error).message}`);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading
          title="Session RPE"
          subtitle={`${formatDateLong(data.date)}${data.game ? ` · Game day vs ${data.game.opponent}` : ""} · ask each player how hard training felt, then tap 1–10`}
        />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => set({ date: shiftIso(data.date, -1) })}
              className="rounded-md border border-border px-2.5 py-1.5 text-sm text-text-dim hover:text-text"
              aria-label="Previous day"
            >
              ←
            </button>
            <input
              type="date"
              value={data.date}
              max={data.today}
              onChange={(e) => set({ date: e.target.value || null })}
              className="rounded-md border border-border bg-surface-raised px-2 py-1.5 text-sm text-text outline-none focus:border-owl-red"
            />
            <button
              onClick={() => set({ date: shiftIso(data.date, 1) === data.today ? null : shiftIso(data.date, 1) })}
              disabled={isToday}
              className="rounded-md border border-border px-2.5 py-1.5 text-sm text-text-dim hover:text-text disabled:opacity-30"
              aria-label="Next day"
            >
              →
            </button>
            {!isToday && (
              <button onClick={() => set({ date: null })} className="ml-1 text-sm text-owl-red-light hover:underline">
                Today
              </button>
            )}
          </div>
          <Segmented
            value={String(session) as "1" | "2"}
            options={[
              { key: "1", label: "Session 1" },
              { key: "2", label: data.sessions.includes(2) ? "Session 2" : "+ Session 2" },
            ]}
            onChange={(v) => set({ session: v === "2" ? "2" : null })}
            label="Session"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Logged" value={`${data.summary.logged}/${data.summary.expected}`} />
        <Tile label="Squad avg" value={formatRpe(data.summary.average)} color={data.summary.average ? RPE_STYLE[rpeBand(Math.round(data.summary.average))].hex : undefined} />
        <Tile label="Hard (7+)" value={String(hard)} />
        <Tile label="Flags" value={String(flagged.length)} />
      </div>

      {flagged.length > 0 && (
        <Card className="border-gold/40">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gold">Planning the next session</div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {flagged.map((p) => (
              <li key={p.player_id} className="flex flex-wrap items-center gap-2">
                <Link to={`/players/${p.player_id}`} className="font-medium hover:text-owl-red-light">
                  {jersey(p.jersey_number)}
                  {p.name}
                </Link>
                {p.rpe !== null && <RpePill rpe={p.rpe} />}
                <span className="text-text-dim">{p.flags.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && <Card className="border-owl-red/50 text-sm text-owl-red-light">{error}</Card>}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["all", "missing"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wide ${
                filter === f ? "bg-owl-red text-white" : "border border-border text-text-dim hover:text-text"
              }`}
            >
              {f === "all" ? "All" : `Not logged (${data.summary.expected - data.summary.logged})`}
            </button>
          ))}
        </div>
        <ScaleKey />
      </div>

      {sections.length === 0 && (
        <Card className="text-sm text-text-dim">{filter === "missing" ? "Everyone's logged for this session." : "No players yet."}</Card>
      )}
      {sections.map((s) => (
        <section key={s.label}>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-text">{s.label}</h3>
            <span className="text-xs text-text-dim">{s.players.length}</span>
          </div>
          <Card className="divide-y divide-border/60 p-0">
            {s.players.map((p) => (
              <PlayerRow key={p.player_id} p={p} onLog={(rpe) => log(p, rpe)} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

function PlayerRow({ p, onLog }: { p: RpeSessionPlayer; onLog: (rpe: number | null) => void }) {
  const readiness = p.readiness ? STATUS_STYLE[p.readiness.status as ReadinessStatus] : null;
  return (
    <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 sm:w-56">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">
            {jersey(p.jersey_number)}
            {p.name}
          </span>
          {readiness && (
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${readiness.dot}`}
              title={`Readiness today: ${p.readiness!.score}% (${readiness.label})`}
            />
          )}
        </div>
        <div className="text-xs text-text-dim">
          {p.rpe !== null ? <span style={{ color: RPE_STYLE[rpeBand(p.rpe)].hex }}>{rpeLabel(p.rpe)}</span> : "Not logged"}
          {" · "}7-day {formatRpe(p.averages.week)} · Last Month {formatRpe(p.averages.month)}
        </div>
      </div>
      <div className="grid flex-1 grid-cols-10 gap-1" role="radiogroup" aria-label={`${p.name}'s RPE`}>
        {RPE_SCALE.map(({ value, label }) => {
          const on = p.rpe === value;
          return (
            <button
              key={value}
              role="radio"
              aria-checked={on}
              title={`${value} · ${label}${on ? " (tap again to clear)" : ""}`}
              onClick={() => onLog(on ? null : value)}
              className={`h-10 rounded-md text-sm font-semibold transition-colors ${
                on ? RPE_STYLE[rpeBand(value)].button : "border border-border bg-surface text-text-dim hover:border-text-dim hover:text-text"
              }`}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScaleKey() {
  return (
    <div className="hidden items-center gap-3 text-xs text-text-dim sm:flex">
      {(["easy", "moderate", "hard", "veryHard"] as const).map((b) => (
        <span key={b} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: RPE_STYLE[b].hex }} />
          {RPE_STYLE[b].label}
        </span>
      ))}
    </div>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card className="p-3 text-center">
      <div className="font-display text-xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="text-xs uppercase tracking-wide text-text-dim">{label}</div>
    </Card>
  );
}

function Trends() {
  const { data, isLoading } = useRpeTrends();
  if (isLoading || !data) return <div className="py-20 text-center text-text-dim">Loading RPE…</div>;

  const players = [...data.players].sort(
    (a, b) =>
      Number(b.flags.length > 0) - Number(a.flags.length > 0) ||
      (b.averages.week ?? -1) - (a.averages.week ?? -1) ||
      a.name.localeCompare(b.name),
  );

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="RPE Trends"
        subtitle={data.lastSession ? `Last session logged ${formatDateLong(data.lastSession)}` : "No sessions logged yet"}
      />
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Squad 7-day" value={formatRpe(data.squad.week)} />
        <Tile label="Squad Last Month" value={formatRpe(data.squad.month)} />
        <Tile label="Flagged" value={String(players.filter((p) => p.flags.length).length)} />
      </div>

      {data.daily.length > 1 && (
        <Card>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-dim">Squad average · Last Month</div>
          <TrendChart
            data={data.daily}
            xKey="date"
            xFormatter={formatDate}
            metric={RPE_METRIC}
            series={[{ dataKey: "average", name: "Squad RPE", color: "#fb923c" }]}
            referenceValue={data.squad.month ?? undefined}
            referenceLabel="Month avg"
            height={220}
            yDomain={[0, 10]}
            labelFor={(d) => {
              const day = data.daily.find((x) => x.date === d);
              return `${formatDate(d)}${day ? ` · ${day.logged} logged` : ""}`;
            }}
          />
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
              <th className="px-4 py-3 font-medium">Player</th>
              <th className="px-4 py-3 font-medium">Last session</th>
              <th className="px-4 py-3 font-medium">7-day</th>
              <th className="px-4 py-3 font-medium">Last Month</th>
              <th className="px-4 py-3 font-medium">Sessions</th>
              <th className="px-4 py-3 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.player_id} className="border-b border-border/60 last:border-0">
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  <Link to={`/players/${p.player_id}`} className="hover:text-owl-red-light">
                    {jersey(p.jersey_number)}
                    {p.name}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {p.last ? (
                    <span className="flex items-center gap-2">
                      <RpePill rpe={p.last.rpe} />
                      <span className="text-xs text-text-dim">{sessionLabel(p.last)}</span>
                    </span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
                <td className="px-4 py-3" style={p.averages.week ? { color: RPE_STYLE[rpeBand(Math.round(p.averages.week))].hex } : undefined}>
                  {formatRpe(p.averages.week)}
                </td>
                <td className="px-4 py-3 text-text-dim">{formatRpe(p.averages.month)}</td>
                <td className="px-4 py-3 text-text-dim">{p.averages.monthSessions}</td>
                <td className="px-4 py-3 text-xs text-gold">{p.flags.join(" · ") || <span className="text-text-dim">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
