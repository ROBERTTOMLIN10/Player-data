import type { GpsSession } from "../types";

/** Warning tag on a GPS session that needs checking (see server/src/lib/sessionFlags.ts). */
export function SessionFlagTag({ s }: { s: Pick<GpsSession, "flag"> }) {
  if (!s.flag) return null;
  const glitch = s.flag.kind === "glitch";
  return (
    <span
      title={s.flag.reason}
      className={`ml-1.5 inline-block cursor-help rounded px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide ${
        glitch ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
      }`}
    >
      {glitch ? "Tracker glitch" : "Check spike"}
    </span>
  );
}

/** Glitched sessions shouldn't draw on trend charts: blank their metrics. */
export function hideGlitches<T extends Pick<GpsSession, "flag">>(s: T, keys: string[]): T {
  if (s.flag?.kind !== "glitch") return s;
  return { ...s, ...Object.fromEntries(keys.map((k) => [k, null])) };
}
