import { useSearchParams } from "react-router-dom";
import { useMyProfile } from "../../api/client";
import { PlayerProfileHeader } from "../../components/PlayerProfileHeader";
import { Segmented } from "../../components/SeasonStats";
import type { Me } from "../../types";
import CheckInView from "./CheckInView";
import MyHistoryView from "./MyHistoryView";
import MyRpeView from "./MyRpeView";
import { AthleticTrainingPanel, useAtNeedsAnswer } from "../../components/AthleticTraining";

type View = "checkin" | "history" | "rpe" | "athletic-training";
const VIEWS: { key: View; label: string }[] = [
  { key: "checkin", label: "Check-in" },
  { key: "history", label: "History" },
  { key: "rpe", label: "RPE" },
  { key: "athletic-training", label: "Athletic training" },
];

/**
 * The player's Readiness tab: today's check-in (the default, where the morning
 * reminder lands) with a switch at the top to their past check-ins and their
 * post-training RPE, and Athletic training (play status, appointments and messages
 * with the AT). The choice lives in the URL (?view=history / ?view=rpe /
 * ?view=athletic-training) so a link or notification can open any of them.
 */
export default function ReadinessTabView({ me }: { me: Me }) {
  const [params, setParams] = useSearchParams();
  const view: View = VIEWS.find((v) => v.key === params.get("view"))?.key ?? "checkin";
  const { data: profile } = useMyProfile();
  const atNeedsAnswer = useAtNeedsAnswer();
  return (
    <div className="flex flex-col gap-5">
      {profile && (
        <div className="mx-auto w-full max-w-3xl">
          <PlayerProfileHeader
            name={profile.player.canonical_name}
            jersey={profile.player.jersey_number}
            profile={profile.profile}
            subtitle={`${profile.seasonTotals.games_played ?? 0} games played · ${profile.sessions.length} tracked sessions this season`}
          />
        </div>
      )}
      <div className="mx-auto flex w-full max-w-3xl justify-center">
        <Segmented
          value={view}
          options={VIEWS.map((v) => (v.key === "athletic-training" ? { ...v, dot: atNeedsAnswer } : v))}
          onChange={(v) => setParams(v === "checkin" ? {} : { view: v }, { replace: true })}
          label="Readiness"
        />
      </div>
      {view === "history" ? (
        <MyHistoryView />
      ) : view === "rpe" ? (
        <MyRpeView />
      ) : view === "athletic-training" ? (
        <div className="mx-auto w-full max-w-3xl">
          <AthleticTrainingPanel />
        </div>
      ) : (
        <CheckInView me={me} />
      )}
    </div>
  );
}
