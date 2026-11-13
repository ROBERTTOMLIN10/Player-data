import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMe, useSquadReadiness } from "../api/client";
import { BodyMap, SeverityLegend } from "../components/BodyMap";
import { Card, SectionHeading } from "../components/Card";
import { regionLabel, SEVERITY_STYLE } from "../lib/bodyRegions";
import { formatDateLong } from "../lib/format";
import { positionGroup } from "../lib/positions";
import { STATUS_STYLE, WELLNESS_QUESTIONS, wellnessTextClass } from "../lib/readiness";
import type { ReadinessStatus, Severity, SquadReadinessPlayer } from "../types";
import { OpponentLink } from "../components/ncaa";
import { CarePanel } from "../components/CarePanel";
import { InjuryReport } from "../components/InjuryReport";
import { Segmented } from "../components/SeasonStats";
import { CheckinAlerts } from "../components/CheckinAlerts";
import { BeforeTraining } from "../components/BeforeTraining";

type Filter = "all" | "flagged" | "missing";

const STATUS_ORDER: Record<ReadinessStatus, number> = { red: 0, amber: 1, green: 2, missing: 3 };

function shiftIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type View = "board" | "practice" | "report";

/**
 * Readiness for coaches and the athletic trainer: the morning readiness board (with
 * each player's care: play status, appointments, notes), Pre practice (who
 * may miss part or all of practice, the AT → coach decision, then who's settled at
 * what play status) and the live injury report.
 * Tapping a player opens their care panel.
 */
