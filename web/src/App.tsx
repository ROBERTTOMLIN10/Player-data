import type { ReactNode } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { logout, useMe } from "./api/client";
import type { Me } from "./types";
import CoachHomeView from "./pages/CoachHomeView";
import HomeView from "./pages/HomeView";
import NcaaView from "./pages/NcaaView";
import NcaaTeamView from "./pages/NcaaTeamView";
import NcaaPlayerView from "./pages/NcaaPlayerView";
import NcaaGameView from "./pages/NcaaGameView";
import TeamView from "./pages/TeamView";
import PlayersTabView from "./pages/PlayersTabView";
import AdminView from "./pages/AdminView";
import ReadinessView from "./pages/ReadinessView";
import AthleticTrainingView from "./pages/player/AthleticTrainingView";
import { useAtNeedsAnswer } from "./components/AthleticTraining";
import RpeView from "./pages/RpeView";
import LoginView from "./pages/LoginView";
import ReadinessTabView from "./pages/player/ReadinessTabView";
import MyGpsView from "./pages/player/MyGpsView";
import InjuriesView from "./pages/InjuriesView";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 px-2 py-2 text-xs font-medium tracking-wide uppercase transition-colors sm:px-3 sm:text-sm ${
    isActive ? "text-owl-red border-b-2 border-owl-red" : "text-text-dim hover:text-text border-b-2 border-transparent"
  }`;

export default function App() {
  const { data: me, isLoading, error } = useMe();

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-ink text-text-dim">Loading…</div>;
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink px-4 text-center text-text-dim">
        Couldn&rsquo;t reach the server. Check your connection and refresh.
      </div>
    );
  }
  if (!me) return <LoginView />;
  if (me.role === "player") return <PlayerApp me={me} />;
  if (me.role === "trainer") return <TrainerApp me={me} />;
  return <CoachApp me={me} />;
}

function CoachApp({ me }: { me: Me }) {
  return (
    <Shell
      me={me}
      subtitle="Performance"
      nav={
        <>
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/readiness" className={navLinkClass}>
            Readiness
          </NavLink>
          <NavLink to="/rpe" className={navLinkClass}>
            RPE
          </NavLink>
          <NavLink to="/gps" className={navLinkClass}>
            GPS
          </NavLink>
          <NavLink to="/players" className={navLinkClass}>
            Players
          </NavLink>
          <NavLink to="/ncaa" className={navLinkClass}>
            NCAA D1
          </NavLink>
          <NavLink to="/data" className={navLinkClass}>
            Data
          </NavLink>
        </>
      }
    >
      <Routes>
        <Route path="/" element={<CoachHomeView />} />
        <Route path="/readiness" element={<ReadinessView />} />
        <Route path="/rpe" element={<RpeView />} />
        <Route path="/gps" element={<TeamView />} />
        <Route path="/team-stats" element={<Navigate to="/?view=stats" replace />} />
        <Route path="/ncaa" element={<NcaaView />} />
        <Route path="/ncaa/team/:seo" element={<NcaaTeamView />} />
        <Route path="/ncaa/player/:seo/:key" element={<NcaaPlayerView />} />
        <Route path="/ncaa/game/:id" element={<NcaaGameView />} />
        <Route path="/players" element={<PlayersTabView />} />
        <Route path="/players/:playerId" element={<PlayersTabView />} />
        <Route path="/compare" element={<Navigate to="/players?view=compare" replace />} />
        <Route path="/data" element={<AdminView />} />
        <Route path="/injuries" element={<InjuriesView />} />
        <Route path="/injuries/:id" element={<InjuriesView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

/**
 * The athletic trainer's view: Injuries first (who to see before practice: Pre practice, then
 * the recovery tracker), the morning Readiness board (each player's care panel and
 * the live injury report), and RPE trends.
 */
function TrainerApp({ me }: { me: Me }) {
  return (
    <Shell
      me={me}
      subtitle="Athletic Training"
      nav={
        <>
          <NavLink to="/injuries" className={navLinkClass}>
            Injuries
          </NavLink>
          <NavLink to="/readiness" className={navLinkClass}>
            Readiness
          </NavLink>
          <NavLink to="/rpe" className={navLinkClass}>
            RPE
          </NavLink>
        </>
      }
    >
      <Routes>
        <Route path="/" element={<Navigate to="/injuries" replace />} />
        <Route path="/readiness" element={<ReadinessView />} />
        <Route path="/injuries" element={<InjuriesView />} />
        <Route path="/injuries/:id" element={<InjuriesView />} />
        <Route path="/rpe" element={<RpeView trendsOnly />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

function PlayerApp({ me }: { me: Me }) {
  const atNeedsAnswer = useAtNeedsAnswer();
  return (
    <Shell
      me={me}
      subtitle={me.playerName ?? "Player"}
      nav={
        <>
          <NavLink to="/home" className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/" end className={navLinkClass}>
            Readiness
          </NavLink>
          <NavLink to="/athletic-training" className={navLinkClass}>
            <span className="relative">
              Athletic Training
              {atNeedsAnswer && <span className="absolute -right-2 -top-0.5 h-2 w-2 rounded-full bg-gold" aria-label="Needs your answer" />}
            </span>
          </NavLink>
          <NavLink to="/my-gps" className={navLinkClass}>
            My GPS
          </NavLink>
          <NavLink to="/ncaa" className={navLinkClass}>
            NCAA D1
          </NavLink>
        </>
      }
    >
      <Routes>
        <Route path="/athletic-training" element={<AthleticTrainingView />} />
        {/* Readiness (check-in first) stays the landing page: the morning reminder opens straight into it. */}
        <Route path="/" element={<ReadinessTabView me={me} />} />
        <Route path="/home" element={<HomeView />} />
        <Route path="/ncaa" element={<NcaaView />} />
        <Route path="/ncaa/team/:seo" element={<NcaaTeamView />} />
        <Route path="/ncaa/player/:seo/:key" element={<NcaaPlayerView />} />
        <Route path="/ncaa/game/:id" element={<NcaaGameView />} />
        <Route path="/my-gps" element={<MyGpsView />} />
        <Route path="/history" element={<Navigate to="/?view=history" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

function Shell({ me, subtitle, nav, children }: { me: Me; subtitle: string; nav: ReactNode; children: ReactNode }) {
  const queryClient = useQueryClient();
  // In local no-password mode there's nothing to sign out of for coaches.
  const canSignOut = me.authRequired || me.role !== "coach";

  async function handleSignOut() {
    await logout().catch(() => undefined);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <div className="min-h-screen bg-ink text-text">
      <header className="sticky top-0 z-30 border-b border-border bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-owl-red font-display text-sm font-bold text-white">
              FAU
            </div>
            <div className="truncate font-display text-base font-semibold leading-tight sm:text-lg">
              Men&rsquo;s Soccer <span className="hidden text-text-dim font-normal sm:inline">/ {subtitle}</span>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <nav className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto sm:mx-0 sm:gap-2">{nav}</nav>
            {canSignOut && (
              <button
                onClick={handleSignOut}
                title={`Signed in as ${me.email}`}
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-text-dim transition-colors hover:border-owl-red hover:text-text"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
