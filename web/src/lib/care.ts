import type { AppointmentKind, IssueCategory, PlayLevel, RtpStage, Side, Treatment } from "../types";

/** Play status, as on the athletic trainer's injury report. */
export const LEVELS: { key: PlayLevel; label: string; short: string; chip: string; dot: string }[] = [
  { key: "full", label: "Full", short: "Full", chip: "border-teal/40 bg-teal/10 text-teal", dot: "bg-teal" },
  { key: "as_tolerated", label: "As tolerated", short: "As tol.", chip: "border-sky-400/40 bg-sky-400/10 text-sky-300", dot: "bg-sky-400" },
  { key: "limited", label: "Limited", short: "Limited", chip: "border-gold/40 bg-gold/10 text-gold", dot: "bg-gold" },
  { key: "rehab", label: "Rehab only", short: "Rehab", chip: "border-orange-400/40 bg-orange-400/10 text-orange-300", dot: "bg-orange-400" },
  { key: "out", label: "Out", short: "Out", chip: "border-owl-red/50 bg-owl-red/15 text-owl-red-light", dot: "bg-owl-red" },
];
export const levelInfo = (key: PlayLevel) => LEVELS.find((l) => l.key === key)!;

/** Return-to-play stages, in order. */
export const STAGES: { key: RtpStage; label: string }[] = [
  { key: "rehab", label: "Rehab" },
  { key: "running", label: "Individual running" },
  { key: "modified", label: "Modified training" },
  { key: "full", label: "Full training" },
  { key: "match_ready", label: "Match ready" },
];
export const stageLabel = (key: RtpStage) => STAGES.find((s) => s.key === key)?.label ?? key;

export const CATEGORIES: { key: IssueCategory; label: string }[] = [
  { key: "injury", label: "Injury" },
  { key: "gen_med", label: "Gen Med" },
  { key: "ppe", label: "PPE" },
];
export const categoryLabel = (key: IssueCategory) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

export const sideLabel = (side: Side | null) => (side === "left" ? "L" : side === "right" ? "R" : side === "both" ? "B" : "");

/** "14:00" → "2:00 PM". */
export function timeLabel(hhmm: string | null | undefined): string {
  const m = hhmm?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

export const TREATMENT_STYLE: Record<Treatment["status"], { label: string; chip: string }> = {
  pending: { label: "Pending", chip: "border-gold/50 bg-gold/10 text-gold" },
  booked: { label: "Confirmed", chip: "border-sky-400/40 bg-sky-400/10 text-sky-300" },
  attended: { label: "Came in", chip: "border-teal/40 bg-teal/10 text-teal" },
  missed: { label: "Missed", chip: "border-owl-red/50 bg-owl-red/15 text-owl-red-light" },
  declined: { label: "Declined", chip: "border-border text-text-dim line-through" },
  cancelled: { label: "Cancelled", chip: "border-border text-text-dim line-through" },
};

export const KINDS: { key: AppointmentKind; label: string; short: string }[] = [
  { key: "check", label: "Pre-training check", short: "Check" },
  { key: "proactive", label: "Proactive treatment", short: "Proactive" },
  { key: "treatment", label: "Treatment", short: "Treatment" },
  { key: "rehab", label: "Rehab", short: "Rehab" },
  { key: "other", label: "Other", short: "Other" },
];
export const kindLabel = (k: AppointmentKind) => KINDS.find((x) => x.key === k)?.label ?? "Appointment";

/** Where an appointment stands, in words: whose turn it is when it's still being agreed. */
export function appointmentState(t: Pick<Treatment, "status" | "awaiting" | "requested_by">, viewer: "staff" | "player" = "staff"): { label: string; chip: string } {
  if (t.status === "pending") {
    if (t.awaiting === "player") return { label: viewer === "player" ? "Please answer" : "Waiting on player", chip: TREATMENT_STYLE.pending.chip };
    return {
      label: viewer === "player" ? "Waiting on the AT" : t.requested_by === "player" ? "Player request · confirm" : "Player asked for this time · confirm",
      chip: "border-orange-400/50 bg-orange-400/15 text-orange-300",
    };
  }
  return TREATMENT_STYLE[t.status];
}

/** Attendance column of the report: Y when they came in, N when they missed, blank otherwise. */
export const attendanceMark = (treatments: Treatment[]) =>
  treatments.some((t) => t.status === "attended")
    ? "Y"
    : treatments.some((t) => t.status === "missed")
      ? "N"
      : treatments.some((t) => t.status === "booked" || t.status === "pending")
        ? "Booked"
        : "";
