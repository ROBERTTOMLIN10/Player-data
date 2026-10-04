import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CARE_QUERY_KEYS, careApi, useIssue, useIssues } from "../api/client";
import { BeforeTraining } from "../components/BeforeTraining";
import { CarePanel } from "../components/CarePanel";
import { Card, SectionHeading } from "../components/Card";
import { Segmented } from "../components/SeasonStats";
import { regionLabel } from "../lib/bodyRegions";
import { categoryLabel, levelInfo, sideLabel, stageLabel, STAGES } from "../lib/care";
import { formatDate, formatDateLong } from "../lib/format";
import type { Issue, RtpStage } from "../types";

const input = "w-full rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-text outline-none focus:border-owl-red";
const button = "rounded-md bg-owl-red px-3 py-1.5 text-sm font-semibold text-white hover:bg-owl-red-light disabled:opacity-50";
const ghost = "rounded-md border border-border px-2.5 py-1 text-xs text-text-dim hover:text-text";
const daysSince = (from: string | null, to: string) => (from ? Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) : null);

/**
 * Injuries: first, who needs seeing before today's training (the AT calls them in,
 * messages them and sends the coach a recommendation); then the recovery tracker —
 * each injury or issue, where they are on the way back, and their history.
 */
export default function InjuriesView() {
  const { id } = useParams();
  return id ? <IssueDetailView id={Number(id)} /> : <IssueList />;
}

