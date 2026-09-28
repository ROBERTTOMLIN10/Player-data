import { useMemo } from "react";
import { useSchedule } from "../api/client";

/** X-axis tick for game dates: the date, with the opponent's logo underneath when there is one. */
export function DateLogoTick({ x, y, payload, xFormatter, logoFor }: {
  x?: number;
  y?: number;
  payload?: { value: string };
  xFormatter: (v: string) => string;
  logoFor: (v: string) => string | null | undefined;
}) {
  const value = payload?.value ?? "";
  const logo = logoFor(value);
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text dy={12} textAnchor="middle" fill="#9aa0ab" fontSize={11}>
        {xFormatter(value)}
      </text>
      {logo && <image href={logo} x={-9} y={18} width={18} height={18} preserveAspectRatio="xMidYMid meet" />}
    </g>
  );
}

/** Height to give an x-axis that uses DateLogoTick. */
export const DATE_LOGO_AXIS_HEIGHT = 44;

/** Opponent logo by game date (from the schedule), for DateLogoTick. */
export function useOpponentLogos(): (date: string) => string | null | undefined {
  const { data: schedule } = useSchedule();
  const byDate = useMemo(() => new Map((schedule ?? []).map((g) => [g.game_date, g.opponent_logo_url])), [schedule]);
  return (date: string) => byDate.get(date);
}

/** Opponent name by game date (from the schedule), e.g. for tooltip headings on day-by-day charts. */
export function useOpponentNames(): (date: string) => string | undefined {
  const { data: schedule } = useSchedule();
  const byDate = useMemo(() => new Map((schedule ?? []).map((g) => [g.game_date, g.opponent])), [schedule]);
  return (date: string) => byDate.get(date);
}
