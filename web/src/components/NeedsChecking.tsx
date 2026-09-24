import { useNavigate } from "react-router-dom";
import { Card, SectionHeading } from "./Card";
import { formatDate } from "../lib/format";
import type { FlaggedSession } from "../types";

/** Coaches: GPS sessions with a tracker glitch or a big spike, to check and re-upload. */
export function NeedsChecking({ sessions }: { sessions: FlaggedSession[] }) {
  const navigate = useNavigate();
  if (!sessions.length) return null;
  return (
    <section>
      <SectionHeading
        title="GPS Needs Checking"
        subtitle="Readings that look wrong. Fix the export in Titan and upload it again with the same file name, then choose Replace."
      />
      <Card className="flex flex-col divide-y divide-border/60 p-0">
        {sessions.map((s) => {
          const glitch = s.flag.kind === "glitch";
          return (
            <button
              key={s.id}
              onClick={() => navigate(`/players/${s.player_id}`)}
              className="flex flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-surface-raised sm:flex-row sm:items-start sm:gap-4"
            >
              <span
                className={`w-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  glitch ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {glitch ? "Tracker glitch" : "Check spike"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{s.player_name}</span>
                <span className="text-text-dim">
                  {" "}
                  · {s.opponent ?? "Game"} · {formatDate(s.game_date)} · file “{s.source_file}”
                </span>
                <span className="mt-0.5 block text-xs text-text-dim">{s.flag.reason}</span>
              </span>
            </button>
          );
        })}
      </Card>
    </section>
  );
}
