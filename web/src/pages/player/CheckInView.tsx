import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { saveMyReadiness, useMyReadinessToday } from "../../api/client";
import { BodyMap, SeverityLegend } from "../../components/BodyMap";
import { Card } from "../../components/Card";
import { PhoneSetupCard, ReminderStatus } from "../../components/PhoneSetupCard";
import { ReadinessSummary } from "../../components/ReadinessSummary";
import { regionLabel, SEVERITY_ORDER, SEVERITY_STYLE } from "../../lib/bodyRegions";
import { formatDateLong } from "../../lib/format";
import { readinessScore, scoreBand, WELLNESS_QUESTIONS, type WellnessKey } from "../../lib/readiness";
import type { Me, ReadinessEntry, Severity, SorenessEntry } from "../../types";

type Answers = Partial<Record<WellnessKey, number>>;

export default function CheckInView({ me }: { me: Me }) {
  const { data, isLoading, error } = useMyReadinessToday();
  const [editing, setEditing] = useState(false);

  if (isLoading) return <div className="py-20 text-center text-text-dim">Loading…</div>;
  if (error || !data) return <div className="py-20 text-center text-text-dim">Couldn&rsquo;t load today&rsquo;s check-in.</div>;

  const firstName = me.playerName?.split(" ")[0];
  const showForm = !data.entry || editing;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <p className="text-sm text-text-dim">{formatDateLong(data.date)}</p>
        <h1 className="font-display text-2xl font-semibold">
          {data.entry && !editing ? "You're checked in" : `Morning${firstName ? `, ${firstName}` : ""}`}
        </h1>
        <div className="mt-2">
          {data.game ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-owl-red-light/40 bg-owl-red/15 px-2.5 py-1 text-xs font-medium text-owl-red-light">
              <span className="h-1.5 w-1.5 rounded-full bg-owl-red-light" />
              Game day vs {data.game.opponent}
              {data.game.game_time ? ` · ${data.game.game_time}` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-text-dim">
              Training day
            </span>
          )}
        </div>
      </div>

      <PhoneSetupCard />

      {showForm ? (
        <CheckInForm
          existing={data.entry}
          isGameDay={Boolean(data.game)}
          onSaved={() => setEditing(false)}
          onCancel={data.entry ? () => setEditing(false) : undefined}
        />
      ) : (
        <>
          <ReadinessSummary entry={data.entry!} />
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-dim transition-colors hover:border-owl-red hover:text-text"
          >
            Edit today&rsquo;s check-in
          </button>
          <ReminderStatus />
        </>
      )}
    </div>
  );
}

