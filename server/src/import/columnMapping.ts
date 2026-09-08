/**
 * Maps Titan GPS export column headers to storage targets. Zone-style
 * columns (speed zones, speed bands, accel/decel zones) are matched by
 * pattern rather than exact header list, because the number and thresholds
 * of zones can change between seasons or Titan configuration changes.
 * Anything that matches neither the core fields nor a zone pattern is left
 * unmapped; the caller logs it and it still gets preserved in raw_json.
 */

export const NAME_HEADER_CANDIDATES = ["name", "athlete", "athlete name", "player", "player name"];
export const DATE_HEADER_CANDIDATES = ["date", "session date", "game date"];

export const CORE_FIELD_MAP: Record<string, string> = {
  "Session Distance (mi)": "distance_mi",
  "Session Active Time (min)": "active_time_min",
  "Session Load": "load",
  "Session Top Speed (mi/hr)": "top_speed_mph",
  "Session Peak Accel (m/s/s)": "peak_accel",
  "Session Peak Decel (m/s/s)": "peak_decel",
  "Sprints Count": "sprints_count",
  "Sprints Max TopSpeed (mi/hr)": "sprints_max_topspeed_mph",
  "Sprints Avg TopSpeed (mi/hr)": "sprints_avg_topspeed_mph",
  "Sprints Distance (yrd)": "sprints_distance_yd",
  "Sprints Volume": "sprints_volume",
  "Explosiveness Count": "explosiveness_count",
  "Explosiveness Mean Accel (m/s/s)": "explosiveness_mean_accel",
};

export interface ZoneMapping {
  group: string;
  label: string;
  unit: string;
}

const ZONE_PATTERNS: Array<{ regex: RegExp; group: string; unit: string }> = [
  { regex: /^SpeedZones \(Duration\) (.+?) \(min\)$/, group: "speed_zone_duration", unit: "min" },
  { regex: /^SpeedZones \(Distance\) (.+?) \(mi\)$/, group: "speed_zone_distance", unit: "mi" },
  { regex: /^SpeedBands \(Duration\) (Band\d+) \(min\)$/, group: "speed_band_duration", unit: "min" },
  { regex: /^SpeedBands \(Distance\) (Band\d+) \(mi\)$/, group: "speed_band_distance", unit: "mi" },
  { regex: /^Accel\/Decel Zones Decel (-?[\d.]+m\/s\/s)$/, group: "decel_zone", unit: "count" },
  { regex: /^Accel\/Decel Zones Accel (-?[\d.]+m\/s\/s)$/, group: "accel_zone", unit: "count" },
];

export function matchZoneColumn(header: string): ZoneMapping | null {
  for (const pattern of ZONE_PATTERNS) {
    const match = header.match(pattern.regex);
    if (match) {
      const label = match[1] ?? header;
      return { group: pattern.group, label, unit: pattern.unit };
    }
  }
  // The two "personal band" headers have no capture group distinguishing
  // them beyond the fixed text, so give them a stable label.
  if (/^SpeedBands Personal \(Duration\)/.test(header)) {
    return { group: "speed_band_personal_duration", label: "Personal", unit: "min" };
  }
  if (/^SpeedBands Personal \(Distance\)/.test(header)) {
    return { group: "speed_band_personal_distance", label: "Personal", unit: "mi" };
  }
  return null;
}
