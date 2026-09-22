/**
 * Body-map region ids a player can flag on their readiness check-in. Must stay
 * in sync with the geometry/labels in web/src/lib/bodyRegions.ts. Paired
 * regions use _l / _r for the player's own left / right.
 */
const PAIRED = [
  "trap",
  "delt_front",
  "delt_rear",
  "chest",
  "bicep",
  "tricep",
  "forearm",
  "hand",
  "oblique",
  "upper_back",
  "lat",
  "lower_back",
  "hip_flexor",
  "groin",
  "glute_med",
  "glute",
  "quad_outer",
  "quad_front",
  "quad_inner",
  "hamstring_outer",
  "hamstring_inner",
  "knee",
  "shin",
  "calf_outer",
  "calf_inner",
  "ankle",
  "achilles",
  "foot",
];

const SINGLE = ["head", "neck", "abs_upper", "abs_lower"];

export const BODY_REGION_IDS = new Set<string>([...SINGLE, ...PAIRED.flatMap((r) => [`${r}_l`, `${r}_r`])]);

export const SEVERITIES = ["light", "moderate", "severe"] as const;
export type Severity = (typeof SEVERITIES)[number];
