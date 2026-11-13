import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { saveRpe, submitRpeSession, useRpeSession, useRpeSessions, useRpeTrends, useMe } from "../api/client";
import { Card, SectionHeading } from "../components/Card";
import { RpePill, sessionLabel } from "../components/RpeHistory";
import { Segmented } from "../components/SeasonStats";
import { TrendChart } from "../components/TrendChart";
import { formatDate, formatDateLong } from "../lib/format";
import { STATUS_STYLE } from "../lib/readiness";
import { formatRpe, rpeBand, rpeLabel, RPE_SCALE, RPE_STYLE } from "../lib/rpe";
import type { MetricDef, ReadinessStatus, RpeSession, RpeSessionKeeper, RpeSessionPlayer } from "../types";
import { OpponentLink } from "../components/ncaa";

/** Who a score is for: an outfield player, or a roster goalkeeper (logged and averaged separately). */
type Target = { player_id: number } | { keeper_name: string };
const isTarget = (row: RpeSessionPlayer | RpeSessionKeeper, t: Target) =>
  "player_id" in t ? "player_id" in row && row.player_id === t.player_id : !("player_id" in row) && row.name === t.keeper_name;

/** Logged counts N/A (they've been asked); the average only uses scores. */
const averageOf = (list: { rpe: number | null; na: boolean }[]) => {
  const scored = list.filter((x) => x.rpe !== null);
  return {
    logged: scored.length + list.filter((x) => x.na).length,
    na: list.filter((x) => x.na).length,
    average: scored.length ? Math.round((scored.reduce((a, x) => a + x.rpe!, 0) / scored.length) * 10) / 10 : null,
  };
};

type LogValue = number | "na" | null;

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
export default function RpeView({ trendsOnly = false }: { trendsOnly?: boolean }) {
  const [params, setParams] = useSearchParams();
  // The athletic trainer's view shows only the trends (logging RPE is for coaches).
  const view: View = trendsOnly || params.get("view") === "trends" ? "trends" : "log";
  const set = (next: Record<string, string | null>) => {
    const merged = Object.fromEntries(params.entries());
    for (const [k, v] of Object.entries(next)) if (v === null) delete merged[k];
    else merged[k] = v;
    setParams(merged, { replace: true });
  };

  return (
    <div className="flex flex-col gap-5">
      {!trendsOnly && (
        <div className="flex justify-center">
          <Segmented value={view} options={VIEWS} onChange={(v) => set({ view: v === "log" ? null : v, sd: null, s: null })} label="RPE" />
        </div>
      )}
      {view === "trends" ? (
        <Trends
          open={params.get("sd") ? { date: params.get("sd")!, session: params.get("s") === "2" ? 2 : 1 } : null}
          onOpen={(x) => set({ sd: x?.date ?? null, s: x && x.session === 2 ? "2" : null })}
        />
      ) : (
        <LogSession date={params.get("date")} session={params.get("session") === "2" ? 2 : 1} set={set} />
      )}
    </div>
  );
}

