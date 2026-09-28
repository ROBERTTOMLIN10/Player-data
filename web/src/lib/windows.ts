/**
 * Names for the rolling windows used across the app: always "7-day" and
 * "Last Month" (the last 28 days), never "28-day".
 */
export function windowLabel(days: number): string {
  if (days === 7) return "7-day";
  if (days === 28) return "Last Month";
  return `${days}-day`;
}
