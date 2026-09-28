/** Post-training RPE (rate of perceived exertion): 1 = very easy, 10 = maximal. */
export const RPE_SCALE: { value: number; label: string }[] = [
  { value: 1, label: "Very easy" },
  { value: 2, label: "Easy" },
  { value: 3, label: "Light" },
  { value: 4, label: "Moderate" },
  { value: 5, label: "Moderate" },
  { value: 6, label: "Somewhat hard" },
  { value: 7, label: "Hard" },
  { value: 8, label: "Very hard" },
  { value: 9, label: "Extremely hard" },
  { value: 10, label: "Maximal" },
];

export type RpeBand = "easy" | "moderate" | "hard" | "veryHard";

// Colour bands line up with the words: easy 1–3, moderate 4–6, hard 7–8, very hard 9–10.
export function rpeBand(rpe: number): RpeBand {
  return rpe <= 3 ? "easy" : rpe <= 6 ? "moderate" : rpe <= 8 ? "hard" : "veryHard";
}

export const RPE_STYLE: Record<RpeBand, { label: string; hex: string; pill: string; button: string }> = {
  easy: { label: "Easy", hex: "#2dd4bf", pill: "bg-teal/15 text-teal border-teal/40", button: "bg-teal text-ink" },
  moderate: { label: "Moderate", hex: "#f2b705", pill: "bg-gold/15 text-gold border-gold/40", button: "bg-gold text-ink" },
  hard: { label: "Hard", hex: "#fb923c", pill: "bg-[#fb923c]/15 text-[#fb923c] border-[#fb923c]/40", button: "bg-[#fb923c] text-ink" },
  veryHard: { label: "Very hard", hex: "#ff3f5e", pill: "bg-owl-red/20 text-owl-red-light border-owl-red-light/40", button: "bg-owl-red-light text-ink" },
};

export const rpeLabel = (rpe: number) => RPE_SCALE[rpe - 1]?.label ?? "";

/** An average to one decimal (whole numbers as they are), or a dash. */
export const formatRpe = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(1);
