import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricDef } from "../types";
import { formatMetricValue } from "../lib/format";

export interface TrendSeries {
  dataKey: string;
  name: string;
  color: string;
}

export function TrendChart<T extends Record<string, unknown>>({
  data,
  xKey,
  xFormatter,
  series,
  metric,
  onPointClick,
  referenceValue,
  referenceLabel,
  height = 260,
}: {
  data: T[];
  xKey: string;
  xFormatter: (v: string) => string;
  series: TrendSeries[];
  metric?: MetricDef;
  onPointClick?: (point: T) => void;
  referenceValue?: number;
  referenceLabel?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: referenceValue !== undefined ? 60 : 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#2a2e37" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey={xKey}
          tickFormatter={xFormatter}
          stroke="#9aa0ab"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: "#2a2e37" }}
        />
        <YAxis
          stroke="#9aa0ab"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v) => formatMetricValue(v, metric ? { ...metric, decimals: 0 } : undefined)}
        />
        {referenceValue !== undefined && (
          <ReferenceLine
            y={referenceValue}
            stroke="#9aa0ab"
            strokeDasharray="4 4"
            label={{ value: referenceLabel ?? "Team avg", position: "right", fill: "#9aa0ab", fontSize: 11 }}
          />
        )}
        <Tooltip
          contentStyle={{
            background: "#1c1f26",
            border: "1px solid #2a2e37",
            borderRadius: 8,
            fontSize: 13,
          }}
          labelFormatter={(v) => xFormatter(String(v))}
          formatter={(value: number, name: string) => [formatMetricValue(value, metric), name]}
        />
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.color}
            strokeWidth={2.5}
            dot={{ r: 4, fill: s.color, cursor: onPointClick ? "pointer" : "default" }}
            activeDot={{
              r: 6,
              onClick: onPointClick ? (_: unknown, payload: any) => onPointClick(payload.payload) : undefined,
            }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
