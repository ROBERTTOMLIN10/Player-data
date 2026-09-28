import type { MetricDef } from "../types";

export function formatMetricValue(value: number | string | null | undefined, metric?: MetricDef): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  const decimals = metric?.decimals ?? 1;
  const formatted = num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  // Yards (sprint distance) also show in miles: "1,842 yd (1.05 mi)".
  if (metric?.unit === "yd") return `${formatted} yd (${(num / 1760).toFixed(2)} mi)`;
  return metric?.unit ? `${formatted} ${metric.unit}` : formatted;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateLong(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
