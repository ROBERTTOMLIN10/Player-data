/**
 * Body-map region ids a player can flag on their readiness check-in. Must stay
 * in sync with the geometry/labels in web/src/lib/bodyRegions.ts. Paired
 * regions use _l / _r for the player's own left / right.
 */
const PAIRED = [
  "shoulder",
  "chest",
  "bicep",
  "tricep",
  "forearm",
  "hand",
  "hip_flexor",
  "groin",
  "glute",
  "quad",
  "hamstring",
  "knee",
  "shin",
  "calf",
  "ankle",
  "achilles",
  "foot",
];

const SINGLE = ["head", "neck", "upper_back", "lower_back", "abdomen"];

export const BODY_REGION_IDS = new Set<string>([...SINGLE, ...PAIRED.flatMap((r) => [`${r}_l`, `${r}_r`])]);

export const SEVERITIES = ["light", "moderate", "severe"] as const;
export type Severity = (typeof SEVERITIES)[number];
