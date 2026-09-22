import { useState, type KeyboardEvent } from "react";
import {
  BACK_VIEW,
  FRONT_VIEW,
  MIRROR_TRANSFORM,
  regionLabel,
  SEVERITY_ORDER,
  SEVERITY_STYLE,
  type BodyView,
} from "../lib/bodyRegions";
import type { Severity } from "../types";

const MUSCLE_FILL = "#353b47";
// Gaps between muscles are drawn in the card background colour, which reads
// as muscle definition lines.
const GAP_COLOR = "#15171c";

type Side = "front" | "back";

const VIEWS: Record<Side, { view: BodyView; label: string; leftLabel: string; rightLabel: string }> = {
  front: { view: FRONT_VIEW, label: "Front", leftLabel: "R", rightLabel: "L" },
  back: { view: BACK_VIEW, label: "Back", leftLabel: "L", rightLabel: "R" },
};

const idsOn = (side: Side) => new Set(VIEWS[side].view.regions.map((r) => r.id));
const FRONT_IDS = idsOn("front");
const BACK_IDS = idsOn("back");

/**
 * Muscular front + back body figures, each muscle filled by its severity.
 * - layout "toggle": one large figure with a Front/Back switch, for tapping
 *   precise muscles on a phone (player check-in).
 * - layout "side": both figures side by side, read-only summaries.
 * Pass onRegionClick to make muscles tappable. `titles` overrides hover text.
 */
export function BodyMap({
  severities,
  onRegionClick,
  activeRegion,
  titles,
  layout = "side",
  className = "",
}: {
  severities: Record<string, Severity | undefined>;
  onRegionClick?: (region: string) => void;
  activeRegion?: string | null;
  titles?: Record<string, string>;
  layout?: "side" | "toggle";
  className?: string;
}) {
  const [side, setSide] = useState<Side>("front");
  const props = { severities, onRegionClick, activeRegion, titles };

  if (layout === "toggle") {
    const count = (ids: Set<string>) => Object.keys(severities).filter((id) => severities[id] && ids.has(id)).length;
    const counts: Record<Side, number> = { front: count(FRONT_IDS), back: count(BACK_IDS) };
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <div className="flex w-full max-w-xs gap-1 rounded-lg border border-border bg-surface-raised p-1" role="tablist">
          {(["front", "back"] as Side[]).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={side === s}
              onClick={() => setSide(s)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
                side === s ? "bg-owl-red text-white" : "text-text-dim hover:text-text"
              }`}
            >
              {VIEWS[s].label}
              {counts[s] > 0 && (
                <span className={`rounded-full px-1.5 text-[11px] ${side === s ? "bg-white/25" : "bg-owl-red/25 text-owl-red-light"}`}>
                  {counts[s]}
                </span>
              )}
            </button>
          ))}
        </div>
        <Figure side={side} {...props} className="max-w-[320px]" />
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <Figure side="front" {...props} showCaption />
      <Figure side="back" {...props} showCaption />
    </div>
  );
}

function Figure({
  side,
  severities,
  onRegionClick,
  activeRegion,
  titles,
  showCaption = false,
  className = "max-w-[220px]",
}: {
  side: Side;
  severities: Record<string, Severity | undefined>;
  onRegionClick?: (region: string) => void;
  activeRegion?: string | null;
  titles?: Record<string, string>;
  showCaption?: boolean;
  className?: string;
}) {
  const { view, label, leftLabel, rightLabel } = VIEWS[side];
  const interactive = Boolean(onRegionClick);
  const active = activeRegion ? view.regions.filter((r) => r.id === activeRegion) : [];

  return (
    <figure className="flex w-full flex-col items-center">
      <svg viewBox="0 0 200 400" className={`w-full select-none ${className}`} role="group" aria-label={`${label} of body`}>
        <text x="14" y="22" fill="#9aa0ab" fontSize="13" fontWeight="600">
          {leftLabel}
        </text>
        <text x="186" y="22" fill="#9aa0ab" fontSize="13" fontWeight="600" textAnchor="end">
          {rightLabel}
        </text>
        {view.regions.map(({ id, d, mirrored }) => {
          const severity = severities[id];
          const title = titles?.[id] ?? (severity ? `${regionLabel(id)}: ${SEVERITY_STYLE[severity].label}` : regionLabel(id));
          return (
            <path
              key={`${id}-${mirrored}`}
              d={d}
              transform={mirrored ? MIRROR_TRANSFORM : undefined}
              fill={severity ? SEVERITY_STYLE[severity].color : MUSCLE_FILL}
              stroke={GAP_COLOR}
              strokeWidth={1.2}
              strokeLinejoin="round"
              className={interactive ? "body-region" : undefined}
              onClick={interactive ? () => onRegionClick!(id) : undefined}
              onKeyDown={
                interactive
                  ? (e: KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRegionClick!(id);
                      }
                    }
                  : undefined
              }
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={title}
              aria-pressed={interactive ? Boolean(severity) : undefined}
            >
              <title>{title}</title>
            </path>
          );
        })}
        <g pointerEvents="none" fill="none" stroke={GAP_COLOR} strokeWidth={1} strokeLinecap="round">
          {view.details.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {/* Outline the muscle being edited on top of everything else. */}
        <g pointerEvents="none" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinejoin="round">
          {active.map(({ id, d, mirrored }) => (
            <path key={`${id}-${mirrored}`} d={d} transform={mirrored ? MIRROR_TRANSFORM : undefined} />
          ))}
        </g>
      </svg>
      {showCaption && <figcaption className="mt-1 text-xs uppercase tracking-wide text-text-dim">{label}</figcaption>}
    </figure>
  );
}

export function SeverityLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-text-dim">
      {SEVERITY_ORDER.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEVERITY_STYLE[s].color }} />
          {SEVERITY_STYLE[s].label}
        </span>
      ))}
    </div>
  );
}
