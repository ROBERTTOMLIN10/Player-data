import type { Severity } from "../types";

/**
 * Geometry + labels for the interactive body map. Region ids must stay in sync
 * with server/src/lib/bodyRegions.ts. Paired regions use _l / _r for the
 * PLAYER's own left/right.
 *
 * Drawn in a 200 x 400 viewBox. Paired muscles are drawn once on the viewer's
 * left half and mirrored across x = 100 for the other side. On the front view
 * the viewer's left is the player's RIGHT; on the back view it's their LEFT.
 */
export interface RegionShape {
  id: string;
  d: string;
  mirrored: boolean; // true = drawn via the x = 100 mirror transform
}

export interface BodyView {
  regions: RegionShape[];
  details: string[]; // decorative definition lines (non-interactive)
}

type Part = [base: string, d: string];

// ---- Front view -------------------------------------------------------------

const FRONT_CENTER: Part[] = [
  ["head", "M100,8 C114,8 119,20 118,32 C117,44 110,52 100,52 C90,52 83,44 82,32 C81,20 86,8 100,8 Z"],
  ["neck", "M91,51 C95,55 105,55 109,51 L111,63 C106,67 94,67 89,63 Z"],
  ["abs_upper", "M87,115 C93,118 107,118 113,115 L113,150 C107,152 93,152 87,150 Z"],
  ["abs_lower", "M87,153 C93,155 107,155 113,153 L112.5,178 C110,190 104,198 100,201 C96,198 90,190 87.5,178 Z"],
];

const FRONT_PAIRED: Part[] = [
  ["trap", "M89,59 C86,65 76,69 65,72 C71,75 80,76 87,75 C90,72 92,69 93,66 Z"],
  ["delt_front", "M63,74 C53,75 45,83 44,96 C44,104 45,109 47,113 C51,105 56,98 61,93 C65,88 69,82 71,78 Z"],
  ["chest", "M73,78 C81,76 92,76 98,78.5 L98,112 C90,116 77,114 67,108 C63,104 62,99 63.5,95 C66,89 69,83 73,78 Z"],
  ["bicep", "M47,117 C51,109 57,101 62,97 C64.5,109 63,125 59,140 C56,148 51,152 46,152 C42,146 42,131 47,117 Z"],
  ["forearm", "M44,156 C50,156 56,152 58.5,146 C58.5,162 52.5,188 44.5,212 L36,212 C35,196 37,172 44,156 Z"],
  ["hand", "M35.5,215 L45,215 C47,224 46,236 42,244 C38,246 33,242 32,236 C31,228 33,220 35.5,215 Z"],
  ["oblique", "M67,111 C74,116 80,118 84.5,117 L84.5,178 C80.5,186 75,188 71,184 C69,170 67.5,150 65,134 C64,124 64.5,116 67,111 Z"],
  ["hip_flexor", "M71.5,188 C77,190.5 82.5,186.5 85.5,182 C88.5,192 93.5,199 97,203.5 C90,205.5 80,203.5 72.5,199.5 C71,196 70.5,191.5 71.5,188 Z"],
  ["groin", "M98.5,206 C100,216 99,230 96.5,242 C94,252 91,258 89,262 C88.5,244 88,226 88.5,210 C92,208 95,207 98.5,206 Z"],
  ["quad_outer", "M62,204 C57,222 56,244 59,264 C61,276 66,284 71,286 C70,264 70,236 72,212 C69,207 65,205 62,204 Z"],
  ["quad_front", "M74,206 C80,205 85,208 86,214 C88,236 86,258 82,278 C80,283 76,283 74,279 C72,258 72,232 74,206 Z"],
  ["quad_inner", "M89,250 C94,256 96,266 94,277 C92,285 86,288 83,284 C85,272 87,261 89,250 Z"],
  ["knee", "M70,288 C75,286 86,286 92,288 C94,296 92,304 86,307 C79,307 72,303 70,296 Z"],
  ["shin", "M75,310 C78,308.5 82,308.5 85,310 C85,330 84,350 83,366 L78,366 C76,346 74.5,328 75,310 Z"],
  ["calf_inner", "M87,310 C94,314 97,328 95,342 C93,352 90,358 87,362 C87,344 87,327 87,310 Z"],
  ["calf_outer", "M71,311 C66,322 65,336 68,350 C70,356 73,360 75,362 C74,344 73,326 73,311 Z"],
  ["ankle", "M76.5,368 L86,368 C88,371.5 88,375 86,378 L76.5,378 C74.5,375 74.5,371.5 76.5,368 Z"],
  ["foot", "M75.5,380 L87,380 C90,385 90,390 86.5,393 C80.5,395 70.5,394 66.5,391 C66.5,386 70.5,382.5 75.5,380 Z"],
];

const FRONT_DETAILS = [
  // six-pack + linea alba
  "M100,117 L100,198",
  "M88,127 C94,129 106,129 112,127",
  "M88,139 C94,141 106,141 112,139",
  "M88,165 C94,167 106,167 112,165",
  // lower pec line, knee cap
  "M68,104 C78,110 90,111 98,108",
  "M132,104 C122,110 110,111 102,108",
];

// ---- Back view --------------------------------------------------------------

const BACK_CENTER: Part[] = [
  ["head", "M100,8 C114,8 119,20 118,32 C117,44 110,52 100,52 C90,52 83,44 82,32 C81,20 86,8 100,8 Z"],
  ["neck", "M91,50 L109,50 L110,58 C106,61 94,61 90,58 Z"],
];

