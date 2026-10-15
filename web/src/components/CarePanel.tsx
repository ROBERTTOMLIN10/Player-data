import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CARE_QUERY_KEYS, careApi, useMe, usePlayerCare } from "../api/client";
import { regionLabel, SEVERITY_STYLE } from "../lib/bodyRegions";
import { appointmentState, CATEGORIES, categoryLabel, KINDS, kindLabel, LEVELS, sideLabel, stageLabel, timeLabel } from "../lib/care";
import { CareThread } from "./CareThread";
import { formatDate } from "../lib/format";
import type { AppointmentKind, Availability, IssueCategory, PlayLevel, ReadinessEntry, Side } from "../types";

const input = "w-full rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-text outline-none focus:border-owl-red";
const button = "rounded-md bg-owl-red px-3 py-1.5 text-sm font-semibold text-white hover:bg-owl-red-light disabled:opacity-50";
const ghost = "rounded-md border border-border px-2.5 py-1 text-xs text-text-dim hover:text-text";

/** Refreshes everything that shows care after a change. */
function useRefreshCare() {
  const qc = useQueryClient();
  return () => Promise.all(CARE_QUERY_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-dim">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * One player's care for a day, for the athletic trainer and the coaches: play
 * status, treatment bookings, open issues and follow-up notes. Opens over the
 * Readiness board.
 */
export function CarePanel({
  playerId,
  name,
  date,
  entry,
  onClose,
}: {
  playerId: number;
  name: string;
  date: string;
  entry: ReadinessEntry | null;
  onClose: () => void;
}) {
  const { data: me } = useMe();
  const { data } = usePlayerCare(playerId, date);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const day = data?.day;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${name}: care`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col gap-4 overflow-y-auto border-l border-border bg-ink p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">{name}</h2>
            <p className="text-sm text-text-dim">{formatDate(date)}</p>
          </div>
          <div className="flex items-center gap-2">
            {me?.role === "coach" && (
              <Link to={`/players/${playerId}`} className="text-xs text-owl-red-light hover:underline">
                Player page ›
              </Link>
            )}
            <button onClick={onClose} className="rounded-md border border-border px-2.5 py-1 text-sm text-text-dim hover:text-text" aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {entry ? (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="font-medium">Readiness {entry.readiness_score}%</span>
            {entry.soreness.map((s) => (
              <span key={s.region} className={`rounded-full border px-1.5 py-px text-[11px] ${SEVERITY_STYLE[s.severity].chip}`} title={s.note ?? undefined}>
                {regionLabel(s.region)} · {SEVERITY_STYLE[s.severity].label}
              </span>
            ))}
            {entry.notes && <p className="w-full text-xs text-text-dim">“{entry.notes}”</p>}
          </div>
        ) : (
          <p className="text-sm text-text-dim">Not checked in.</p>
        )}

        {!data ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : (
          <>
            <PlayStatus playerId={playerId} date={date} current={day?.availability ?? null} />
            <Treatments
              playerId={playerId}
              date={date}
              treatments={day?.treatments ?? []}
              injuries={[...(day?.issues ?? []).filter((i) => i.category === "injury"), ...data.pastIssues.filter((i) => i.category === "injury")]}
              isTrainer={me?.role === "trainer"}
            />
            <LogAndPrehab treatments={data.treatments} prehab={data.prehab} isTrainer={me?.role === "trainer"} />
            <Messages playerId={playerId} name={name} date={date} messages={day?.messages ?? []} />
            <Issues playerId={playerId} date={date} issues={day?.issues ?? []} soreRegions={entry?.soreness.map((s) => s.region) ?? []} />
            <Notes playerId={playerId} date={date} notes={day?.notes ?? []} myEmail={me?.email ?? null} />
          </>
        )}
      </div>
    </div>
  );
}

function PlayStatus({ playerId, date, current }: { playerId: number; date: string; current: Availability | null }) {
  const refresh = useRefreshCare();
  const [level, setLevel] = useState<PlayLevel | null>(current?.level ?? null);
  const [form, setForm] = useState({ practice_note: current?.practice_note ?? "", bike: current?.bike ?? "", jogging: current?.jogging ?? "", running: current?.running ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setLevel(current?.level ?? null);
    setForm({ practice_note: current?.practice_note ?? "", bike: current?.bike ?? "", jogging: current?.jogging ?? "", running: current?.running ?? "" });
  }, [current]);
  const carried = current && current.status_date !== date;

  async function save() {
    if (!level) return;
    setBusy(true);
    setError(null);
    try {
      await careApi.setAvailability(playerId, { date, level, ...form });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Play status" aside={carried ? <span className="text-[11px] text-text-dim">since {formatDate(current!.status_date)}</span> : null}>
      <div className="flex flex-wrap gap-1.5">
        {LEVELS.map((l) => (
          <button
            key={l.key}
            onClick={() => setLevel(l.key)}
            aria-pressed={level === l.key}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${level === l.key ? l.chip : "border-border text-text-dim hover:text-text"}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <input className={input} placeholder="Practice notes (e.g. Non-contact, as tolerated w/ tape)" value={form.practice_note} onChange={(e) => setForm({ ...form, practice_note: e.target.value })} />
      <div className="grid grid-cols-3 gap-2">
        {(["bike", "jogging", "running"] as const).map((k) => (
          <label key={k} className="flex flex-col gap-0.5 text-[11px] uppercase tracking-wide text-text-dim">
            {k}
            <input className={input} placeholder="e.g. Max 80%" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button className={button} disabled={!level || busy} onClick={save}>
          {busy ? "Saving…" : "Save status"}
        </button>
        {saved && <span className="text-xs text-teal">Saved</span>}
        {current?.set_by && !saved && <span className="text-[11px] text-text-dim">set by {current.set_by}</span>}
        {error && <span className="text-xs text-owl-red-light">{error}</span>}
      </div>
    </Section>
  );
}

function Treatments({
  playerId,
  date,
  treatments,
  injuries,
  isTrainer,
}: {
  playerId: number;
  date: string;
  treatments: import("../types").Treatment[];
  injuries: { id: number; description: string; side: Side | null; closed_at: string | null }[];
  isTrainer: boolean;
}) {
  const refresh = useRefreshCare();
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<AppointmentKind>("treatment");
  const [injury, setInjury] = useState<string>(injuries.find((i) => !i.closed_at)?.id.toString() ?? "");
  const needsInjury = kind === "treatment" || kind === "rehab" || kind === "proactive";
  const [reason, setReason] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Appointments">
      {treatments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {treatments.map((t) => {
            const state = appointmentState(t);
            const open = t.status === "pending" || t.status === "booked";
            return (
              <li key={t.id} className="rounded-lg border border-border p-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{timeLabel(t.treat_time) || "Any time"}</span>
                  <span>
                    {kindLabel(t.kind)}
                    {t.injury ? <span className="text-text-dim"> · {t.injury}</span> : t.reason ? <span className="text-text-dim"> · {t.reason}</span> : null}
                  </span>
                  <span className={`rounded-full border px-1.5 py-px text-[11px] ${state.chip}`}>
                    {state.label}
                    {t.status === "attended" && !t.confirmed_at ? " · player says · confirm" : ""}
                  </span>
                  <span className="ml-auto flex gap-1">
                    {isTrainer && t.status === "attended" && !t.confirmed_at && (
                      <>
                        <button className={ghost} disabled={busy} onClick={() => run(() => careApi.confirmVisit(t.id, true))}>
                          Confirm
                        </button>
                        <button className={ghost} disabled={busy} onClick={() => run(() => careApi.confirmVisit(t.id, false))}>
                          Didn&rsquo;t happen
                        </button>
                      </>
                    )}
                    {t.status === "pending" && t.awaiting === "trainer" && (
                      <button className={ghost} disabled={busy} onClick={() => run(() => careApi.updateTreatment(t.id, { status: "booked" }))}>
                        Confirm
                      </button>
                    )}
                    {open && (
                      <button className={ghost} disabled={busy} onClick={() => run(() => careApi.updateTreatment(t.id, { status: "attended" }))}>
                        Came in
                      </button>
                    )}
                    {open && (
                      <button className={ghost} disabled={busy} onClick={() => run(() => careApi.updateTreatment(t.id, { status: "missed" }))}>
                        Missed
                      </button>
                    )}
                    <button className={ghost} disabled={busy} onClick={() => run(() => careApi.deleteTreatment(t.id))} aria-label="Delete appointment">
                      ✕
                    </button>
                  </span>
                </div>
                {t.instructions && <p className="mt-1 text-text-dim">{t.instructions}</p>}
                {t.player_note && <p className="mt-1 text-xs text-orange-300">Player: &ldquo;{t.player_note}&rdquo;</p>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2.5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[7.5rem_1fr_1fr]">
          <input type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
          <select className={input} value={kind} onChange={(e) => setKind(e.target.value as AppointmentKind)} aria-label="What for">
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
          {needsInjury ? (
            <select className={`${input} col-span-2 sm:col-span-1`} value={injury} onChange={(e) => setInjury(e.target.value)} aria-label="For which injury">
              <option value="">For which injury…</option>
              {injuries.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.description}
                  {i.side ? ` (${sideLabel(i.side)})` : ""}
                  {i.closed_at ? " · past" : ""}
                </option>
              ))}
            </select>
          ) : (
            <input className={`${input} col-span-2 sm:col-span-1`} placeholder="Area / reason (e.g. Calves)" value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </div>
        {needsInjury && injuries.length === 0 && <p className="text-[11px] text-gold">Treatment is for an injury: log it under Injuries &amp; issues below first.</p>}
        <input className={input} placeholder="Instructions (e.g. Ice ankle 15 min before)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        <div className="flex items-center gap-2">
          <button
            className={button}
            disabled={busy || !time || (needsInjury && !injury)}
            onClick={() =>
              run(async () => {
                await careApi.bookTreatment({ player_id: playerId, date, time, kind, reason, instructions, injury_id: needsInjury ? Number(injury) : null });
                setTime("");
                setReason("");
                setInstructions("");
              })
            }
          >
            Book
          </button>
          <span className="text-[11px] text-text-dim">The player gets it on their phone and accepts or asks for another time.</span>
        </div>
      </div>
      {error && <p className="text-xs text-owl-red-light">{error}</p>}
    </Section>
  );
}

/** Confirmed visits (last two weeks) and the player's pre-hab, with the AT's confirm buttons. */
function LogAndPrehab({ treatments, prehab, isTrainer }: { treatments: import("../types").Treatment[]; prehab: import("../types").PrehabLog[]; isTrainer: boolean }) {
  const refresh = useRefreshCare();
  const [busy, setBusy] = useState(false);
  const visits = treatments.filter((t) => t.status === "attended" && t.confirmed_at);
  if (!visits.length && !prehab.length) return null;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Treatment log & pre-hab">
      <ul className="flex flex-col gap-1 text-sm">
        {visits.map((t) => (
          <li key={`v${t.id}`} className="flex flex-wrap gap-x-2">
            <span className="w-16 shrink-0 text-text-dim">{formatDate(t.treat_date)}</span>
            <span>{kindLabel(t.kind)}</span>
            <span className="text-text-dim">{t.injury ?? t.reason ?? ""}</span>
            <span className="ml-auto text-[11px] text-teal">✓ came in</span>
          </li>
        ))}
        {prehab.map((p) => (
          <li key={`p${p.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-16 shrink-0 text-text-dim">{formatDate(p.log_date)}</span>
            <span>Pre-hab</span>
            <span className="min-w-0 flex-1 text-text-dim">
              {p.activities}
              {p.minutes ? ` · ${p.minutes} min` : ""}
              {p.injury ? ` · ${p.injury}` : ""}
            </span>
            {p.status === "pending" ? (
              isTrainer ? (
                <span className="flex gap-1">
                  <button className={ghost} disabled={busy} onClick={() => run(() => careApi.confirmPrehab(p.id, true))}>
                    Confirm
                  </button>
                  <button className={ghost} disabled={busy} onClick={() => run(() => careApi.confirmPrehab(p.id, false))}>
                    Didn&rsquo;t happen
                  </button>
                </span>
              ) : (
                <span className="text-[11px] text-gold">waiting on AT</span>
              )
            ) : (
              <span className={`text-[11px] ${p.status === "confirmed" ? "text-teal" : "text-text-dim"}`}>{p.status === "confirmed" ? "✓ confirmed" : "not confirmed"}</span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Messages({ playerId, name, date, messages }: { playerId: number; name: string; date: string; messages: import("../types").CareMessage[] }) {
  const refresh = useRefreshCare();
  return (
    <Section title="Messages with the player">
      <CareThread
        messages={messages}
        mine="staff"
        playerName={name.split(" ")[0]}
        placeholder={`Message ${name.split(" ")[0]}…`}
        onSend={async (body) => {
          await careApi.sendMessage({ player_id: playerId, date, body });
          await refresh();
        }}
      />
    </Section>
  );
}

function Issues({
  playerId,
  date,
  issues,
  soreRegions,
}: {
  playerId: number;
  date: string;
  issues: import("../types").OpenIssue[];
  soreRegions: string[];
}) {
  const refresh = useRefreshCare();
  const [adding, setAdding] = useState(false);
  const empty = { category: "injury" as IssueCategory, description: "", side: "" as Side | "", region: soreRegions[0] ?? "", injury_date: date, expected_return: "" };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await careApi.addIssue({
        player_id: playerId,
        category: form.category,
        description: form.description,
        side: form.side || null,
        region: form.region || null,
        injury_date: form.injury_date || null,
        expected_return: form.expected_return || null,
      });
      await refresh();
      setAdding(false);
      setForm(empty);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Injuries & issues"
      aside={
        !adding && (
          <button className={ghost} onClick={() => setAdding(true)}>
            + Add
          </button>
        )
      }
    >
      {issues.length === 0 && !adding && <p className="text-sm text-text-dim">None open.</p>}
      <ul className="flex flex-col gap-1.5">
        {issues.map((i) => (
          <li key={i.id}>
            <Link to={`/injuries/${i.id}`} className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm hover:border-owl-red/60">
              <span className="rounded border border-border px-1 text-[10px] uppercase text-text-dim">{categoryLabel(i.category)}</span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {i.description}
                {i.side && <span className="ml-1 text-text-dim">({sideLabel(i.side)})</span>}
              </span>
              <span className="shrink-0 text-xs text-text-dim">
                {i.category === "injury" ? stageLabel(i.stage) : ""}
                {i.days !== null ? ` · day ${i.days}` : ""}
              </span>
              <span className="text-text-dim">›</span>
            </Link>
          </li>
        ))}
      </ul>
      {adding && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setForm({ ...form, category: c.key })}
                className={`rounded-full border px-2.5 py-1 text-xs ${form.category === c.key ? "border-owl-red/50 bg-owl-red/15 text-owl-red-light" : "border-border text-text-dim"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <input
            className={input}
            placeholder={form.category === "injury" ? "Body part / injury (e.g. Hamstring strain)" : form.category === "gen_med" ? "Illness (e.g. Flu)" : "Follow-up (e.g. Heart, stress echo)"}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select className={input} value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as Side | "" })} aria-label="Side">
              <option value="">Side</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="both">Both</option>
            </select>
            <label className="col-span-1 flex flex-col text-[10px] uppercase tracking-wide text-text-dim">
              Date
              <input type="date" className={input} value={form.injury_date} onChange={(e) => setForm({ ...form, injury_date: e.target.value })} />
            </label>
            <label className="col-span-1 flex flex-col text-[10px] uppercase tracking-wide text-text-dim">
              Expected return
              <input type="date" className={input} value={form.expected_return} onChange={(e) => setForm({ ...form, expected_return: e.target.value })} />
            </label>
            <label className="col-span-1 flex flex-col text-[10px] uppercase tracking-wide text-text-dim">
              Pain trend area
              <select className={input} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                <option value="">None</option>
                {soreRegions.map((r) => (
                  <option key={r} value={r}>
                    {regionLabel(r)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button className={button} disabled={busy || !form.description.trim()} onClick={add}>
              Add {categoryLabel(form.category).toLowerCase()}
            </button>
            <button className={ghost} onClick={() => setAdding(false)}>
              Cancel
            </button>
            {error && <span className="text-xs text-owl-red-light">{error}</span>}
          </div>
        </div>
      )}
    </Section>
  );
}

function Notes({ playerId, date, notes, myEmail }: { playerId: number; date: string; notes: import("../types").CareNote[]; myEmail: string | null }) {
  const refresh = useRefreshCare();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await careApi.addNote({ player_id: playerId, date, body });
      setBody("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Follow-up notes">
      {notes.length === 0 && <p className="text-sm text-text-dim">No notes yet. Coaches and the AT can talk here (e.g. “Did he come in?”).</p>}
      <ul className="flex flex-col gap-2">
        {notes.map((n) => (
          <li key={n.id} className={`rounded-lg border p-2.5 text-sm ${n.author_role === "trainer" ? "border-sky-400/30 bg-sky-400/5" : "border-border"}`}>
            <div className="mb-0.5 flex items-center gap-2 text-[11px] text-text-dim">
              <span className="font-semibold uppercase tracking-wide">{n.author_role === "trainer" ? "AT" : "Coach"}</span>
              <span className="truncate">{n.author_email}</span>
              <span className="ml-auto">{new Date(`${n.created_at.replace(" ", "T")}Z`).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
              {n.author_email === myEmail && (
                <button
                  className="hover:text-owl-red-light"
                  onClick={async () => {
                    await careApi.deleteNote(n.id);
                    await refresh();
                  }}
                  aria-label="Delete note"
                >
                  ✕
                </button>
              )}
            </div>
            {n.body}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          className={input}
          placeholder="Add a note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && body.trim() && !busy && void send()}
        />
        <button className={button} disabled={busy || !body.trim()} onClick={send}>
          Send
        </button>
      </div>
      {error && <p className="text-xs text-owl-red-light">{error}</p>}
    </Section>
  );
}
