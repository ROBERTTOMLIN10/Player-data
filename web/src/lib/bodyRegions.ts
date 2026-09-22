import type { Severity } from "../types";

/**
 * Geometry + labels for the interactive body map. Region ids must stay in sync
 * with server/src/lib/bodyRegions.ts. Paired regions use _l / _r for the
 * PLAYER's left/right: on the front view their right side is on the viewer's
 * left, on the back view it's on the viewer's right.
 *
 * Coordinates are in a 200 x 350 viewBox.
 */
export type Shape =
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "path"; d: string };

export interface RegionShape {
  id: string;
  shape: Shape;
}

const ellipse = (cx: number, cy: number, rx: number, ry: number): Shape => ({ kind: "ellipse", cx, cy, rx, ry });

/** Tapered limb segment from (x1,y1) width w1 to (x2,y2) width w2, with rounded ends. */
function taper(x1: number, y1: number, w1: number, x2: number, y2: number, w2: number): Shape {
  const tl = [x1 - w1 / 2, y1];
  const tr = [x1 + w1 / 2, y1];
  const br = [x2 + w2 / 2, y2];
  const bl = [x2 - w2 / 2, y2];
  return {
    kind: "path",
    d: `M${tl} Q${x1},${y1 - w1 * 0.4} ${tr} L${br} Q${x2},${y2 + w2 * 0.4} ${bl} Z`,
  };
}

/** Rounded rectangle as a path. */
function box(x: number, y: number, w: number, h: number, r: number): Shape {
  return {
    kind: "path",
    d: `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`,
  };
}

/** Builds a left/right pair; `near` is the side drawn on the viewer's left. */
function pair(base: string, near: "l" | "r", make: (mirror: (x: number) => number) => Shape): RegionShape[] {
  const far = near === "l" ? "r" : "l";
  return [
    { id: `${base}_${near}`, shape: make((x) => x) },
    { id: `${base}_${far}`, shape: make((x) => 200 - x) },
  ];
}

function sharedUpper(near: "l" | "r"): RegionShape[] {
  return [
    { id: "head", shape: ellipse(100, 28, 15, 19) },
    { id: "neck", shape: taper(100, 47, 14, 100, 60, 18) },
    ...pair("shoulder", near, (m) => ellipse(m(69), 74, 12, 10)),
    ...pair("forearm", near, (m) => taper(m(59), 128, 12, m(53), 170, 9)),
    ...pair("hand", near, (m) => ellipse(m(52), 180, 6, 9)),
  ];
}

// Front view: player's right on the viewer's left.
export const FRONT_REGIONS: RegionShape[] = [
  ...sharedUpper("r"),
  ...pair("chest", "r", (m) => box(Math.min(m(81), m(99.5)), 63, 18.5, 30, 6)),
  { id: "abdomen", shape: taper(100, 97, 34, 100, 138, 30) },
  ...pair("bicep", "r", (m) => taper(m(64), 86, 15, m(60), 124, 12)),
  ...pair("hip_flexor", "r", (m) => taper(m(90), 142, 18, m(88), 159, 16)),
  ...pair("quad", "r", (m) => taper(m(85), 164, 19, m(88), 232, 13)),
  ...pair("groin", "r", (m) => taper(m(97.5), 163, 5, m(97.5), 198, 3)),
  ...pair("knee", "r", (m) => ellipse(m(88), 241, 8, 8)),
  ...pair("shin", "r", (m) => taper(m(88), 252, 13, m(88), 316, 8)),
  ...pair("ankle", "r", (m) => ellipse(m(88), 324, 5.5, 4.5)),
  ...pair("foot", "r", (m) => ellipse(m(85), 337, 8, 6)),
];

// Back view: player's left on the viewer's left.
export const BACK_REGIONS: RegionShape[] = [
  ...sharedUpper("l"),
  { id: "upper_back", shape: box(81, 62, 38, 33, 8) },
  { id: "lower_back", shape: taper(100, 99, 34, 100, 136, 30) },
  ...pair("tricep", "l", (m) => taper(m(64), 86, 15, m(60), 124, 12)),
  ...pair("glute", "l", (m) => ellipse(m(90), 152, 10.5, 13)),
  ...pair("hamstring", "l", (m) => taper(m(88), 168, 20, m(89), 233, 13)),
  ...pair("knee", "l", (m) => ellipse(m(89), 241, 7, 6)),
  ...pair("calf", "l", (m) => taper(m(89), 250, 15, m(89), 300, 9)),
  ...pair("achilles", "l", (m) => taper(m(89), 303, 6, m(89), 323, 5)),
  ...pair("foot", "l", (m) => ellipse(m(89), 334, 7, 6)),
];

const BASE_LABELS: Record<string, string> = {
  head: "Head",
  neck: "Neck",
  upper_back: "Upper Back",
  lower_back: "Lower Back",
  abdomen: "Abs / Core",
  shoulder: "Shoulder",
  chest: "Chest",
  bicep: "Bicep",
  tricep: "Tricep",
  forearm: "Forearm / Wrist",
  hand: "Hand",
  hip_flexor: "Hip Flexor",
  groin: "Groin / Adductor",
  glute: "Glute",
  quad: "Quad",
  hamstring: "Hamstring",
  knee: "Knee",
  shin: "Shin",
  calf: "Calf",
  ankle: "Ankle",
  achilles: "Achilles",
  foot: "Foot",
};

export function regionLabel(id: string): string {
  const match = id.match(/^(.*)_(l|r)$/);
  if (match && BASE_LABELS[match[1]]) return `${match[2] === "l" ? "Left" : "Right"} ${BASE_LABELS[match[1]]}`;
  return BASE_LABELS[id] ?? id;
}

export const SEVERITY_ORDER: Severity[] = ["light", "moderate", "severe"];

export const SEVERITY_STYLE: Record<Severity, { label: string; color: string; chip: string }> = {
  light: { label: "Light", color: "#f2b705", chip: "border-gold/50 bg-gold/15 text-gold" },
  moderate: { label: "Moderate", color: "#fb923c", chip: "border-orange-400/50 bg-orange-400/15 text-orange-300" },
  severe: { label: "Severe", color: "#ff3f5e", chip: "border-owl-red-light/50 bg-owl-red/20 text-owl-red-light" },
};
