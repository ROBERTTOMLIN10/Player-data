import type { MetricDef } from "../types";

const KM_PER_MILE = 1.609344;

export function formatMetricValue(value: number | string | null | undefined, metric?: MetricDef): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  const decimals = metric?.decimals ?? 1;
  const formatted = num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  // Imperial units also show metric: "4.88 mi (7.85 km)", "1,842 yd (1.05 mi · 1.68 km)",
  // "18.9 mph (30.4 km/h)". Chart axes pass unit "" so their ticks stay short.
  if (metric?.unit === "yd") return `${formatted} yd (${(num / 1760).toFixed(2)} mi · ${((num * 0.9144) / 1000).toFixed(2)} km)`;
  if (metric?.unit === "mi") return `${formatted} mi (${(num * KM_PER_MILE).toFixed(decimals)} km)`;
  if (metric?.unit === "mph") return `${formatted} mph (${(num * KM_PER_MILE).toFixed(1)} km/h)`;
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

/** A kick-off time in Eastern time (where FAU plays), e.g. "7:00 PM ET", so it reads the same on any device. */
export function kickoffTime(epochSeconds: number): string {
  return `${new Date(epochSeconds * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;
}
