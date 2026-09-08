export const SERIES_COLORS = ["#ff3f5e", "#2dd4bf", "#f2b705", "#818cf8", "#fb923c", "#4ade80"];

export function colorForIndex(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length];
}
