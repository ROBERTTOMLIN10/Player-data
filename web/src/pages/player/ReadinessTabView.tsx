import { useSearchParams } from "react-router-dom";
import { Segmented } from "../../components/SeasonStats";
import type { Me } from "../../types";
import CheckInView from "./CheckInView";
import MyHistoryView from "./MyHistoryView";

type View = "checkin" | "history";
const VIEWS: { key: View; label: string }[] = [
  { key: "checkin", label: "Check-in" },
  { key: "history", label: "History" },
];

/**
 * The player's Readiness tab: today's check-in (the default, where the morning
 * reminder lands) with a switch at the top to their past check-ins. The choice
 * lives in the URL (?view=history) so a link can open either side.
 */
export default function ReadinessTabView({ me }: { me: Me }) {
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "history" ? "history" : "checkin";
  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto flex w-full max-w-3xl justify-center">
        <Segmented
          value={view}
          options={VIEWS}
          onChange={(v) => setParams(v === "history" ? { view: "history" } : {}, { replace: true })}
          label="Readiness"
        />
      </div>
      {view === "history" ? <MyHistoryView /> : <CheckInView me={me} />}
    </div>
  );
}