function IssueList() {
  const [show, setShow] = useState<"open" | "all">("open");
  const { data, isLoading } = useIssues(show === "all");
  const issues = data?.issues ?? [];
  const [params] = useSearchParams();
  const focus = params.get("player") ? Number(params.get("player")) : null;
  const [careFor, setCareFor] = useState<{ id: number; name: string } | null>(null);
  return (
    <div className="flex flex-col gap-5">
      <BeforeTraining date={null} onOpenPlayer={setCareFor} focusPlayerId={focus} />
      {careFor && data && <CarePanel playerId={careFor.id} name={careFor.name} date={data.today} entry={null} onClose={() => setCareFor(null)} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading title="Injuries" subtitle="Recovery tracker: each player's injury or issue, return-to-play stage and daily rehab" />
        <div className="mb-3">
          <Segmented
            value={show}
            options={[
              { key: "open", label: "Open" },
              { key: "all", label: "All" },
            ]}
            onChange={setShow}
            label="Show"
          />
        </div>
      </div>
      {isLoading ? (
        <div className="py-16 text-center text-text-dim">Loading…</div>
      ) : issues.length === 0 ? (
        <Card className="text-sm text-text-dim">Nothing open. Log an injury from a player&rsquo;s panel on the Readiness board.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border/60">
            {issues.map((i) => (
              <IssueRow key={i.id} issue={i} today={data!.today} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function IssueRow({ issue: i, today }: { issue: Issue; today: string }) {
  const stageIndex = STAGES.findIndex((s) => s.key === i.stage);
  const days = daysSince(i.injury_date, i.closed_at ?? today);
  return (
    <li>
      <Link to={`/injuries/${i.id}`} className={`flex flex-col gap-1.5 px-4 py-3 hover:bg-surface-raised sm:flex-row sm:items-center sm:gap-4 ${i.closed_at ? "opacity-60" : ""}`}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{i.player_name}</span>
            <span className="rounded border border-border px-1 text-[10px] uppercase text-text-dim">{categoryLabel(i.category)}</span>
            {i.closed_at && <span className="rounded-full border border-teal/40 bg-teal/10 px-1.5 text-[10px] text-teal">Recovered {formatDate(i.closed_at)}</span>}
          </div>
          <div className="text-sm text-text-dim">
            {i.description}
            {i.side ? ` (${sideLabel(i.side)})` : ""}
            {i.injury_date ? ` · since ${formatDate(i.injury_date)}` : ""}
            {days !== null ? ` · day ${days}` : ""}
            {i.expected_return ? ` · back ~${formatDate(i.expected_return)}` : ""}
          </div>
        </div>
        {i.category === "injury" && (
          <div className="flex shrink-0 items-center gap-1" title={stageLabel(i.stage)}>
            {STAGES.map((s, n) => (
              <span key={s.key} className={`h-1.5 w-6 rounded-full ${n <= stageIndex ? "bg-teal" : "bg-surface-raised"}`} />
            ))}
            <span className="ml-2 w-32 text-xs text-text-dim">{stageLabel(i.stage)}</span>
          </div>
        )}
      </Link>
    </li>
  );
}

function IssueDetailView({ id }: { id: number }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useIssue(id);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => Promise.all(CARE_QUERY_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <div className="py-16 text-center text-text-dim">Loading…</div>;
  if (error || !data) return <Card className="text-sm text-text-dim">Not found.</Card>;
  const { issue: i, player, stages, logs, painTrend, availability, today } = data;
  const stageIndex = STAGES.findIndex((s) => s.key === i.stage);
  const days = daysSince(i.injury_date, i.closed_at ?? today);

  return (
    <div className="flex flex-col gap-5">
      <button onClick={() => navigate(-1)} className="self-start text-sm text-text-dim hover:text-owl-red">
        ← Back
      </button>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-text-dim">
              {categoryLabel(i.category)} · {player.name}
            </div>
            <h2 className="font-display text-xl font-semibold">
              {i.description}
              {i.side && <span className="ml-1.5 text-base text-text-dim">({sideLabel(i.side)})</span>}
            </h2>
            <p className="text-sm text-text-dim">
              {i.injury_date ? `Since ${formatDateLong(i.injury_date)}` : "No date"}
              {days !== null ? ` · day ${days}` : ""}
              {i.expected_return ? ` · expected back ${formatDate(i.expected_return)}` : ""}
              {i.region ? ` · pain trend: ${regionLabel(i.region)}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button className={ghost} onClick={() => setEditing((e) => !e)}>
              {editing ? "Close" : "Edit"}
            </button>
            {i.closed_at ? (
              <button className={ghost} disabled={busy} onClick={() => run(() => careApi.updateIssue(i.id, { closed: false }))}>
                Reopen
              </button>
            ) : (
              <button className={button} disabled={busy} onClick={() => run(() => careApi.updateIssue(i.id, { closed: true }))}>
                Mark recovered
              </button>
            )}
          </div>
        </div>
        {i.closed_at && <p className="text-sm text-teal">Recovered {formatDateLong(i.closed_at)}.</p>}
        {editing && <EditIssue issue={i} onSave={(body) => run(async () => (await careApi.updateIssue(i.id, body), setEditing(false)))} busy={busy} />}
        {err && <p className="text-xs text-owl-red-light">{err}</p>}
      </Card>

      {i.category === "injury" && (
        <section>
          <SectionHeading title="Return to play" subtitle="Tap the stage they've reached" />
          <Card className="flex flex-col gap-3">
            <ol className="grid grid-cols-5 gap-1">
              {STAGES.map((s, n) => {
                const reached = stages.filter((h) => h.stage === s.key).at(-1);
                return (
                  <li key={s.key}>
                    <button
                      disabled={busy || s.key === i.stage}
                      onClick={() => run(() => careApi.updateIssue(i.id, { stage: s.key as RtpStage, stage_date: today }))}
                      className={`flex w-full flex-col items-center gap-1 rounded-lg border p-2 text-center text-[11px] leading-tight transition-colors ${
                        n < stageIndex ? "border-teal/40 bg-teal/10 text-teal" : n === stageIndex ? "border-teal bg-teal/20 font-semibold text-text" : "border-border text-text-dim hover:text-text"
                      }`}
                    >
                      <span className="font-display text-base">{n + 1}</span>
                      {s.label}
                      {reached && n <= stageIndex && <span className="text-[10px] font-normal text-text-dim">{formatDate(reached.stage_date)}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </Card>
        </section>
      )}

      {i.category === "injury" && (
      <section>
        <SectionHeading title="Pain trend" subtitle={i.region ? `${regionLabel(i.region)} soreness from the player's morning check-ins, with their readiness` : "Readiness and overall soreness from the player's morning check-ins"} />
        <Card>
          {painTrend.length === 0 ? (
            <p className="text-sm text-text-dim">No check-ins since this started.</p>
          ) : (
            <PainChart data={painTrend} hasRegion={Boolean(i.region)} />
          )}
        </Card>
      </section>
      )}

      <section>
        <SectionHeading title="Daily rehab log" subtitle="What they did and how it went" />
        <Card className="flex flex-col gap-3">
          {!i.closed_at && <AddLog today={today} busy={busy} onAdd={(body) => run(() => careApi.addLog(i.id, body))} />}
          {logs.length === 0 ? (
            <p className="text-sm text-text-dim">Nothing logged yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60">
              {logs.map((l) => (
                <li key={l.id} className="flex gap-3 py-2.5 text-sm">
                  <span className="w-16 shrink-0 text-text-dim">{formatDate(l.log_date)}</span>
                  <div className="min-w-0 flex-1">
                    <div>
                      {l.activities}
                      {l.minutes ? <span className="text-text-dim"> · {l.minutes} min</span> : null}
                    </div>
                    {l.notes && <div className="text-xs text-text-dim">{l.notes}</div>}
                  </div>
                  <button className="text-xs text-text-dim hover:text-owl-red-light" onClick={() => run(() => careApi.deleteLog(i.id, l.id))} aria-label="Delete">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {availability.length > 0 && (
        <section>
          <SectionHeading title="Play status history" />
          <Card className="p-0">
            <ul className="divide-y divide-border/60">
              {[...availability].reverse().map((a) => {
                const l = levelInfo(a.level);
                return (
                  <li key={a.status_date} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-16 shrink-0 text-text-dim">{formatDate(a.status_date)}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${l.chip}`}>{l.label}</span>
                    <span className="min-w-0 flex-1 truncate text-text-dim">{[a.practice_note, a.bike && `Bike: ${a.bike}`, a.jogging && `Jog: ${a.jogging}`, a.running && `Run: ${a.running}`].filter(Boolean).join(" · ")}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

function EditIssue({ issue, onSave, busy }: { issue: Issue; onSave: (body: Record<string, unknown>) => void; busy: boolean }) {
  const [form, setForm] = useState({
    description: issue.description,
    side: issue.side ?? "",
    injury_date: issue.injury_date ?? "",
    expected_return: issue.expected_return ?? "",
  });
  return (
    <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
      <input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-label="Description" />
      <select className={input} value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })} aria-label="Side">
        <option value="">No side</option>
        <option value="left">Left</option>
        <option value="right">Right</option>
        <option value="both">Both</option>
      </select>
      <label className="flex flex-col text-[10px] uppercase tracking-wide text-text-dim">
        Date
        <input type="date" className={input} value={form.injury_date} onChange={(e) => setForm({ ...form, injury_date: e.target.value })} />
      </label>
      <label className="flex flex-col text-[10px] uppercase tracking-wide text-text-dim">
        Expected return
        <input type="date" className={input} value={form.expected_return} onChange={(e) => setForm({ ...form, expected_return: e.target.value })} />
      </label>
      <div>
        <button
          className={button}
          disabled={busy || !form.description.trim()}
          onClick={() => onSave({ description: form.description, side: form.side || null, injury_date: form.injury_date || null, expected_return: form.expected_return || null })}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function AddLog({ today, busy, onAdd }: { today: string; busy: boolean; onAdd: (body: Record<string, unknown>) => Promise<void> | void }) {
  const [form, setForm] = useState({ date: today, activities: "", minutes: "", notes: "" });
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2.5">
      <div className="flex gap-2">
        <input type="date" className={`${input} w-40`} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Date" />
        <input className={`${input} w-24`} inputMode="numeric" placeholder="Min" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value.replace(/\D/g, "") })} aria-label="Minutes" />
      </div>
      <input className={input} placeholder="What they did (e.g. Taped, quad sets, bike 20 min)" value={form.activities} onChange={(e) => setForm({ ...form, activities: e.target.value })} />
      <input className={input} placeholder="How it went (e.g. Pain going down, still not 100%)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <div>
        <button
          className={button}
          disabled={busy || !form.activities.trim()}
          onClick={async () => {
            await onAdd({ date: form.date, activities: form.activities, minutes: form.minutes ? Number(form.minutes) : null, notes: form.notes });
            setForm({ date: today, activities: "", minutes: "", notes: "" });
          }}
        >
          Add to log
        </button>
      </div>
    </div>
  );
}

const PAIN_COLORS = ["#2a2e37", "#f2b705", "#ff8a3d", "#ff3f5e"];
const PAIN_LABELS = ["None", "Light", "Moderate", "Severe"];

function PainChart({ data, hasRegion }: { data: { date: string; readiness: number; muscle_soreness: number; pain: number | null }[]; hasRegion: boolean }) {
  // Without a body part, show overall soreness (1-5 where 5 is none) flipped to 0-3-ish so higher = worse.
  const rows = data.map((d) => ({ ...d, value: hasRegion ? (d.pain ?? 0) : Math.max(0, 5 - d.muscle_soreness) * 0.75 }));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#2a2e37" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => formatDate(String(d))} tick={{ fill: "#8b90a0", fontSize: 11 }} />
          <YAxis yAxisId="pain" domain={[0, 3]} ticks={[0, 1, 2, 3]} tickFormatter={(v) => PAIN_LABELS[v] ?? ""} tick={{ fill: "#8b90a0", fontSize: 10 }} width={64} />
          <YAxis yAxisId="ready" orientation="right" domain={[0, 100]} tick={{ fill: "#8b90a0", fontSize: 10 }} width={32} />
          <Tooltip
            contentStyle={{ background: "#15171c", border: "1px solid #2a2e37", borderRadius: 8 }}
            labelFormatter={(d) => formatDateLong(String(d))}
            formatter={(v, name) => (name === "Readiness" ? [`${v}%`, name] : [hasRegion ? PAIN_LABELS[Number(v)] : Number(v).toFixed(1), "Pain"])}
          />
          <Bar yAxisId="pain" dataKey="value" name="Pain" radius={[3, 3, 0, 0]} maxBarSize={28}>
            {rows.map((r, n) => (
              <Cell key={n} fill={PAIN_COLORS[Math.min(3, Math.round(r.value))]} />
            ))}
          </Bar>
          <Line yAxisId="ready" type="monotone" dataKey="readiness" name="Readiness" stroke="#3ad6c5" strokeWidth={2} dot={{ r: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
