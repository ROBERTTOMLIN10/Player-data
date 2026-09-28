import { useParams, useSearchParams } from "react-router-dom";
import { Segmented } from "../components/SeasonStats";
import CompareView from "./CompareView";
import PlayerView from "./PlayerView";

type View = "players" | "compare";
const VIEWS: { key: View; label: string }[] = [
  { key: "players", label: "Players" },
  { key: "compare", label: "Compare" },
];

/**
 * The coaches' Players tab: the squad list (default) with a switch at the top
 * to Compare. The choice lives in the URL (?view=compare). A player's own page
 * (/players/:id) shows without the switch.
 */
export default function PlayersTabView() {
  const { playerId } = useParams();
  const [params, setParams] = useSearchParams();
  if (playerId) return <PlayerView />;
  const view: View = params.get("view") === "compare" ? "compare" : "players";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-center">
        <Segmented
          value={view}
          options={VIEWS}
          onChange={(v) => setParams(v === "compare" ? { view: "compare" } : {}, { replace: true })}
          label="Players"
        />
      </div>
      {view === "compare" ? <CompareView /> : <PlayerView />}
    </div>
  );
}
