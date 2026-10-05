import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CARE_QUERY_KEYS, careApi, useBeforeTraining, useCareDay, useMe } from "../api/client";
import { appointmentState, KINDS, kindLabel, LEVELS, levelInfo, timeLabel } from "../lib/care";
import { formatDateLong } from "../lib/format";
import type { AppointmentKind, BeforeTrainingItem, CheckStage, PlayLevel, ReasonKind } from "../types";
import { Card } from "./Card";
import { CareThread } from "./CareThread";

const input = "w-full rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-text outline-none focus:border-owl-red";
const primary = "rounded-md bg-owl-red px-3 py-1.5 text-sm font-semibold text-white hover:bg-owl-red-light disabled:opacity-50";
const ghost = "rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim hover:text-text disabled:opacity-50";

const REASON_CHIP: Record<ReasonKind, string> = {
  severe: "border-owl-red-light/50 bg-owl-red/20 text-owl-red-light",
  injury_area: "border-orange-400/50 bg-orange-400/15 text-orange-300",
  low: "border-gold/50 bg-gold/15 text-gold",
  restricted: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  manual: "border-border text-text",
};

const STAGE: Record<CheckStage, { label: string; chip: string; dot: string }> = {
  flagged: { label: "Not seen yet", chip: "border-owl-red/50 bg-owl-red/15 text-owl-red-light", dot: "bg-owl-red-light" },
  called_in: { label: "Called in", chip: "border-gold/50 bg-gold/10 text-gold", dot: "bg-gold" },
  awaiting_coach: { label: "Waiting on coach", chip: "border-orange-400/50 bg-orange-400/15 text-orange-300", dot: "bg-orange-300" },
  decided: { label: "Decided", chip: "border-teal/40 bg-teal/10 text-teal", dot: "bg-teal" },
  cleared: { label: "Fine to train", chip: "border-teal/40 bg-teal/10 text-teal", dot: "bg-teal" },
};

const BEFORE_STEPS = ["Ice 15 min before", "Heat before you come in", "Foam roll", "Light stretch", "Bring your brace / tape", "Don't start the warm-up until you've seen me"];
const STAFF_QUICK = [
  { key: "come_in", label: "Come see me before practice" },
  { key: "how_now", label: "How does it feel now?" },
  { key: "start_ice", label: "Start icing now" },
];