const BACK_PAIRED: Part[] = [
  ["trap", "M98.5,56 C96,62 84,69 65,73.5 C74,78 83,84 89,92 C92,95 95.5,97 98.5,99 Z"],
  ["delt_rear", "M63,75 C53,76 45,84 44,97 C44.5,105 46,110 48,114 C54,104 60,96 66,90 C69,86 71,81 71.5,79 Z"],
  ["upper_back", "M98.5,101 L98.5,136 C92,134 86,128 83,120 C84,110 87,102 90,96 C93,98 96,100 98.5,101 Z"],
  ["lat", "M67,94 C72,98 78,104 80.5,112 C81.5,122 85,131 91,137 C94,139.5 96.5,141 98.5,141.5 L98.5,148 C90,153 80.5,166 74.5,177 C70,161 66.5,141 64.5,121 C64,110 64.5,100 67,94 Z"],
  ["lower_back", "M98.5,151 L98.5,197 C94,198 90,196 87,192 C85.5,180 85.5,166 88,158 C92,154.5 95,152.5 98.5,151 Z"],
  ["tricep", "M47.5,117 C52,107 58,99 64,95 C66,109 64,126 60,140 C57,148 52,152 46,152 C42,146 42,131 47.5,117 Z"],
  ["forearm", "M44,156 C50,156 56,152 58.5,146 C58.5,162 52.5,188 44.5,212 L36,212 C35,196 37,172 44,156 Z"],
  ["hand", "M35.5,215 L45,215 C47,224 46,236 42,244 C38,246 33,242 32,236 C31,228 33,220 35.5,215 Z"],
  ["glute_med", "M73,181 C78,184 82,187 85,192 C82,198 77,201.5 70.5,203 C67,196 68,188 73,181 Z"],
  ["glute", "M68,204 C78,201 90,199 98.5,199 L98.5,238 C92,245 78,246 68,240 C61,231 61,213 68,204 Z"],
  ["hamstring_outer", "M63,244 C70,249 77,249 81,247 C81,265 79,281 77,293 C72,293 67,288 65,281 C61,269 61,256 63,244 Z"],
  ["hamstring_inner", "M83.5,247 C90,247 96,245 98.5,243 C98.5,259 96.5,276 93,293 C89,295 84,295 81.5,293 C83,279 83.5,263 83.5,247 Z"],
  ["calf_outer", "M68,302 C73,299 80,299 82.5,301 C82.5,320 80.5,337 78,348 C72,346 67,337 65.5,326 C65,316 66,308 68,302 Z"],
  ["calf_inner", "M84.5,301 C89,299 95,301 97.5,306 C100,319 97.5,335 91,349 C87,349 84.5,345 84.5,340 C84.5,328 84.5,314 84.5,301 Z"],
  ["achilles", "M78.5,351 C81,349.5 86,349.5 88,351 L87,371 L79.5,371 Z"],
  ["foot", "M77.5,373 L89,373 C91,380 90,388 86.5,391 L80.5,391 C76.5,388 75.5,380 77.5,373 Z"],
];

const BACK_DETAILS = [
  // spine
  "M100,58 L100,198",
  // back-of-knee crease
  "M70,295 C76,297 90,297 96,295",
  "M130,295 C124,297 110,297 104,295",
];

function buildView(center: Part[], paired: Part[], nearSide: "l" | "r"): RegionShape[] {
  const farSide = nearSide === "l" ? "r" : "l";
  return [
    ...center.map(([id, d]) => ({ id, d, mirrored: false })),
    ...paired.flatMap(([base, d]) => [
      { id: `${base}_${nearSide}`, d, mirrored: false },
      { id: `${base}_${farSide}`, d, mirrored: true },
    ]),
  ];
}

export const FRONT_VIEW: BodyView = { regions: buildView(FRONT_CENTER, FRONT_PAIRED, "r"), details: FRONT_DETAILS };
export const BACK_VIEW: BodyView = { regions: buildView(BACK_CENTER, BACK_PAIRED, "l"), details: BACK_DETAILS };

export const MIRROR_TRANSFORM = "matrix(-1 0 0 1 200 0)";

const BASE_LABELS: Record<string, string> = {
  head: "Head",
  neck: "Neck",
  abs_upper: "Upper Abs",
  abs_lower: "Lower Abs",
  trap: "Trap",
  delt_front: "Front Shoulder",
  delt_rear: "Rear Shoulder",
  chest: "Chest",
  bicep: "Bicep",
  tricep: "Tricep",
  forearm: "Forearm / Wrist",
  hand: "Hand",
  oblique: "Oblique",
  upper_back: "Upper Back",
  lat: "Lat",
  lower_back: "Lower Back",
  hip_flexor: "Hip Flexor",
  groin: "Groin / Adductor",
  glute_med: "Outer Hip (Glute Med)",
  glute: "Glute",
  quad_outer: "Outer Quad",
  quad_front: "Middle Quad",
  quad_inner: "Inner Quad (VMO)",
  hamstring_outer: "Outer Hamstring",
  hamstring_inner: "Inner Hamstring",
  knee: "Knee",
  shin: "Shin",
  calf_outer: "Outer Calf",
  calf_inner: "Inner Calf",
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