function LogSession({ date, session, set }: { date: string | null; session: number; set: (n: Record<string, string | null>) => void }) {
  const { data, isLoading } = useRpeSession(date, session);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // Alphabetical by first name (names are stored first name first), keepers in their own list.
  const byName = <T extends { name: string; rpe: number | null; na: boolean }>(list: T[]) =>
    list.filter((p) => filter === "all" || (p.rpe === null && !p.na)).sort((a, b) => a.name.localeCompare(b.name));
  const players = byName(data?.players ?? []);
  const keepers = byName(data?.keepers ?? []);

  if (isLoading || !data) return <div className="py-20 text-center text-text-dim">Loading RPE…</div>;

  const key = ["rpeSession", date, session];
  const isToday = data.date === data.today;
  const hard = data.players.filter((p) => p.rpe !== null && p.rpe >= 7).length;
  const total = data.summary.expected + data.keeperSummary.expected;
  const logged = data.summary.logged + data.keeperSummary.logged;
  const remaining = total - logged;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await submitRpeSession(data!.date, session);
      await queryClient.invalidateQueries({ queryKey: ["rpeSession"] });
      queryClient.invalidateQueries({ queryKey: ["rpeSessions"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function log(name: string, target: Target, value: LogValue) {
    const rpe = typeof value === "number" ? value : null;
    const na = value === "na";
    setError(null);
    const previous = queryClient.getQueryData<RpeSession>(key);
    // Show it straight away; the server's averages and flags follow on refetch.
    queryClient.setQueryData<RpeSession>(key, (old) => {
      if (!old) return old;
      const players = old.players.map((x) => (isTarget(x, target) ? { ...x, rpe, na } : x));
      const keepers = old.keepers.map((x) => (isTarget(x, target) ? { ...x, rpe, na } : x));
      return {
        ...old,
        players,
        keepers,
        summary: { ...old.summary, ...averageOf(players) },
        keeperSummary: { ...old.keeperSummary, ...averageOf(keepers) },
      };
    });
    try {
      await saveRpe({ ...target, date: data!.date, session, rpe: value });
      queryClient.invalidateQueries({ queryKey: ["rpeSessions"] });
      queryClient.invalidateQueries({ queryKey: ["rpeSession"] });
      queryClient.invalidateQueries({ queryKey: ["rpeTrends"] });
      if ("player_id" in target) queryClient.invalidateQueries({ queryKey: ["playerRpe", target.player_id] });
    } catch (err) {
      queryClient.setQueryData(key, previous);
      setError(`Couldn't save ${name}'s score: ${(err as Error).message}`);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading
          title="Session RPE"
          subtitle={
            <>
              {formatDateLong(data.date)}
              {data.game && (
                <>
                  {" · Game day vs "}
                  <OpponentLink date={data.date}>{data.game.opponent}</OpponentLink>
                </>
              )}
              {" · ask each player how hard training felt, then tap 1–10"}
            </>
          }
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
        <Tile label="Logged" value={`${logged}/${total}`} />
        <Tile label="Outfield avg" value={formatRpe(data.summary.average)} color={bandHex(data.summary.average)} />
        <Tile label="Keepers avg" value={formatRpe(data.keeperSummary.average)} color={bandHex(data.keeperSummary.average)} />
        <Tile label="Hard (7+)" value={String(hard)} />
      </div>

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
              {f === "all"
                ? "All"
                : `Not logged (${remaining})`}
            </button>
          ))}
        </div>
        <ScaleKey />
      </div>

      {players.length === 0 && keepers.length === 0 && (
        <Card className="text-sm text-text-dim">{filter === "missing" ? "Everyone's logged for this session." : "No players yet."}</Card>
      )}
      {players.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-text">Players</h3>
            <span className="text-xs text-text-dim">{players.length}</span>
          </div>
          <Card className="divide-y divide-border/60 p-0">
            {players.map((p) => (
              <PlayerRow key={p.player_id} p={p} onLog={(rpe) => log(p.name, { player_id: p.player_id }, rpe)} />
            ))}
          </Card>
        </section>
      )}
      {keepers.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-text">Goalkeepers</h3>
            <span className="text-xs text-text-dim">{keepers.length}</span>
            <span className="ml-auto text-xs text-text-dim">
              Averaged separately · keepers avg{" "}
              <span style={{ color: bandHex(data.keeperSummary.average) }}>{formatRpe(data.keeperSummary.average)}</span> ·{" "}
              {data.keeperSummary.logged}/{data.keeperSummary.expected} logged
            </span>
          </div>
          <Card className="divide-y divide-border/60 p-0">
            {keepers.map((k) => (
              <PlayerRow key={k.name} p={k} onLog={(rpe) => log(k.name, { keeper_name: k.name }, rpe)} />
            ))}
          </Card>
        </section>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-ink/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        {data.submitted ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-teal">
              ✓ {session === 2 ? "Session 2" : "Session"} submitted {submittedTime(data.submitted.submitted_at)} · players can see their scores
            </span>
            {remaining === 0 && (
              <button onClick={submit} disabled={submitting} className="text-xs text-text-dim hover:text-text">
                Resubmit
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-dim">
              {remaining === 0 ? "Everyone's logged." : `${remaining} still to log.`}
              <span className="hidden sm:inline"> Players see their score once the session is submitted.</span>
            </span>
            <button
              onClick={submit}
              disabled={remaining > 0 || submitting}
              className="shrink-0 rounded-md bg-owl-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-owl-red-light disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-text-dim"
            >
              {submitting ? "Submitting…" : session === 2 ? "Submit session 2" : "Submit session"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** "at 4:32 PM" today, or "Sep 26, 4:32 PM" (stored as UTC). */
function submittedTime(sqlUtc: string) {
  const d = new Date(`${sqlUtc.replace(" ", "T")}Z`);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `at ${time}` : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

const bandHex = (avg: number | null) => (avg ? RPE_STYLE[rpeBand(Math.round(avg))].hex : undefined);

function PlayerRow({ p, onLog }: { p: RpeSessionPlayer | RpeSessionKeeper; onLog: (value: LogValue) => void }) {
  const status = "readiness" in p && p.readiness ? p.readiness : null;
  const readiness = status ? STATUS_STYLE[status.status as ReadinessStatus] : null;
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
              title={`Readiness today: ${status!.score}% (${readiness.label})`}
            />
          )}
        </div>
        <div className="text-xs text-text-dim">
          {p.rpe !== null ? (
            <span style={{ color: RPE_STYLE[rpeBand(p.rpe)].hex }}>{rpeLabel(p.rpe)}</span>
          ) : p.na ? (
            <span className="text-text">Didn't train</span>
          ) : (
            "Not logged"
          )}
          {" · "}7-day {formatRpe(p.averages.week)} · Last Month {formatRpe(p.averages.month)}
        </div>
      </div>
      <div className="grid flex-1 grid-cols-11 gap-1" role="radiogroup" aria-label={`${p.name}'s RPE`}>
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
        <button
          role="radio"
          aria-checked={p.na}
          title={p.na ? "Didn't train (tap again to clear)" : "N/A: didn't train (injured, out). Kept out of averages."}
          onClick={() => onLog(p.na ? null : "na")}
          className={`h-10 rounded-md text-[11px] font-semibold transition-colors ${
            p.na ? "bg-text-dim text-ink" : "border border-dashed border-border bg-surface text-text-dim hover:border-text-dim hover:text-text"
          }`}
        >
          N/A
        </button>
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

function Trends({ open, onOpen }: { open: { date: string; session: number } | null; onOpen: (s: { date: string; session: number } | null) => void }) {
  const { data, isLoading } = useRpeTrends();
  const { data: list } = useRpeSessions();
  if (open) return <SessionDetail date={open.date} session={open.session} onBack={() => onOpen(null)} />;
  if (isLoading || !data) return <div className="py-20 text-center text-text-dim">Loading RPE…</div>;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title="RPE Trends"
        subtitle={data.lastSession ? `Last session logged ${formatDateLong(data.lastSession)}` : "No sessions logged yet"}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Outfield 7-day" value={formatRpe(data.squad.week)} color={bandHex(data.squad.week)} />
        <Tile label="Outfield Last Month" value={formatRpe(data.squad.month)} />
        <Tile label="Keepers 7-day" value={formatRpe(data.keeperAverages.week)} color={bandHex(data.keeperAverages.week)} />
        <Tile label="Keepers Last Month" value={formatRpe(data.keeperAverages.month)} />
      </div>

      {data.daily.length > 1 && (
        <Card>
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-dim">
            <span className="font-medium uppercase tracking-wide">Average RPE · Last Month</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: "#fb923c" }} /> Outfield
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: "#2dd4bf" }} /> Keepers
            </span>
          </div>
          <TrendChart
            data={data.daily}
            xKey="date"
            xFormatter={formatDate}
            metric={RPE_METRIC}
            series={[
              { dataKey: "average", name: "Outfield", color: "#fb923c" },
              { dataKey: "keepers", name: "Keepers", color: "#2dd4bf" },
            ]}
            referenceValue={data.squad.month ?? undefined}
            referenceLabel="Month avg"
            height={220}
            yDomain={[0, 10]}
            onPointClick={(p) => onOpen({ date: p.date, session: 1 })}
            labelFor={(d) => {
              const day = data.daily.find((x) => x.date === d);
              return `${formatDate(d)}${day ? ` · ${day.logged} logged` : ""}`;
            }}
          />
        </Card>
      )}

      <section>
        <div className="mb-2 flex items-baseline gap-2">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-text">Sessions</h3>
          <span className="text-xs text-text-dim">tap a session to see every player's score</span>
        </div>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-0 text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="px-3 py-3 sm:px-4 font-medium">Date</th>
                <th className="px-3 py-3 sm:px-4 font-medium">Avg RPE</th>
                <th className="px-3 py-3 sm:px-4 font-medium">Keepers</th>
                <th className="px-3 py-3 sm:px-4 font-medium">Flags</th>
                <th className="hidden px-3 py-3 sm:table-cell sm:px-4" />
              </tr>
            </thead>
            <tbody>
              {(list?.sessions ?? []).map((x) => (
                <tr
                  key={`${x.date}#${x.session}`}
                  onClick={() => onOpen({ date: x.date, session: x.session })}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-3 py-3 sm:px-4">
                    <div className="font-medium">
                      <span className="sm:hidden">{sessionLabel({ session_date: x.date, session: x.session })}</span>
                      <span className="hidden sm:inline">{sessionLabel({ session_date: x.date, session: x.session }, true)}</span>
                    </div>
                    <div className="text-xs text-text-dim">
                      {x.logged + x.keepersLogged} logged{x.na ? ` · ${x.na} N/A` : ""}
                      {!x.submitted && <span className="ml-1 text-gold">· not submitted</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 sm:px-4 font-semibold" style={{ color: bandHex(x.average) }}>
                    {formatRpe(x.average)}
                  </td>
                  <td className="px-3 py-3 sm:px-4" style={{ color: bandHex(x.keeperAverage) }}>
                    {formatRpe(x.keeperAverage)}
                  </td>
                  <td className="px-3 py-3 sm:px-4">{x.flagged ? <span className="text-gold">{x.flagged} flagged</span> : <span className="text-text-dim">—</span>}</td>
                  <td className="hidden px-3 py-3 text-right text-text-dim sm:table-cell sm:px-4">›</td>
                </tr>
              ))}
              {list && list.sessions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-text-dim">
                    No sessions logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}

/** One past session: every player's and keeper's score, with their 7-day and Last Month averages as of that day. */
function SessionDetail({ date, session, onBack }: { date: string; session: number; onBack: () => void }) {
  const { data, isLoading } = useRpeSession(date, session);
  if (isLoading || !data) return <div className="py-20 text-center text-text-dim">Loading session…</div>;
  const players = [...data.players].sort((a, b) => a.name.localeCompare(b.name));
  const keepers = [...data.keepers].sort((a, b) => a.name.localeCompare(b.name));
  const flagged = [...players, ...keepers].filter((p) => p.flags.length).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <SectionHeading
          title={sessionLabel({ session_date: date, session }, true)}
          subtitle={
            <>
              {data.submitted ? "Submitted" : "Not submitted yet"}
              {data.game && (
                <>
                  {" · Game day vs "}
                  <OpponentLink date={date}>{data.game.opponent}</OpponentLink>
                </>
              )}
            </>
          }
        />
        <button onClick={onBack} className="mb-3 text-sm text-text-dim hover:text-owl-red">
          ← All sessions
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Outfield avg" value={formatRpe(data.summary.average)} color={bandHex(data.summary.average)} />
        <Tile label="Keepers avg" value={formatRpe(data.keeperSummary.average)} color={bandHex(data.keeperSummary.average)} />
        <Tile label="Didn't train" value={String(data.summary.na + data.keeperSummary.na)} />
        <Tile label="Flagged" value={String(flagged)} />
      </div>
      <ScoreTable title="Players" rows={players} link />
      {keepers.length > 0 && <ScoreTable title="Goalkeepers" subtitle="averaged separately from the outfield squad" rows={keepers} />}
    </div>
  );
}

function ScoreTable({
  title,
  subtitle,
  rows,
  link = false,
}: {
  title: string;
  subtitle?: string;
  rows: (RpeSessionPlayer | RpeSessionKeeper)[];
  link?: boolean;
}) {
  // Player pages are for coaches; the athletic trainer sees plain names.
  const { data: me } = useMe();
  link = link && me?.role === "coach";
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-text">{title}</h3>
        <span className="text-xs text-text-dim">{subtitle ?? rows.length}</span>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
              <th className="px-4 py-3 font-medium">{title === "Goalkeepers" ? "Goalkeeper" : "Player"}</th>
              <th className="px-4 py-3 font-medium">RPE</th>
              <th className="px-4 py-3 font-medium">7-day</th>
              <th className="px-4 py-3 font-medium">Last Month</th>
              <th className="px-4 py-3 font-medium">Sessions</th>
              <th className="px-4 py-3 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={"player_id" in p ? p.player_id : p.name} className="border-b border-border/60 last:border-0">
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  {link && "player_id" in p ? (
                    <Link to={`/players/${p.player_id}`} className="hover:text-owl-red-light">
                      {jersey(p.jersey_number)}
                      {p.name}
                    </Link>
                  ) : (
                    <>
                      {jersey(p.jersey_number)}
                      {p.name}
                    </>
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.rpe !== null ? (
                    <RpePill rpe={p.rpe} />
                  ) : p.na ? (
                    <span className="rounded-md border border-border px-2 py-0.5 text-xs text-text-dim">N/A</span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
                <td className="px-4 py-3" style={{ color: bandHex(p.averages.week) }}>
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
    </section>
  );
}
