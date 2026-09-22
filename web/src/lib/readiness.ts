import type { ReadinessStatus } from "../types";

export type WellnessKey = "sleep_quality" | "energy" | "muscle_soreness" | "stress" | "mood";

/** Check-in questions. Every scale is 1–5 with 5 as the good end, matching the server's score. */
export const WELLNESS_QUESTIONS: { key: WellnessKey; label: string; short: string; options: string[] }[] = [
  { key: "sleep_quality", label: "Sleep quality", short: "Sleep", options: ["Terrible", "Poor", "OK", "Good", "Great"] },
  { key: "energy", label: "Energy", short: "Energy", options: ["Exhausted", "Tired", "Normal", "Fresh", "Very fresh"] },
  {
    key: "muscle_soreness",
    label: "Muscle soreness",
    short: "Soreness",
    options: ["Very sore", "Sore", "A little", "Slight", "None"],
  },
  { key: "stress", label: "Stress", short: "Stress", options: ["Very stressed", "Stressed", "Normal", "Relaxed", "Very relaxed"] },
  { key: "mood", label: "Mood", short: "Mood", options: ["Very low", "Low", "OK", "Good", "Great"] },
];

/** Overall readiness is the player's own 1–10 answer; 10 = 100%. */
export function readinessScore(rating: number): number {
  return rating * 10;
}

/** Same bands the server uses for flags: 1–5 red, 6–7 amber, 8–10 green. */
export function scoreBand(score: number): "red" | "amber" | "green" {
  if (score < 60) return "red";
  if (score < 75) return "amber";
  return "green";
}

export const STATUS_STYLE: Record<ReadinessStatus, { label: string; dot: string; pill: string; hex: string }> = {
  red: { label: "Watch", dot: "bg-owl-red-light", pill: "bg-owl-red/20 text-owl-red-light border-owl-red-light/40", hex: "#ff3f5e" },
  amber: { label: "Monitor", dot: "bg-gold", pill: "bg-gold/15 text-gold border-gold/40", hex: "#f2b705" },
  green: { label: "Good", dot: "bg-teal", pill: "bg-teal/15 text-teal border-teal/40", hex: "#2dd4bf" },
  missing: { label: "Not in", dot: "bg-text-dim/40", pill: "bg-surface-raised text-text-dim border-border", hex: "#9aa0ab" },
};

/** Colour for a single 1–5 wellness answer (5 = good). */
export function wellnessTextClass(value: number): string {
  if (value <= 2) return "text-owl-red-light";
  if (value === 3) return "text-gold";
  return "text-teal";
}
