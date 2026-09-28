import { useSearchParams } from "react-router-dom";
import { Segmented } from "../../components/SeasonStats";
import type { Me } from "../../types";
import CheckInView from "./CheckInView";
import MyHistoryView from "./MyHistoryView";
import MyRpeView from "./MyRpeView";

type View = "checkin" | "history" | "rpe";
const VIEWS: { key: View; label: string }[] = [
  { key: "checkin", label: "Check-in" },
  { key: "history", label: "History" },
  { key: "rpe", label: "RPE" },
];

/**
 * The player's Readiness tab: today's check-in (the default, where the morning
 * reminder lands) with a switch at the top to their past check-ins and their
 * post-training RPE. The choice lives in the URL (?view=history / ?view=rpe)
 * so a link can open any of them.
 */
export default function ReadinessTabView({ me }: { me: Me }) {
  const [params, setParams] = useSearchParams();
  const view: View = VIEWS.find((v) => v.key === params.get("view"))?.key ?? "checkin";
  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto flex w-full max-w-3xl justify-center">
        <Segmented
          value={view}
          options={VIEWS}
          onChange={(v) => setParams(v === "checkin" ? {} : { view: v }, { replace: true })}
          label="Readiness"
        />
      </div>
      {view === "history" ? <MyHistoryView /> : view === "rpe" ? <MyRpeView /> : <CheckInView me={me} />}
    </div>
  );
}