function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all(CARE_QUERY_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

/**
 * Pre/Post practice: who may miss part or all of today's session and where each one
 * is — called in, seen (the AT's recommendation), and the coach's final call. The
 * AT acts from here (call in with what to do first, message, recommend); coaches
 * see the whole back-and-forth and confirm. On the Injuries page and the
 * Readiness board.
 */
export function BeforeTraining({
  date,
  onOpenPlayer,
  focusPlayerId,
  compact = false,
  onDateChange,
}: {
  date: string | null;
  onOpenPlayer?: (p: { id: number; name: string }) => void;
  focusPlayerId?: number | null;
  compact?: boolean;
  onDateChange?: (date: string | null) => void;
}) {
  const { data } = useBeforeTraining(date);
  const { data: me } = useMe();
  const role = me?.role === "trainer" ? "trainer" : "coach";
  const [flagging, setFlagging] = useState(false);
  if (!data) return null;

  const open = data.items.filter((i) => i.stage !== "decided" && i.stage !== "cleared");
  const settled = data.items.filter((i) => i.stage === "decided" || i.stage === "cleared");
  const needCoach = data.items.filter((i) => i.stage === "awaiting_coach").length;
  const notSeen = data.items.filter((i) => i.stage === "flagged").length;
  // Settled players, grouped by today's play status like the injury report.
  const groups = SETTLED_ORDER.map((level) => ({ level, rows: settled.filter((i) => settledLevel(i) === level) })).filter((g) => g.rows.length);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-semibold">Pre/Post practice</h2>
            <p className="text-xs text-text-dim">
              {formatDateLong(data.date)} ·{" "}
              {open.length === 0
                ? settled.length
                  ? "everyone settled"
                  : "nobody flagged"
                : [notSeen && `${notSeen} not seen yet`, needCoach && `${needCoach} waiting on coach`].filter(Boolean).join(" · ") || `${open.length} in progress`}
            </p>
          </div>
          {onDateChange && <DayNav date={data.date} today={data.today} onChange={onDateChange} />}
          {role === "trainer" && (
            <button className={ghost} onClick={() => setFlagging((v) => !v)}>
              {flagging ? "Close" : "+ Flag a player"}
            </button>
          )}
        </div>
        {flagging && <FlagForm date={data.date} onDone={() => setFlagging(false)} />}
        {open.length === 0 ? (
          <p className="px-4 py-4 text-sm text-text-dim">
            {settled.length
              ? "Nothing waiting. Everyone below is settled for the day."
              : `No one's check-in shows severe soreness, soreness on an injury, or readiness at ${data.threshold}% or lower, and no one is restricted.`}
            {role === "trainer" ? " Flag anyone you want to see before practice." : ""}
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {open.map((item) => (
              <ItemRow key={item.player_id} item={item} date={data.date} role={role} onOpenPlayer={onOpenPlayer} focus={focusPlayerId === item.player_id} compact={compact} />
            ))}
          </ul>
        )}
      </Card>

      {groups.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-display text-base font-semibold">Settled for {formatDateLong(data.date)}</h3>
            <p className="text-xs text-text-dim">Agreed by the AT and coach. This is each player&rsquo;s play status for the day.</p>
          </div>
          {groups.map((g) => (
            <div key={g.level} className="border-b border-border/70 last:border-0">
              <div className="flex items-center gap-2 px-4 pt-3">
                <LevelChip level={g.level} />
                <span className="text-xs text-text-dim">{g.rows.length}</span>
              </div>
              <ul className="divide-y divide-border/50">
                {g.rows.map((item) => (
                  <SettledRow key={item.player_id} item={item} date={data.date} role={role} onOpenPlayer={onOpenPlayer} />
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

const SETTLED_ORDER: PlayLevel[] = ["out", "rehab", "limited", "as_tolerated", "full"];
const settledLevel = (i: BeforeTrainingItem): PlayLevel => (i.stage === "cleared" ? "full" : (i.check?.decision ?? "full"));

function shiftIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function DayNav({ date, today, onChange }: { date: string; today: string; onChange: (d: string | null) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(shiftIso(date, -1))} className="rounded-md border border-border px-2 py-1 text-sm text-text-dim hover:text-text" aria-label="Previous day">
        ←
      </button>
      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-md border border-border bg-surface-raised px-2 py-1 text-sm text-text outline-none focus:border-owl-red"
        aria-label="Day"
      />
      <button
        onClick={() => onChange(shiftIso(date, 1) >= today ? null : shiftIso(date, 1))}
        disabled={date >= today}
        className="rounded-md border border-border px-2 py-1 text-sm text-text-dim hover:text-text disabled:opacity-30"
        aria-label="Next day"
      >
        →
      </button>
    </div>
  );
}

function SettledRow({ item, date, role, onOpenPlayer }: { item: BeforeTrainingItem; date: string; role: "trainer" | "coach"; onOpenPlayer?: (p: { id: number; name: string }) => void }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const c = item.check;
  const how =
    item.stage === "cleared"
      ? "AT: fine to train"
      : c?.kept_same
        ? "Still the same"
        : c?.recommendation
          ? c.recommendation === c.decision
            ? "AT recommended · coach agreed"
            : `Coach changed it from ${levelInfo(c.recommendation).label}`
          : "Set by the coach";
  const note = c?.decision_note ?? c?.rec_note ?? (c?.kept_same ? item.availability?.practice_note : null);
  const reopen = async () => {
    setBusy(true);
    try {
      await (item.stage === "cleared" ? careApi.clear(item.player_id, { date, cleared: false }) : careApi.reopen(item.player_id, { date }));
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="px-4 py-2.5 text-sm">
      <div className="flex items-baseline gap-2">
        <button onClick={() => onOpenPlayer?.({ id: item.player_id, name: item.name })} className="shrink-0 whitespace-nowrap text-left font-medium hover:text-owl-red-light">
          {item.name}
        </button>
        <span className="text-xs text-text-dim">{how}</span>
        {(role === "coach" || item.stage === "cleared" || c?.kept_same) && (
          <button className="ml-auto shrink-0 text-xs text-text-dim hover:text-text disabled:opacity-50" disabled={busy} onClick={reopen}>
            Reopen
          </button>
        )}
      </div>
      {(note || item.appointment) && (
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
          {note && <span className="text-text">{note}</span>}
          {item.appointment && (
            <span className="text-text-dim">
              ✚ {timeLabel(item.appointment.treat_time)} {appointmentState(item.appointment).label.toLowerCase()}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function ItemRow({
  item,
  date,
  role,
  onOpenPlayer,
  focus,
  compact,
}: {
  item: BeforeTrainingItem;
  date: string;
  role: "trainer" | "coach";
  onOpenPlayer?: (p: { id: number; name: string }) => void;
  focus: boolean;
  compact: boolean;
}) {
  const refresh = useRefresh();
  const [panel, setPanel] = useState<null | "call" | "recommend" | "decide" | "thread">(focus ? "thread" : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus]);

  const run = async (fn: () => Promise<unknown>, close = true) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      if (close) setPanel(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (p: typeof panel) => setPanel((cur) => (cur === p ? null : p));
  const stage = STAGE[item.stage];
  const appt = item.appointment;
  const check = item.check;
  const quiet = item.stage === "decided" || item.stage === "cleared";

  return (
    <li ref={ref} className={`px-4 py-3 ${focus ? "bg-owl-red/5" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${stage.dot}`} aria-hidden />
        <button onClick={() => onOpenPlayer?.({ id: item.player_id, name: item.name })} className="font-medium hover:text-owl-red-light" title="Open care panel">
          {item.name}
        </button>
        <span className={`rounded-full border px-2 py-px text-[11px] font-semibold ${stage.chip}`}>{stage.label}</span>
        {item.checkin ? (
          <span className="text-xs text-text-dim">Readiness {item.checkin.readiness_score}%</span>
        ) : (
          <span className="text-xs text-text-dim">No check-in yet</span>
        )}
      </div>

      {!quiet && item.reasons.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.reasons.map((r, i) => (
            <span key={i} className={`rounded-full border px-2 py-0.5 text-[11px] ${REASON_CHIP[r.kind]}`}>
              {r.label}
            </span>
          ))}
        </div>
      )}
      {!quiet && !compact && item.checkin?.notes && <p className="mt-1 text-xs italic text-text-dim">&ldquo;{item.checkin.notes}&rdquo;</p>}

      {/* Where it stands */}
      <div className="mt-2 flex flex-col gap-1 text-sm">
        {appt && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span>
              ✚ <span className="font-semibold">{timeLabel(appt.treat_time) || "Any time"}</span> · {kindLabel(appt.kind)}
              {appt.reason ? ` · ${appt.reason}` : ""}
            </span>
            <span className={`rounded-full border px-1.5 py-px text-[11px] ${appointmentState(appt).chip}`}>{appointmentState(appt).label}</span>
          </div>
        )}
        {appt?.instructions && item.stage === "called_in" && <p className="text-xs text-text-dim">Before: {appt.instructions}</p>}
        {appt?.player_note && item.stage === "called_in" && <p className="text-xs text-orange-300">Player: &ldquo;{appt.player_note}&rdquo;</p>}
        {check?.recommendation && (
          <div>
            AT recommends <LevelChip level={check.recommendation} />
            {check.rec_note && <span className="text-text-dim"> — {check.rec_note}</span>}
          </div>
        )}
        {check?.decision && (
          <div>
            Final: <LevelChip level={check.decision} />{" "}
            <span className="text-xs text-text-dim">
              {check.recommendation === check.decision ? "coach agreed with the AT" : check.recommendation ? `coach changed it from ${levelInfo(check.recommendation).label}` : "set by the coach"}
              {check.decision_note ? ` · ${check.decision_note}` : ""}
            </span>
          </div>
        )}
        {item.stage === "cleared" && <div className="text-xs text-text-dim">The AT has cleared them to train as normal.</div>}
      </div>

      {/* Actions */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(item.stage === "flagged" || item.stage === "called_in") && item.reasons.some((r) => r.kind === "restricted") && (
          <button
            className={ghost}
            disabled={busy}
            title={`Nothing new: keep them on ${levelInfo(item.availability?.level ?? "full").label} for today`}
            onClick={() => run(() => careApi.same(item.player_id, { date }))}
          >
            Still the same ({levelInfo(item.availability?.level ?? "full").label})
          </button>
        )}
        {role === "trainer" && item.stage === "flagged" && (
          <>
            <button className={primary} onClick={() => toggle("call")}>
              Call in before practice
            </button>
            <button className={ghost} disabled={busy} onClick={() => run(() => careApi.clear(item.player_id, { date }))}>
              Fine to train
            </button>
          </>
        )}
        {role === "trainer" && item.stage === "called_in" && (
          <>
            {appt?.status === "pending" && appt.awaiting === "trainer" && (
              <button className={primary} disabled={busy} onClick={() => run(() => careApi.updateTreatment(appt.id, { status: "booked" }))}>
                Confirm {timeLabel(appt.treat_time)}
              </button>
            )}
            <button className={primary} onClick={() => toggle("recommend")}>
              Seen · recommend
            </button>
            <button className={ghost} onClick={() => toggle("call")}>
              Change time
            </button>
            <button className={ghost} disabled={busy} onClick={() => run(() => careApi.clear(item.player_id, { date }))}>
              Fine to train
            </button>
          </>
        )}
        {role === "trainer" && item.stage === "awaiting_coach" && (
          <button className={ghost} onClick={() => toggle("recommend")}>
            Change recommendation
          </button>
        )}
        {role === "coach" && item.stage === "awaiting_coach" && check?.recommendation && (
          <>
            <button className={primary} disabled={busy} onClick={() => run(() => careApi.decide(item.player_id, { date, level: check.recommendation! }))}>
              Agree: {levelInfo(check.recommendation).label}
            </button>
            <button className={ghost} onClick={() => toggle("decide")}>
              Change
            </button>
          </>
        )}
        {role === "coach" && (item.stage === "flagged" || item.stage === "called_in") && (
          <span className="self-center text-xs text-text-dim">{item.stage === "flagged" ? "Waiting for the AT to see them." : "The AT will see them and send you a recommendation."}</span>
        )}
        {item.stage === "decided" && role === "coach" && (
          <button className={ghost} onClick={() => toggle("decide")}>
            Change final call
          </button>
        )}
        {(item.stage === "cleared" || (item.stage === "decided" && role === "trainer")) && (
          <button
            className={ghost}
            disabled={busy}
            onClick={() => run(() => (item.stage === "cleared" ? careApi.clear(item.player_id, { date, cleared: false }) : careApi.reopen(item.player_id, { date })))}
          >
            Reopen
          </button>
        )}
        <button className={ghost} onClick={() => toggle("thread")} aria-expanded={panel === "thread"}>
          💬 {item.messages.length ? `Messages (${item.messages.length})` : "Message"}
        </button>
      </div>

      {panel === "call" && <CallInForm item={item} date={date} busy={busy} onSubmit={(body) => run(() => careApi.callIn(item.player_id, body))} />}
      {panel === "recommend" && (
        <LevelForm
          title="After seeing them, your recommendation for today"
          submit="Send to coach"
          initial={check?.recommendation ?? null}
          initialNote={check?.rec_note ?? ""}
          busy={busy}
          onSubmit={(level, note) => run(() => careApi.recommend(item.player_id, { date, level, note }))}
        />
      )}
      {panel === "decide" && (
        <LevelForm
          title="Final call for today (becomes their play status)"
          submit="Confirm"
          initial={check?.decision ?? check?.recommendation ?? null}
          initialNote=""
          busy={busy}
          onSubmit={(level, note) => run(() => careApi.decide(item.player_id, { date, level, note }))}
        />
      )}
      {panel === "thread" && (
        <div className="mt-3 rounded-lg border border-border p-3">
          <CareThread
            messages={item.messages}
            mine="staff"
            playerName={item.name.split(" ")[0]}
            quick={STAFF_QUICK}
            placeholder={`Message ${item.name.split(" ")[0]}…`}
            onSend={(body) => run(() => careApi.sendMessage({ player_id: item.player_id, date, body }), false)}
          />
          <p className="mt-2 text-[11px] text-text-dim">The player gets it on their phone. Coaches and the AT can both read this.</p>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-owl-red-light">{error}</p>}
    </li>
  );
}

function LevelChip({ level }: { level: PlayLevel }) {
  const l = levelInfo(level);
  return <span className={`rounded-full border px-1.5 py-px text-[11px] font-semibold ${l.chip}`}>{l.label}</span>;
}

function CallInForm({ item, date, busy, onSubmit }: { item: BeforeTrainingItem; date: string; busy: boolean; onSubmit: (body: Record<string, unknown>) => void }) {
  const a = item.appointment;
  const firstArea = item.reasons.find((r) => r.kind === "severe" || r.kind === "injury_area")?.label.replace(/ (severe|moderate|light)( ·.*)?$/, "");
  const [time, setTime] = useState(a?.treat_time ?? "07:30");
  const [kind, setKind] = useState<AppointmentKind>(a?.kind ?? "check");
  const [reason, setReason] = useState(a?.reason ?? firstArea ?? "");
  const [instructions, setInstructions] = useState(a?.instructions ?? "");
  const [message, setMessage] = useState(a ? "" : "Come see me before practice so I can check you out.");
  const add = (step: string) => setInstructions((cur) => (cur.includes(step) ? cur : cur ? `${cur}. ${step}` : step));
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-surface-raised/40 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[8rem_1fr_1fr]">
        <label className="flex flex-col gap-1 text-[11px] text-text-dim">
          Time
          <input type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-text-dim">
          For
          <select className={input} value={kind} onChange={(e) => setKind(e.target.value as AppointmentKind)}>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-[11px] text-text-dim sm:col-span-1">
          Area / reason
          <input className={input} value={reason} placeholder="e.g. Left quad" onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[11px] text-text-dim">
        What to do before they come in
        <input className={input} value={instructions} placeholder="e.g. Ice 15 min before" onChange={(e) => setInstructions(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-1">
        {BEFORE_STEPS.map((s) => (
          <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-dim hover:text-text">
            + {s}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-[11px] text-text-dim">
        Message to the player (optional)
        <input className={input} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <div className="flex items-center gap-2">
        <button className={primary} disabled={busy || !time} onClick={() => onSubmit({ date, time, kind, reason, instructions, message })}>
          {a ? "Update" : "Send to player"}
        </button>
        <span className="text-[11px] text-text-dim">They get it on their phone and accept or ask for another time.</span>
      </div>
    </div>
  );
}

function LevelForm({
  title,
  submit,
  initial,
  initialNote,
  busy,
  onSubmit,
}: {
  title: string;
  submit: string;
  initial: PlayLevel | null;
  initialNote: string;
  busy: boolean;
  onSubmit: (level: PlayLevel, note: string | null) => void;
}) {
  const [level, setLevel] = useState<PlayLevel | null>(initial);
  const [note, setNote] = useState(initialNote);
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-surface-raised/40 p-3">
      <div className="text-[11px] text-text-dim">{title}</div>
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
      <input className={input} value={note} placeholder="Note (e.g. No sprinting, technical work only)" onChange={(e) => setNote(e.target.value)} />
      <div>
        <button className={primary} disabled={busy || !level} onClick={() => level && onSubmit(level, note.trim() || null)}>
          {submit}
        </button>
      </div>
    </div>
  );
}

function FlagForm({ date, onDone }: { date: string; onDone: () => void }) {
  const { data } = useCareDay(date);
  const refresh = useRefresh();
  const [playerId, setPlayerId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 border-b border-border bg-surface-raised/40 px-4 py-3 sm:flex-row sm:items-center">
      <select className={`${input} sm:w-56`} value={playerId} onChange={(e) => setPlayerId(e.target.value)} aria-label="Player">
        <option value="">Choose a player…</option>
        {(data?.players ?? []).map((p) => (
          <option key={p.player_id} value={p.player_id}>
            {p.name}
          </option>
        ))}
      </select>
      <input className={input} value={note} placeholder="Why (e.g. said his back is tight)" onChange={(e) => setNote(e.target.value)} />
      <button
        className={primary}
        disabled={!playerId}
        onClick={async () => {
          try {
            await careApi.flag(Number(playerId), { date, note: note.trim() || null });
            await refresh();
            onDone();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Flag
      </button>
      {error && <span className="text-xs text-owl-red-light">{error}</span>}
    </div>
  );
}
