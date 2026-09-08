import { NavLink, Route, Routes } from "react-router-dom";
import TeamView from "./pages/TeamView";
import PlayerView from "./pages/PlayerView";
import CompareView from "./pages/CompareView";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-2 py-2 text-xs font-medium tracking-wide uppercase transition-colors sm:px-3 sm:text-sm ${
    isActive ? "text-owl-red border-b-2 border-owl-red" : "text-text-dim hover:text-text border-b-2 border-transparent"
  }`;

export default function App() {
  return (
    <div className="min-h-screen bg-ink text-text">
      <header className="sticky top-0 z-30 border-b border-border bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-owl-red font-display text-sm font-bold text-white">
              FAU
            </div>
            <div className="whitespace-nowrap font-display text-base font-semibold leading-tight sm:text-lg">
              Men&rsquo;s Soccer <span className="hidden text-text-dim font-normal sm:inline">/ Performance</span>
            </div>
          </div>
          <nav className="-mx-1 flex gap-1 sm:mx-0 sm:gap-2">
            <NavLink to="/" end className={navLinkClass}>
              Team
            </NavLink>
            <NavLink to="/players" className={navLinkClass}>
              Players
            </NavLink>
            <NavLink to="/compare" className={navLinkClass}>
              Compare
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Routes>
          <Route path="/" element={<TeamView />} />
          <Route path="/players" element={<PlayerView />} />
          <Route path="/players/:playerId" element={<PlayerView />} />
          <Route path="/compare" element={<CompareView />} />
        </Routes>
      </main>
    </div>
  );
}
