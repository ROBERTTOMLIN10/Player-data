import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { markTreatmentAttended, myCareApi, useMyCare } from "../api/client";
import { appointmentState, KINDS, levelInfo, sideLabel, stageLabel, timeLabel } from "../lib/care";
import { formatDate } from "../lib/format";
import type { AppointmentKind, MyCare, PrehabLog } from "../types";
import { CareThread } from "./CareThread";

const input = "w-full rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-text outline-none focus:border-owl-red";
const primary = "rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50";
const ghost = "rounded-lg border border-border px-3 py-1.5 text-sm text-text-dim hover:text-text disabled:opacity-50";

const QUICK = [
  { key: "on_my_way", label: "On my way" },
  { key: "running_late", label: "Running 10 min late" },
  { key: "feeling_better", label: "Feeling better now" },
  { key: "need_time", label: "Can we do another time?" },
];

type Appt = MyCare["treatments"][number];

/**
 * The player's Athletic Training tab: today's play status, appointments with the
 * AT (accept, ask for another time, decline, "I came in"), the AT calling them in
 * before practice, messages back and forth, asking for a time, and their injuries.
 */
export function AthleticTrainingPanel() {
  const { data } = useMyCare();
  const qc = useQueryClient();
  const [requesting, setRequesting] = useState(false);
  if (!data) return <div className="py-16 text-center text-text-dim">Loading…</div>;
  const refresh = () => qc.invalidateQueries({ queryKey: ["myCare"] });
  const callIn = data.check?.appointment_id ? data.treatments.find((t) => t.id === data.check!.appointment_id) : undefined;
  const others = data.treatments.filter((t) => t !== callIn && t.status !== "declined");
  const level = data.check?.decision ?? data.availability?.level ?? "full";
  const note = data.check?.decision_note ?? data.availability?.practice_note;
  const limits = [
    ["Bike", data.availability?.bike],
    ["Jogging", data.availability?.jogging],
    ["Running", data.availability?.running],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="flex flex-col gap-5">
      <section className={`rounded-xl border p-4 ${levelInfo(level).chip}`}>
        <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Today</div>
        <div className="mt-0.5 font-display text-lg font-semibold">{levelInfo(level).label}</div>
        {note && <p className="text-sm">{note}</p>}
        {limits.length > 0 && (
          <ul className="mt-1 text-xs opacity-90">
            {limits.map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-dim">Treatment</h2>
          {!requesting && (
            <button onClick={() => setRequesting(true)} className="text-sm text-sky-300 hover:underline">
              ✚ Request a time
            </button>
          )}
        </div>
        {requesting && (
          <div className="border-b border-border p-3">
            <RequestForm today={data.today} issues={data.issues} onDone={() => setRequesting(false)} onSaved={refresh} />
          </div>
        )}
        {callIn || others.length ? (
          <ul className="divide-y divide-border/70">
            {callIn && <AppointmentRow t={callIn} today={data.today} onChange={refresh} highlight />}
            {others.map((t) => (
              <AppointmentRow key={t.id} t={t} today={data.today} onChange={refresh} />
            ))}
          </ul>
        ) : (
          !requesting && <p className="px-4 py-4 text-sm text-text-dim">Nothing booked. Request a time if you want to see the athletic trainer.</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-dim">Messages with the athletic trainer</h2>
        {data.messages.length === 0 && <p className="mb-2 text-sm text-text-dim">No messages today. Let the AT know if something&rsquo;s bothering you.</p>}
        <CareThread
          messages={data.messages}
          mine="player"
          quick={QUICK}
          placeholder="Message the AT…"
          onSend={async (body, quick) => {
            await myCareApi.message(quick ? { quick } : { body });
            await refresh();
          }}
        />
      </section>

      <TreatmentLog log={data.log} />
      <Prehab issues={data.issues} entries={data.prehab} today={data.today} canTrain={level !== "out" && level !== "rehab"} onSaved={refresh} />
    </div>
  );
}

/** Something waiting on the player's answer (a time to accept), for the dot on their Athletic Training tab. */
export function useAtNeedsAnswer() {
  const { data } = useMyCare();
  return Boolean(data?.treatments.some((t) => t.status === "pending" && t.awaiting === "player"));
}

/** What the player sees an appointment as: proactive and regular treatment are both just "Treatment". */
const playerKind = (k: Appt["kind"]) => (k === "check" ? "Pre-practice check" : k === "rehab" ? "Rehab" : "Treatment");

function AppointmentRow({ t, today, onChange, highlight = false }: { t: Appt; today: string; onChange: () => Promise<unknown>; highlight?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState(false);
  const [time, setTime] = useState(t.treat_time ?? "");
  const [note, setNote] = useState("");
  const isToday = t.treat_date === today;
  const when = [isToday ? "Today" : formatDate(t.treat_date), timeLabel(t.treat_time)].filter(Boolean).join(" · ");
  const state = appointmentState(t, "player");
  const mustAnswer = t.status === "pending" && t.awaiting === "player";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChange();
      setReschedule(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`px-4 py-3 ${highlight && t.status !== "attended" ? "bg-gold/5" : ""}`}>
      {highlight && t.status !== "attended" && <div className="mb-1 text-sm font-semibold text-gold">The athletic trainer wants to see you before practice</div>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{when}</span>
        <span className="text-sm text-text-dim">
          {playerKind(t.kind)}
          {t.injury ? ` · ${t.injury}` : t.reason ? ` · ${t.reason}` : ""}
        </span>
        <span className={`rounded-full border px-1.5 py-px text-[11px] ${state.chip}`}>{state.label}</span>
      </div>
      {t.instructions && <p className="mt-1 text-sm text-text-dim">Before you come in: {t.instructions}</p>}
      {t.status === "pending" && t.awaiting === "trainer" && <p className="mt-1 text-xs text-text-dim">You asked for {timeLabel(t.treat_time)}. The AT will confirm.</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {mustAnswer && !reschedule && (
          <>
            <button className={primary} disabled={busy} onClick={() => run(() => myCareApi.respond(t.id, { action: "accept" }))}>
              Accept
            </button>
            <button className={ghost} disabled={busy} onClick={() => setReschedule(true)}>
              Re-schedule
            </button>
          </>
        )}
        {t.status === "booked" && isToday && (
          <button className={primary} disabled={busy} onClick={() => run(() => markTreatmentAttended(t.id))}>
            I came in
          </button>
        )}
        {t.status === "attended" &&
          (t.confirmed_at ? (
            <span className="text-sm font-medium text-teal">✓ Came in · confirmed by the AT</span>
          ) : (
            <span className="text-sm text-text-dim">✓ You said you came in · waiting on the AT to confirm</span>
          ))}
      </div>
      {reschedule && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex gap-2">
            <input type="time" className={`${input} w-32`} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time that works" />
            <input className={input} placeholder="Why (e.g. class until 10)" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button className={primary} disabled={busy || !time} onClick={() => run(() => myCareApi.respond(t.id, { action: "reschedule", time, note: note.trim() || undefined }))}>
              Send to the AT
            </button>
            <button className={ghost} onClick={() => setReschedule(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-owl-red-light">{error}</p>}
    </li>
  );
}

function RequestForm({ today, issues, onDone, onSaved }: { today: string; issues: MyCare["issues"]; onDone: () => void; onSaved: () => Promise<unknown> }) {
  const [date, setDate] = useState(today);
  const [injury, setInjury] = useState<string>(issues.find((i) => !i.closed_at)?.id.toString() ?? (issues.length ? String(issues[0].id) : "new"));
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<AppointmentKind>("treatment");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-dim">Request a time</div>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" className={input} value={date} min={today} onChange={(e) => setDate(e.target.value)} aria-label="Day" />
        <input type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
        <select className={input} value={kind} onChange={(e) => setKind(e.target.value as AppointmentKind)} aria-label="What for">
          {KINDS.filter((k) => k.key !== "check" && k.key !== "proactive").map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
        <select className={input} value={injury} onChange={(e) => setInjury(e.target.value)} aria-label="For which injury">
          {issues.map((i) => (
            <option key={i.id} value={i.id}>
              {i.description}
              {i.side ? ` (${sideLabel(i.side)})` : ""}
              {i.closed_at ? " · past" : ""}
            </option>
          ))}
          <option value="new">Something new…</option>
        </select>
      </div>
      {injury === "new" && <input className={input} placeholder="What's bothering you (e.g. Right calf tight)" value={reason} onChange={(e) => setReason(e.target.value)} />}
      <input className={input} placeholder="Note for the AT (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <button
          className={primary}
          disabled={busy || !time || !date || (injury === "new" && !reason.trim())}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await myCareApi.request({
                date,
                time,
                kind,
                injury_id: injury === "new" ? null : Number(injury),
                reason: injury === "new" ? reason.trim() : undefined,
                note: note.trim() || undefined,
              });
              await onSaved();
              onDone();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Send request
        </button>
        <button className={ghost} onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-owl-red-light">{error}</p>}
    </div>
  );
}

/** Visits the AT has confirmed, newest first (last 90 days). */
function TreatmentLog({ log }: { log: MyCare["log"] }) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-dim">Treatment log</h2>
        <p className="text-[11px] text-text-dim">Treatment you&rsquo;ve had, confirmed by the athletic trainer.</p>
      </div>
      {log.length === 0 ? (
        <p className="px-4 py-3 text-sm text-text-dim">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {log.map((t) => (
            <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2 text-sm">
              <span className="w-24 shrink-0 text-text-dim">{formatDate(t.treat_date)}</span>
              <span className="font-medium">{playerKind(t.kind)}</span>
              <span className="text-text-dim">{t.injury ?? t.reason ?? ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PREHAB_STATUS: Record<PrehabLog["status"], { label: string; chip: string }> = {
  pending: { label: "Waiting on the AT", chip: "border-gold/50 bg-gold/10 text-gold" },
  confirmed: { label: "Confirmed", chip: "border-teal/40 bg-teal/10 text-teal" },
  rejected: { label: "Not confirmed", chip: "border-border text-text-dim" },
};

/**
 * Pre-hab: work the player does themselves to keep a past injury from coming back,
 * or for something they're still training with. The AT confirms each entry.
 */
function Prehab({
  issues,
  entries,
  today,
  canTrain,
  onSaved,
}: {
  issues: MyCare["issues"];
  entries: PrehabLog[];
  today: string;
  canTrain: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const current = issues.filter((i) => !i.closed_at);
  const past = issues.filter((i) => i.closed_at);
  const [injury, setInjury] = useState<number | null>(null);
  const [activities, setActivities] = useState("");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!issues.length) return null;

  const save = async () => {
    if (injury === null) return;
    setBusy(true);
    setError(null);
    try {
      await myCareApi.prehab({ injury_id: injury, activities: activities.trim(), minutes: minutes ? Number(minutes) : null, date: today });
      await onSaved();
      setInjury(null);
      setActivities("");
      setMinutes("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const group = (title: string, hint: string, list: MyCare["issues"]) =>
    list.length > 0 && (
      <div>
        <div className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-text-dim">
          {title} <span className="font-normal normal-case tracking-normal">· {hint}</span>
        </div>
        <ul>
          {list.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-sm">
              <span className="font-medium">
                {i.description}
                {i.side ? ` (${sideLabel(i.side)})` : ""}
              </span>
              <span className="text-xs text-text-dim">
                {i.closed_at ? `back since ${formatDate(i.closed_at)}` : `${stageLabel(i.stage)}${i.expected_return ? ` · back ~${formatDate(i.expected_return)}` : ""}`}
              </span>
              <button onClick={() => setInjury(injury === i.id ? null : i.id)} className="ml-auto text-xs text-sky-300 hover:underline">
                {injury === i.id ? "Cancel" : "+ Log pre-hab"}
              </button>
              {injury === i.id && (
                <div className="flex w-full flex-col gap-2 pt-1">
                  <input className={input} placeholder="What you did (e.g. Calf raises 3x15, banded ankle work)" value={activities} onChange={(e) => setActivities(e.target.value)} />
                  <div className="flex gap-2">
                    <input className={`${input} w-28`} inputMode="numeric" placeholder="Minutes" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} />
                    <button className={primary} disabled={busy || !activities.trim()} onClick={save}>
                      Log it
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <section className="rounded-xl border border-border bg-surface pb-2">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-dim">Pre-hab</h2>
        <p className="text-[11px] text-text-dim">Log what you do to stay on top of past and current injuries. The AT confirms each one.</p>
      </div>
      {group("Current", canTrain ? "still training with it" : "the AT will guide your rehab", current)}
      {group("Past", "keep it from coming back", past)}
      {error && <p className="px-4 text-xs text-owl-red-light">{error}</p>}
      {entries.length > 0 && (
        <ul className="mt-2 divide-y divide-border/60 border-t border-border">
          {entries.slice(0, 8).map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2 text-sm">
              <span className="w-24 shrink-0 text-text-dim">{formatDate(e.log_date)}</span>
              <span className="min-w-0 flex-1">
                {e.activities}
                {e.minutes ? <span className="text-text-dim"> · {e.minutes} min</span> : null}
                {e.injury ? <span className="text-text-dim"> · {e.injury}</span> : null}
              </span>
              <span className={`rounded-full border px-1.5 py-px text-[11px] ${PREHAB_STATUS[e.status].chip}`}>{PREHAB_STATUS[e.status].label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