export default function ReadinessView() {
  const [params, setParams] = useSearchParams();
  const dateParam = params.get("date");
  const { data: me } = useMe();
  // The AT has Pre practice and the injury report on their Injuries tab; here they get the board.
  const isTrainer = me?.role === "trainer";
  const view: View = isTrainer ? "board" : params.get("view") === "report" ? "report" : params.get("view") === "practice" ? "practice" : "board";
  const { data, isLoading } = useSquadReadiness(dateParam);
  const [filter, setFilter] = useState<Filter>("all");
  const [careFor, setCareFor] = useState<{ id: number; name: string } | null>(null);

  const setParam = (key: string, value: string | null) => {
    const next = Object.fromEntries(params.entries());
    if (value === null) delete next[key];
    else next[key] = value;
    setParams(next, { replace: true });
  };
  const setDate = (date: string | null) => setParam("date", date);

  // A check-in alert links here with ?care=<player id>: open that player's care panel.
  const careParam = params.get("care");
  useEffect(() => {
    if (!careParam || !data) return;
    const p = data.players.find((x) => x.player_id === Number(careParam));
    if (p) setCareFor({ id: p.player_id, name: p.name });
    setParam("care", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [careParam, data]);

  const players = useMemo(() => {
    const list = [...(data?.players ?? [])].sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.entry?.readiness_score ?? 0) - (b.entry?.readiness_score ?? 0),
    );
    if (filter === "flagged") return list.filter((p) => p.status === "red" || p.status === "amber");
    if (filter === "missing") return list.filter((p) => p.status === "missing");
    return list;
  }, [data, filter]);

  // Squad heatmap: each region coloured by the worst severity reported today.
  const { heat, heatTitles } = useMemo(() => {
    const heat: Record<string, Severity> = {};
    const heatTitles: Record<string, string> = {};
    for (const [region, c] of Object.entries(data?.regionCounts ?? {})) {
      heat[region] = c.severe ? "severe" : c.moderate ? "moderate" : "light";
      const parts = (["severe", "moderate", "light"] as const).filter((s) => c[s]).map((s) => `${c[s]} ${s}`);
      heatTitles[region] = `${regionLabel(region)}: ${parts.join(", ")}`;
    }
    return { heat, heatTitles };
  }, [data]);

  if (isLoading || !data) return <div className="py-20 text-center text-text-dim">Loading readiness…</div>;

  const isToday = data.date === data.today;
  const { summary } = data;
  const hotspots = Object.entries(data.regionCounts)
    .map(([region, c]) => ({ region, total: c.light + c.moderate + c.severe, worst: heat[region] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const carePanel = careFor && (
    <CarePanel
      playerId={careFor.id}
      name={careFor.name}
      date={data.date}
      entry={data.players.find((p) => p.player_id === careFor.id)?.entry ?? null}
      onClose={() => setCareFor(null)}
    />
  );
  const toggle = (
    <div className={`flex flex-wrap items-center justify-center gap-3 ${isTrainer ? "sm:justify-end" : "sm:justify-between"}`}>
      {!isTrainer && <span className="hidden w-44 sm:block" />}
      {!isTrainer && <Segmented
        value={view}
        options={[
          { key: "board", label: "Readiness" },
          { key: "practice", label: "Pre practice" },
          { key: "report", label: "Injury report" },
        ]}
        onChange={(v) => setParam("view", v === "board" ? null : v)}
        label="Readiness view"
      />}
      <div className="flex sm:w-44 sm:justify-end">
        <CheckinAlerts />
      </div>
    </div>
  );

  if (view === "practice") {
    return (
      <div className="flex flex-col gap-5">
        {toggle}
        <BeforeTraining date={dateParam} onOpenPlayer={(p) => setCareFor(p)} onDateChange={setDate} />
        {carePanel}
      </div>
    );
  }

  if (view === "report") {
    return (
      <div className="flex flex-col gap-5">
        {toggle}
        <InjuryReport date={dateParam} onOpenPlayer={(p) => setCareFor({ id: p.player_id, name: p.name })} />
        {carePanel}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {toggle}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionHeading
            title="Squad Readiness"
            subtitle={
              <>
                {formatDateLong(data.date)}
                {data.game && (
                  <>
                    {" · Game day vs "}
                    <OpponentLink date={data.date}>{data.game.opponent}</OpponentLink>
                  </>
                )}
              </>
            }
          />
        </div>
        <div className="mb-3 flex items-center gap-1">
          <button
            onClick={() => setDate(shiftIso(data.date, -1))}
            className="rounded-md border border-border px-2.5 py-1.5 text-sm text-text-dim hover:text-text"
            aria-label="Previous day"
          >
            ←
          </button>
          <input
            type="date"
            value={data.date}
            max={data.today}
            onChange={(e) => setDate(e.target.value || null)}
            className="rounded-md border border-border bg-surface-raised px-2 py-1.5 text-sm text-text outline-none focus:border-owl-red"
          />
          <button
            onClick={() => setDate(shiftIso(data.date, 1))}
            disabled={isToday}
            className="rounded-md border border-border px-2.5 py-1.5 text-sm text-text-dim hover:text-text disabled:opacity-30"
            aria-label="Next day"
          >
            →
          </button>
          {!isToday && (
            <button onClick={() => setDate(null)} className="ml-1 text-sm text-owl-red-light hover:underline">
              Today
            </button>
          )}
        </div>
      </div>

      {data.accountCount === 0 && (
        <Card className="text-sm text-text-dim">
          No player logins yet. Create them on the{" "}
          <Link to="/data" className="text-owl-red-light hover:underline">
            Data
          </Link>{" "}
          page and players can start checking in from their phones.
        </Card>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <SummaryTile label="Checked in" value={`${summary.submitted}/${summary.expected}`} />
        <SummaryTile label="Watch" value={summary.red} dot={STATUS_STYLE.red.dot} />
        <SummaryTile label="Monitor" value={summary.amber} dot={STATUS_STYLE.amber.dot} />
        <SummaryTile label="Good" value={summary.green} dot={STATUS_STYLE.green.dot} />
        <SummaryTile label="Squad avg" value={summary.averageScore === null ? "—" : `${summary.averageScore}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="min-w-0">
          <div className="mb-3 flex gap-1">
            {(["all", "flagged", "missing"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wide ${
                  filter === f ? "bg-owl-red text-white" : "border border-border text-text-dim hover:text-text"
                }`}
              >
                {f === "all" ? "All" : f === "flagged" ? `Flagged (${summary.red + summary.amber})` : `Not in (${summary.expected - summary.submitted})`}
              </button>
            ))}
          </div>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-3 py-3 font-medium">Player</th>
                  <th className="px-3 py-3 font-medium">Score</th>
                  <th className="px-3 py-3 font-medium">Sleep</th>
                  {WELLNESS_QUESTIONS.slice(1).map((q) => (
                    <th key={q.key} className="px-2 py-3 text-center font-medium">
                      {q.short}
                    </th>
                  ))}
                  <th className="px-3 py-3 font-medium">Body / Notes</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <PlayerRow key={p.player_id} p={p} onOpen={() => setCareFor({ id: p.player_id, name: p.name })} />
                ))}
                {players.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-text-dim">
                      Nobody here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-text-dim">
            Score is the player&rsquo;s own readiness out of 10, as a %. Watch: 5/10 or lower, or severe soreness. Monitor:
            6–7/10, moderate soreness, under 6h sleep, or 15+ below their usual. Wellness answers are 1–5 where 5 is good.
          </p>
        </section>

        <aside className="flex flex-col gap-3">
          <Card className="flex flex-col gap-3">
            <div>
              <h3 className="font-display font-semibold">Squad soreness</h3>
              <p className="text-xs text-text-dim">Worst severity reported per area. Hover for counts.</p>
            </div>
            <BodyMap severities={heat} titles={heatTitles} />
            <SeverityLegend />
            {hotspots.length > 0 && (
              <ul className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
                {hotspots.map((h) => (
                  <li key={h.region} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEVERITY_STYLE[h.worst].color }} />
                      {regionLabel(h.region)}
                    </span>
                    <span className="text-text-dim">
                      {h.total} player{h.total === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
      {carePanel}
    </div>
  );
}

function PlayerRow({ p, onOpen }: { p: SquadReadinessPlayer; onOpen: () => void }) {
  const e = p.entry;
  const style = STATUS_STYLE[p.status];
  const group = positionGroup(p.position);
  return (
    <tr className="border-b border-border/60 align-top last:border-0">
      <td className="px-3 py-3">
        <button onClick={onOpen} className="flex items-center gap-2 text-left font-medium hover:text-owl-red-light" title="Open care: play status, treatment, notes">
          <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} title={style.label} />
          {p.name}
        </button>
        <div className="pl-4 text-xs text-text-dim">
          {group !== "Unassigned" ? group.replace(/s$/, "") : ""}
          {e && (
            <>
              {group !== "Unassigned" ? " · " : ""}
              {new Date(`${e.updated_at.replace(" ", "T")}Z`).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </>
          )}
        </div>
      </td>
      {e ? (
        <>
          <td className="px-3 py-3">
            <span className={`rounded-md border px-2 py-0.5 font-display font-semibold ${style.pill}`}>{e.readiness_score}</span>
            {p.baseline !== null && <div className="mt-1 text-[11px] text-text-dim">usual {p.baseline}</div>}
          </td>
          <td className="whitespace-nowrap px-3 py-3">
            <span className={wellnessTextClass(e.sleep_quality)}>{e.sleep_quality}</span>
            <span className="text-text-dim">{e.sleep_hours !== null ? ` · ${e.sleep_hours}h` : ""}</span>
          </td>
          {WELLNESS_QUESTIONS.slice(1).map((q) => (
            <td key={q.key} className={`px-2 py-3 text-center font-medium ${wellnessTextClass(e[q.key])}`}>
              {e[q.key]}
            </td>
          ))}
          <td className="px-3 py-3">
            <div className="flex max-w-xs flex-wrap gap-1">
              {e.soreness.map((s) => (
                <span
                  key={s.region}
                  title={s.note ?? undefined}
                  className={`rounded-full border px-1.5 py-px text-[11px] ${SEVERITY_STYLE[s.severity].chip}`}
                >
                  {regionLabel(s.region)} · {SEVERITY_STYLE[s.severity].label}
                </span>
              ))}
              {p.flags
                .filter((f) => !f.includes("soreness"))
                .map((f) => (
                  <span key={f} className="rounded-full border border-border px-1.5 py-px text-[11px] text-text-dim">
                    {f}
                  </span>
                ))}
            </div>
            {(e.notes || e.soreness.some((s) => s.note)) && (
              <div className="mt-1 max-w-xs text-xs text-text-dim">
                {e.soreness
                  .filter((s) => s.note)
                  .map((s) => `${regionLabel(s.region)}: ${s.note}`)
                  .concat(e.notes ? [e.notes] : [])
                  .join(" · ")}
              </div>
            )}
          </td>
        </>
      ) : (
        <td colSpan={7} className="px-3 py-3 text-text-dim">
          Not checked in
        </td>
      )}
    </tr>
  );
}

function SummaryTile({ label, value, dot }: { label: string; value: string | number; dot?: string }) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-text-dim sm:text-xs">
        {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-semibold sm:text-2xl">{value}</div>
    </Card>
  );
}
