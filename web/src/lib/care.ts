import type { IssueCategory, PlayLevel, RtpStage, Side, Treatment } from "../types";

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
  booked: { label: "Booked", chip: "border-border text-text-dim" },
  attended: { label: "Came in", chip: "border-teal/40 bg-teal/10 text-teal" },
  missed: { label: "Missed", chip: "border-owl-red/50 bg-owl-red/15 text-owl-red-light" },
};

/** Attendance column of the report: Y when they came in, N when they missed, blank otherwise. */
export const attendanceMark = (treatments: Treatment[]) =>
  treatments.some((t) => t.status === "attended") ? "Y" : treatments.some((t) => t.status === "missed") ? "N" : treatments.length ? "Booked" : "";