function CheckInForm({
  existing,
  isGameDay,
  onSaved,
  onCancel,
}: {
  existing: ReadinessEntry | null;
  isGameDay: boolean;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState<number | null>(existing?.readiness_rating ?? null);
  const [sleepHours, setSleepHours] = useState<number | null>(existing?.sleep_hours ?? null);
  const [answers, setAnswers] = useState<Answers>(() =>
    existing
      ? {
          sleep_quality: existing.sleep_quality,
          energy: existing.energy,
          muscle_soreness: existing.muscle_soreness,
          stress: existing.stress,
          mood: existing.mood,
        }
      : {},
  );
  const [soreness, setSoreness] = useState<Record<string, SorenessEntry>>(() =>
    Object.fromEntries((existing?.soreness ?? []).map((s) => [s.region, s])),
  );
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const missingCount = WELLNESS_QUESTIONS.filter((q) => answers[q.key] === undefined).length + (rating === null ? 1 : 0);
  const score = rating === null ? null : readinessScore(rating);

  const severities = useMemo(
    () => Object.fromEntries(Object.values(soreness).map((s) => [s.region, s.severity])) as Record<string, Severity>,
    [soreness],
  );

  function setSeverity(region: string, severity: Severity | null) {
    setSoreness((prev) => {
      const next = { ...prev };
      if (severity === null) delete next[region];
      else next[region] = { region, severity, note: prev[region]?.note ?? null };
      return next;
    });
    if (severity === null) setActiveRegion(null);
  }

  function setRegionNote(region: string, note: string) {
    setSoreness((prev) => (prev[region] ? { ...prev, [region]: { ...prev[region], note } } : prev));
  }

  function handleRegionClick(region: string) {
    setActiveRegion(region);
    // First tap marks it; tapping again just reopens the editor.
    if (!soreness[region]) setSeverity(region, "light");
  }

  async function handleSubmit() {
    if (missingCount > 0 || rating === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveMyReadiness({
        readiness_rating: rating,
        sleep_hours: sleepHours,
        ...(answers as Record<WellnessKey, number>),
        notes: notes.trim() || null,
        soreness: Object.values(soreness).map((s) => ({ ...s, note: s.note?.trim() || null })),
      });
      queryClient.setQueryData(["myReadinessToday"], result);
      queryClient.invalidateQueries({ queryKey: ["myReadinessHistory"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
      onSaved();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const sortedSoreness = Object.values(soreness).sort(
    (a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity),
  );

  return (
    <div className="flex flex-col gap-5 pb-28">
      <Card className="flex flex-col gap-4">
        <SectionTitle step={1} title="How ready do you feel?" subtitle="10 = 100%, fully ready to train or play." />
        <ReadinessRating value={rating} onChange={setRating} />
      </Card>

      <Card className="flex flex-col gap-5">
        <SectionTitle step={2} title="Sleep" />
        <SleepHoursInput value={sleepHours} onChange={setSleepHours} />
        {WELLNESS_QUESTIONS.slice(0, 1).map((q) => (
          <ScaleQuestion key={q.key} question={q} value={answers[q.key]} onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} />
        ))}
      </Card>

      <Card className="flex flex-col gap-5">
        <SectionTitle step={3} title="How are you feeling?" />
        {WELLNESS_QUESTIONS.slice(1).map((q) => (
          <ScaleQuestion key={q.key} question={q} value={answers[q.key]} onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} />
        ))}
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionTitle
          step={4}
          title="Anything bothering you?"
          subtitle={
            isGameDay
              ? "Game day: tap the exact muscle that's sore or tight so coaches know before warm-up. Switch to Back for hamstrings, calves and glutes."
              : "Tap the exact muscle that's sore or tight. Switch to Back for hamstrings, calves and glutes. Leave it blank if you feel good."
          }
        />
        <BodyMap severities={severities} onRegionClick={handleRegionClick} activeRegion={activeRegion} layout="toggle" />
        <SeverityLegend />

        {/* Severity picker slides up above the submit bar, so it's visible
            right after tapping a muscle without scrolling past the figure. */}
        {activeRegion && soreness[activeRegion] && (
          <div className="fixed inset-x-0 bottom-[68px] z-30 px-3">
            <div className="mx-auto flex max-w-xl flex-col gap-3 rounded-xl border border-border bg-surface-raised p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.6)]">
              <div className="flex items-center justify-between">
                <span className="font-medium">{regionLabel(activeRegion)}</span>
                <button onClick={() => setActiveRegion(null)} className="text-xs text-text-dim hover:text-text">
                  Done
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SEVERITY_ORDER.map((sev) => {
                  const selected = soreness[activeRegion].severity === sev;
                  return (
                    <button
                      key={sev}
                      onClick={() => setSeverity(activeRegion, sev)}
                      className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                        selected ? SEVERITY_STYLE[sev].chip : "border-border text-text-dim hover:text-text"
                      }`}
                    >
                      {SEVERITY_STYLE[sev].label}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={soreness[activeRegion].note ?? ""}
                onChange={(e) => setRegionNote(activeRegion, e.target.value)}
                maxLength={300}
                placeholder="Optional: where exactly, what it feels like"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-base text-text outline-none placeholder:text-text-dim/70 focus:border-owl-red sm:text-sm"
              />
              <button onClick={() => setSeverity(activeRegion, null)} className="self-start text-xs text-owl-red-light hover:underline">
                Remove {regionLabel(activeRegion).toLowerCase()}
              </button>
            </div>
          </div>
        )}

        {sortedSoreness.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sortedSoreness.map((s) => (
              <button
                key={s.region}
                onClick={() => setActiveRegion(s.region)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${SEVERITY_STYLE[s.severity].chip}`}
              >
                {regionLabel(s.region)} · {SEVERITY_STYLE[s.severity].label}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionTitle step={5} title="Notes for coaches" subtitle="Optional: illness, knocks, anything else we should know." />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          rows={3}
          className="resize-y rounded-lg border border-border bg-surface-raised px-3 py-2 text-base text-text outline-none focus:border-owl-red sm:text-sm"
        />
      </Card>

      {saveError && <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{saveError}</div>}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-ink/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            {score !== null ? (
              <span>
                Readiness{" "}
                <span className={`font-display text-lg font-semibold ${bandText(score)}`}>{score}%</span>
              </span>
            ) : null}
            {missingCount > 0 && (
              <span className={`text-text-dim ${score !== null ? "ml-2 text-xs" : ""}`}>
                {missingCount} question{missingCount === 1 ? "" : "s"} left
              </span>
            )}
          </div>
          {onCancel && (
            <button onClick={onCancel} className="px-3 py-2.5 text-sm text-text-dim hover:text-text">
              Cancel
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={saving || missingCount > 0}
            className="rounded-lg bg-owl-red px-5 py-2.5 font-medium text-white transition-colors hover:bg-owl-red/90 disabled:opacity-40"
          >
            {saving ? "Saving…" : existing ? "Save changes" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function bandText(score: number) {
  const band = scoreBand(score);
  return band === "red" ? "text-owl-red-light" : band === "amber" ? "text-gold" : "text-teal";
}

const RATING_WORDS: Record<number, string> = {
  1: "Can't train",
  2: "Very poor",
  3: "Poor",
  4: "Below par",
  5: "So-so",
  6: "OK",
  7: "Good",
  8: "Very good",
  9: "Sharp",
  10: "100%",
};

function ReadinessRating({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className={`font-display text-3xl font-semibold ${value ? bandText(value * 10) : "text-text-dim"}`}>
          {value ? `${value * 10}%` : "—"}
        </span>
        <span className="text-sm text-text-dim">{value ? RATING_WORDS[value] : "Tap a number"}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10" role="radiogroup" aria-label="Overall readiness">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => {
          const selected = value === v;
          const band = scoreBand(v * 10);
          return (
            <button
              key={v}
              role="radio"
              aria-checked={selected}
              aria-label={`${v} out of 10`}
              onClick={() => onChange(v)}
              className={`rounded-lg border py-2.5 font-display text-base font-semibold transition-colors ${
                selected
                  ? band === "red"
                    ? SCALE_SELECTED[1]
                    : band === "amber"
                      ? SCALE_SELECTED[3]
                      : SCALE_SELECTED[5]
                  : "border-border bg-surface-raised text-text-dim hover:text-text"
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-text-dim">
        <span>1 · Can&rsquo;t train</span>
        <span>10 · 100%</span>
      </div>
    </div>
  );
}

function SectionTitle({ step, title, subtitle }: { step: number; title: string; subtitle?: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-owl-red/20 text-xs font-semibold text-owl-red-light">
        {step}
      </span>
      <div>
        <h2 className="font-display font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-text-dim">{subtitle}</p>}
      </div>
    </div>
  );
}

function ScaleQuestion({
  question,
  value,
  onChange,
}: {
  question: (typeof WELLNESS_QUESTIONS)[number];
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{question.label}</span>
        <span className="text-xs text-text-dim">{value ? question.options[value - 1] : "Tap to answer"}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={question.label}>
        {question.options.map((option, i) => {
          const v = i + 1;
          const selected = value === v;
          return (
            <button
              key={v}
              role="radio"
              aria-checked={selected}
              aria-label={option}
              onClick={() => onChange(v)}
              className={`flex flex-col items-center rounded-lg border py-2 transition-colors ${
                selected ? SCALE_SELECTED[v] : "border-border bg-surface-raised text-text-dim hover:text-text"
              }`}
            >
              <span className="font-display text-base font-semibold">{v}</span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-text-dim">
        <span>{question.options[0]}</span>
        <span>{question.options[4]}</span>
      </div>
    </div>
  );
}

const SCALE_SELECTED: Record<number, string> = {
  1: "border-owl-red-light bg-owl-red/25 text-white",
  2: "border-orange-400 bg-orange-400/20 text-white",
  3: "border-gold bg-gold/20 text-white",
  4: "border-teal/80 bg-teal/15 text-white",
  5: "border-teal bg-teal/25 text-white",
};

function SleepHoursInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  // First tap on either button starts from 8h.
  const step = (delta: number) => onChange(value === null ? 8 : Math.min(14, Math.max(0, value + delta)));
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">Hours slept</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => step(-0.5)}
          aria-label="Less sleep"
          className="h-9 w-9 rounded-lg border border-border bg-surface-raised text-lg text-text-dim hover:text-text"
        >
          −
        </button>
        <span className="w-14 text-center font-display text-lg font-semibold">{value === null ? "—" : value}</span>
        <button
          onClick={() => step(0.5)}
          aria-label="More sleep"
          className="h-9 w-9 rounded-lg border border-border bg-surface-raised text-lg text-text-dim hover:text-text"
        >
          +
        </button>
      </div>
    </div>
  );
}
