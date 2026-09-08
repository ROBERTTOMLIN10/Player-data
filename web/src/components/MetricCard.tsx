import type { MetricDef } from "../types";
import { formatMetricValue } from "../lib/format";

export function MetricCard({
  metric,
  value,
  highlight,
  onClick,
  active,
}: {
  metric: MetricDef;
  value: number | null | undefined;
  highlight?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors sm:p-4 ${
        active
          ? "border-owl-red bg-owl-red/10"
          : "border-border bg-surface-raised hover:border-text-dim"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-text-dim">{metric.label}</span>
      <span className="mt-1 font-display text-xl font-semibold text-text sm:text-2xl">
        {formatMetricValue(value, metric)}
      </span>
      {highlight && <span className="mt-1 text-xs text-teal">{highlight}</span>}
    </Tag>
  );
}
