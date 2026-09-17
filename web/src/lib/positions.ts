export type PositionGroup = "Forwards" | "Midfielders" | "Defenders" | "Goalkeepers" | "Unassigned";

const GROUP_BY_CODE: Record<string, PositionGroup> = {
  fwd: "Forwards",
  mid: "Midfielders",
  def: "Defenders",
  gk: "Goalkeepers",
};

// Display order for grouped position sections.
export const POSITION_GROUP_ORDER: PositionGroup[] = ["Forwards", "Midfielders", "Defenders", "Goalkeepers", "Unassigned"];

/**
 * Maps a raw Sidearm position code (e.g. "fwd", "mid", "def", "gk") to a
 * display group. Players with no recorded position yet (no synced box score
 * stats) fall into "Unassigned" rather than being hidden.
 */
export function positionGroup(position: string | null | undefined): PositionGroup {
  if (!position) return "Unassigned";
  return GROUP_BY_CODE[position.toLowerCase()] ?? "Unassigned";
}
