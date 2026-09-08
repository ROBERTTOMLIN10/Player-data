import type { MetricDef } from "../types";

export function formatMetricValue(value: number | string | null | undefined, metric?: MetricDef): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  const decimals = metric?.decimals ?? 1;
  const formatted = num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
