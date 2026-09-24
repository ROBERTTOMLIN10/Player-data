/**
 * Core gps_sessions metrics exposed to the API/frontend, with display info.
 * Central place to add a new core metric so it shows up consistently across
 * team/player/comparison views without touching each route.
 */
export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  decimals: number;
}

export const CORE_METRICS: MetricDef[] = [
  { key: "load", label: "Load", unit: "", decimals: 0 },
  { key: "distance_mi", label: "Distance", unit: "mi", decimals: 2 },
  { key: "active_time_min", label: "Active Time", unit: "min", decimals: 1 },
  { key: "top_speed_mph", label: "Top Speed", unit: "mph", decimals: 1 },
  { key: "sprints_count", label: "Sprints", unit: "", decimals: 0 },
  { key: "sprints_distance_yd", label: "Sprint Distance", unit: "yd", decimals: 0 },
  { key: "sprints_max_topspeed_mph", label: "Sprint Max Speed", unit: "mph", decimals: 1 },
  { key: "sprints_avg_topspeed_mph", label: "Sprint Avg Speed", unit: "mph", decimals: 1 },
  { key: "peak_accel", label: "Peak Accel", unit: "m/s/s", decimals: 2 },
  { key: "peak_decel", label: "Peak Decel", unit: "m/s/s", decimals: 2 },
  { key: "explosiveness_count", label: "Explosiveness", unit: "", decimals: 0 },
];

export const CORE_METRIC_KEYS = CORE_METRICS.map((m) => m.key);

/**
 * Tracker glitches: no player reaches this top speed (the fastest humans top
 * out around 27 mph sprinting, college players around 20-23), so a session
 * above it had a GPS jump that also inflates distance and load. Such sessions
 * are flagged and left out of averages, rankings and fitness (the
 * gps_sessions_valid view in schema.sql uses the same cut).
 */
export const GLITCH_TOP_SPEED_MPH = 25;
export const GLITCH_SQL = `CASE WHEN s.top_speed_mph > ${GLITCH_TOP_SPEED_MPH} THEN 1 ELSE 0 END AS glitch`;
