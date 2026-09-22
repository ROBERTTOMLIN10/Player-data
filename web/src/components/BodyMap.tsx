import type { KeyboardEvent } from "react";
import { BACK_REGIONS, FRONT_REGIONS, regionLabel, SEVERITY_ORDER, SEVERITY_STYLE, type RegionShape } from "../lib/bodyRegions";
import type { Severity } from "../types";

const BASE_FILL = "#2a2e37";
const BASE_STROKE = "#3b404b";

/**
 * Front + back body figures. Each region is filled by its severity (if any).
 * Pass onRegionClick to make it interactive (player check-in); omit it for a
 * read-only view (coach heatmap / history). `titles` overrides hover text.
 */
export function BodyMap({
  severities,
  onRegionClick,
  activeRegion,
  titles,
  className = "",
}: {
  severities: Record<string, Severity | undefined>;
  onRegionClick?: (region: string) => void;
  activeRegion?: string | null;
  titles?: Record<string, string>;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <Figure
        label="Front"
        leftLabel="R"
        rightLabel="L"
        regions={FRONT_REGIONS}
        severities={severities}
        onRegionClick={onRegionClick}
        activeRegion={activeRegion}
        titles={titles}
      />
      <Figure
        label="Back"
        leftLabel="L"
        rightLabel="R"
        regions={BACK_REGIONS}
        severities={severities}
        onRegionClick={onRegionClick}
        activeRegion={activeRegion}
        titles={titles}
      />
    </div>
  );
}

function Figure({
  label,
  leftLabel,
  rightLabel,
  regions,
  severities,
  onRegionClick,
  activeRegion,
  titles,
}: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  regions: RegionShape[];
  severities: Record<string, Severity | undefined>;
  onRegionClick?: (region: string) => void;
  activeRegion?: string | null;
  titles?: Record<string, string>;
}) {
  const interactive = Boolean(onRegionClick);
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 200 350" className="w-full max-w-[220px] select-none" role="group" aria-label={`${label} of body`}>
        <text x="16" y="20" fill="#9aa0ab" fontSize="12" fontWeight="600">
          {leftLabel}
        </text>
        <text x="184" y="20" fill="#9aa0ab" fontSize="12" fontWeight="600" textAnchor="end">
          {rightLabel}
        </text>
        {regions.map(({ id, shape }) => {
          const severity = severities[id];
          const fill = severity ? SEVERITY_STYLE[severity].color : BASE_FILL;
          const isActive = activeRegion === id;
          const title = titles?.[id] ?? (severity ? `${regionLabel(id)} — ${SEVERITY_STYLE[severity].label}` : regionLabel(id));
          const common = {
            fill,
            fillOpacity: severity ? 0.9 : 1,
            stroke: isActive ? "#ffffff" : severity ? fill : BASE_STROKE,
            strokeWidth: isActive ? 2 : 1,
            className: interactive ? "body-region" : undefined,
            onClick: interactive ? () => onRegionClick!(id) : undefined,
            onKeyDown: interactive
              ? (e: KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRegionClick!(id);
                  }
                }
              : undefined,
            role: interactive ? "button" : undefined,
            tabIndex: interactive ? 0 : undefined,
            "aria-label": title,
            "aria-pressed": interactive ? Boolean(severity) : undefined,
          };
          return shape.kind === "ellipse" ? (
            <ellipse key={id} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...common}>
              <title>{title}</title>
            </ellipse>
          ) : (
            <path key={id} d={shape.d} strokeLinejoin="round" {...common}>
              <title>{title}</title>
            </path>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-xs uppercase tracking-wide text-text-dim">{label}</figcaption>
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
