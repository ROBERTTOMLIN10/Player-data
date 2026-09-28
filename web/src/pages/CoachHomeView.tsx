import { useSearchParams } from "react-router-dom";
import { Segmented } from "../components/SeasonStats";
import HomeView from "./HomeView";
import TeamStatsView from "./TeamStatsView";

type View = "home" | "stats";
const VIEWS: { key: View; label: string }[] = [
  { key: "home", label: "Schedule & Results" },
  { key: "stats", label: "Team Stats" },
];

/**
 * The coaches' Home tab: the schedule and results (default) with a switch at
 * the top to the team's season stats. The choice lives in the URL (?view=stats)
 * so a link can open either side.
 */
export default function CoachHomeView() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "stats" ? "stats" : "home";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-center">
        <Segmented
          value={view}
          options={VIEWS}
          onChange={(v) => setParams(v === "stats" ? { view: "stats" } : {}, { replace: true })}
          label="Home"
        />
      </div>
      {view === "stats" ? <TeamStatsView /> : <HomeView />}
    </div>
  );
}
