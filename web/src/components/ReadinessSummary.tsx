import { BodyMap } from "./BodyMap";
import { Card } from "./Card";
import { regionLabel, SEVERITY_STYLE } from "../lib/bodyRegions";
import { scoreBand, STATUS_STYLE, WELLNESS_QUESTIONS, wellnessTextClass } from "../lib/readiness";
import type { ReadinessEntry, Severity } from "../types";

/** Read-only card for one check-in: score, wellness answers, body map and notes. */
export function ReadinessSummary({ entry, showBodyMap = true }: { entry: ReadinessEntry; showBodyMap?: boolean }) {
  const band = scoreBand(entry.readiness_score);
  const severities = Object.fromEntries(entry.soreness.map((s) => [s.region, s.severity])) as Record<string, Severity>;
  const submitted = new Date(`${entry.updated_at.replace(" ", "T")}Z`);

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <ScoreRing score={entry.readiness_score} color={STATUS_STYLE[band].hex} />
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-text-dim">Readiness</div>
          <div className="font-display text-lg font-semibold">
            {band === "green" ? "Good to go" : band === "amber" ? "A bit flat" : "Not feeling great"}
          </div>
          <div className="text-xs text-text-dim">
            Submitted {submitted.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            {entry.sleep_hours !== null && <> · {entry.sleep_hours}h sleep</>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5 text-center">
        {WELLNESS_QUESTIONS.map((q) => {
          const v = entry[q.key];
          return (
            <div key={q.key} className="rounded-lg border border-border bg-surface-raised px-1 py-2">
              <div className={`font-display text-lg font-semibold ${wellnessTextClass(v)}`}>{v}</div>
              <div className="truncate text-[10px] uppercase tracking-wide text-text-dim">{q.short}</div>
            </div>
          );
        })}
      </div>

      {entry.soreness.length > 0 ? (
        <div className="flex flex-col gap-3">
          {showBodyMap && <BodyMap severities={severities} className="mx-auto w-full max-w-sm" />}
          <SorenessList soreness={entry.soreness} />
        </div>
      ) : (
        <div className="text-sm text-text-dim">Nothing sore or bothering you.</div>
      )}

      {entry.notes && (
        <div className="rounded-lg border border-border bg-surface-raised p-3 text-sm">
          <div className="mb-1 text-xs uppercase tracking-wide text-text-dim">Notes</div>
          <p className="whitespace-pre-wrap">{entry.notes}</p>
        </div>
      )}
    </Card>
  );
}

export function SorenessList({ soreness }: { soreness: ReadinessEntry["soreness"] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {soreness.map((s) => (
        <li key={s.region} className="flex flex-wrap items-baseline gap-2 text-sm">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLE[s.severity].chip}`}>
            {SEVERITY_STYLE[s.severity].label}
          </span>
          <span className="font-medium">{regionLabel(s.region)}</span>
          {s.note && <span className="text-text-dim">— {s.note}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ScoreRing({ score, color, size = 64 }: { score: number; color: string; size?: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0" aria-label={`Readiness ${score}%`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="#2a2e37" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" fill="#e9eaee" fontSize="15" fontWeight="600">
        {score}
      </text>
    </svg>
  );
}
