import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatMetricValue } from "../lib/format";
import type { MetricDef } from "../types";

/**
 * One bar per tracked game for the chosen stat, with the team average as a
 * line. Full bars: games the player got minutes; faded bars: fitness-only
 * sessions (warm-up / fitness, no minutes). Tracker glitches draw no bar.
 * Tapping a bar picks that game.
 */
export interface GameBar {
  game_id: number;
  game_date: string;
  opponent: string | null;
  value: number | null;
  team: number | null;
  played: boolean;
  glitch: boolean;
  minutes: number | null;
}

const YOU = "#ff3f5e"; // --color-owl-red-light
const TEAM = "#9aa0ab"; // neutral reference line (--color-text-dim)
const GRID = "#2a2e37"; // --color-border

export function GameByGameChart({
  data,
  metric,
  selectedGameId,
  onSelectGame,
  showTeam = true,
}: {
  data: GameBar[];
  metric: MetricDef;
  selectedGameId: number | null;
  onSelectGame: (gameId: number) => void;
  showTeam?: boolean;
}) {
  const fmt = (v: number | null | undefined) => formatMetricValue(v ?? null, metric);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-dim">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: YOU }} /> Played
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: YOU, opacity: 0.35 }} /> Fitness only
        </span>
        {showTeam && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: TEAM }} /> Team avg
          </span>
        )}
        <span className="ml-auto">Tap a bar to open that game below</span>
      </div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="game_date"
              tickFormatter={(d: string) => formatDate(d)}
              tick={{ fill: TEAM, fontSize: 11 }}
              axisLine={{ stroke: GRID }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fill: TEAM, fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => formatMetricValue(v, { ...metric, unit: "", decimals: Math.min(metric.decimals, 1) })} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const g = payload[0].payload as GameBar;
                return (
                  <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg">
                    <div className="font-medium text-text">
                      {formatDate(g.game_date)} · {g.opponent ?? "Game"}
                    </div>
                    <div className="mt-1 text-text">
                      You: <span className="font-semibold">{g.glitch ? "tracker glitch" : fmt(g.value)}</span>
                    </div>
                    {showTeam && <div className="text-text-dim">Team avg: {fmt(g.team)}</div>}
                    <div className="text-text-dim">{g.played ? `${g.minutes}' played` : "Fitness only (no minutes)"}</div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              onClick={(d: unknown) => onSelectGame((d as { payload: GameBar }).payload.game_id)}
              className="cursor-pointer"
            >
              {data.map((g) => (
                <Cell
                  key={g.game_id}
                  fill={YOU}
                  fillOpacity={g.played ? 1 : 0.35}
                  stroke={g.game_id === selectedGameId ? "#e9eaee" : "none"}
                  strokeWidth={g.game_id === selectedGameId ? 2 : 0}
                />
              ))}
            </Bar>
            {showTeam && (
              <Line dataKey="team" type="monotone" stroke={TEAM} strokeWidth={2} dot={{ r: 3, fill: TEAM, stroke: TEAM }} activeDot={{ r: 5 }} connectNulls />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
