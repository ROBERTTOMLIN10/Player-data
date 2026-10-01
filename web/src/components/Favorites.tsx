import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { saveFollow, useFollows, useNcaaStandings } from "../api/client";
import { enablePush, getPushState, isIos, isStandalone, type PushState } from "../lib/pwa";
import type { AlertKind, AlertSettings, FollowsResponse } from "../types";
import { Card } from "./Card";
import { Rpi, TeamLink } from "./ncaa";
import { TeamLogo } from "./TeamLogo";

const ALERTS: { key: AlertKind; label: string }[] = [
  { key: "kickoff", label: "Kick-off" },
  { key: "goals", label: "Goals" },
  { key: "halftime", label: "Half-time" },
  { key: "final", label: "Final" },
  { key: "red_cards", label: "Red cards" },
];
const NEW_STAR: AlertSettings = { kickoff: false, goals: true, halftime: false, final: true, red_cards: false };

/** Star/unstar (or change alerts) with the change shown straight away. */
function useFollowChange() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const change = async (seo: string, c: { starred?: boolean; alerts?: Partial<AlertSettings> }, name?: string, logo?: string) => {
    setError(null);
    const before = qc.getQueryData<FollowsResponse>(["follows"]);
    if (before) {
      let follows = before.follows;
      const existing = follows.find((f) => f.seo === seo);
      if (c.starred === false) follows = follows.filter((f) => f.seo !== seo);
      else if (!existing) follows = [...follows, { seo, name: name ?? seo, logo: logo ?? "", alerts: { ...NEW_STAR, ...c.alerts } }];
      else follows = follows.map((f) => (f.seo === seo ? { ...f, alerts: { ...f.alerts, ...c.alerts } } : f));
      qc.setQueryData(["follows"], { ...before, follows });
    }
    try {
      await saveFollow(seo, c);
    } catch (err) {
      setError((err as Error).message);
      if (before) qc.setQueryData(["follows"], before);
    } finally {
      void qc.invalidateQueries({ queryKey: ["follows"] });
    }
  };
  return { change, error };
}

/** ☆ / ★ next to a team's name: follow it (goal and final alerts to start). */
export function StarButton({ seo, name, logo, className = "" }: { seo: string; name: string; logo?: string; className?: string }) {
  const { data } = useFollows();
  const { change } = useFollowChange();
  if (!data?.signedIn) return null;
  const starred = data.follows.some((f) => f.seo === seo);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        void change(seo, { starred: !starred }, name, logo);
      }}
      aria-pressed={starred}
      title={starred ? `Unfavorite ${name}` : `Favorite ${name}: get its game alerts`}
      className={`rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors ${
        starred ? "border-gold/50 bg-gold/10 text-gold" : "border-border text-text-dim hover:border-gold/50 hover:text-gold"
      } ${className}`}
    >
      {starred ? "★ Favorite" : "☆ Favorite"}
    </button>
  );
}

/** The small "★ Favorites" toggle for the NCAA D1 header. */
export function FavoritesButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  const { data } = useFollows();
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
        open ? "border-gold/50 bg-gold/10 text-gold" : "border-border text-text-dim hover:text-text"
      }`}
    >
      <span className="text-gold">★</span> Favorites{data?.follows.length ? <span className="text-xs text-text-dim">({data.follows.length})</span> : null}
    </button>
  );
}

/** Every favorite team with its game alerts, a way to add more, and the phone-notification switch. */
export function FavoritesPanel() {
  const { data } = useFollows();
  const { change, error } = useFollowChange();
  const { data: standings } = useNcaaStandings();
  const [query, setQuery] = useState("");

  const teams = useMemo(() => {
    const out = new Map<string, { seo: string; name: string; logo: string | null }>();
    for (const c of standings?.conferences ?? []) for (const r of c.rows) out.set(r.seo, { seo: r.seo, name: r.name, logo: r.logo ?? null });
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [standings]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starred = new Set(data?.follows.map((f) => f.seo));
    return teams.filter((t) => !starred.has(t.seo) && t.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, teams, data]);

  if (!data) return <Card className="text-sm text-text-dim">Loading favorites…</Card>;
  if (!data.signedIn) return <Card className="text-sm text-text-dim">Sign in to save favorite teams and get their game alerts.</Card>;

  return (
    <Card className="flex flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-display text-base font-semibold">Favorite teams</div>
          <p className="text-xs text-text-dim">Choose which game alerts each team sends to your phone.</p>
        </div>
        <PushSwitch publicKey={data.publicKey} />
      </div>

      {data.follows.length === 0 ? (
        <p className="text-sm text-text-dim">No favorites yet. Search below, or tap ☆ Favorite on any team's page.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border">
          {data.follows.map((f) => (
            <li key={f.seo} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <TeamLogo name={f.name} url={f.logo} size="sm" />
                <span className="min-w-0 truncate text-sm font-medium">
                  <TeamLink seo={f.seo}>{f.name}</TeamLink>
                  <Rpi seo={f.seo} />
                </span>
                <button
                  onClick={() => void change(f.seo, { starred: false })}
                  className="ml-auto text-gold hover:text-text-dim sm:hidden"
                  title={`Unfavorite ${f.name}`}
                  aria-label={`Unfavorite ${f.name}`}
                >
                  ★
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {ALERTS.map((a) => {
                  const on = f.alerts[a.key];
                  return (
                    <button
                      key={a.key}
                      onClick={() => void change(f.seo, { alerts: { [a.key]: !on } })}
                      aria-pressed={on}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        on ? "border-owl-red/50 bg-owl-red/15 text-owl-red-light" : "border-border text-text-dim hover:text-text"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => void change(f.seo, { starred: false })}
                  className="ml-1 hidden text-base text-gold hover:text-text-dim sm:inline"
                  title={`Unfavorite ${f.name}`}
                  aria-label={`Unfavorite ${f.name}`}
                >
                  ★
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a team…"
          className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none focus:border-owl-red"
        />
        {matches.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {matches.map((t) => (
              <li key={t.seo}>
                <button
                  onClick={() => {
                    void change(t.seo, { starred: true }, t.name, t.logo ?? undefined);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-raised"
                >
                  <TeamLogo name={t.name} url={t.logo} size="sm" />
                  <span className="flex-1">{t.name}</span>
                  <span className="text-xs text-gold">☆ Add</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-owl-red-light">{error}</p>}
    </Card>
  );
}

/** Turns phone notifications on for this device (needed for any game alert). */
function PushSwitch({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getPushState().then(setState, () => setState("unsupported"));
  }, []);
  if (state === null) return null;
  if (state === "on") return <span className="rounded-full border border-teal/40 bg-teal/10 px-2.5 py-1 text-xs font-medium text-teal">✓ Phone alerts on</span>;
  if (state === "needs-install" || (isIos() && !isStandalone()))
    return <span className="max-w-xs text-xs text-text-dim">To get alerts on iPhone, add this app to your Home Screen (Share → Add to Home Screen), then open it from there.</span>;
  if (state === "unsupported") return <span className="text-xs text-text-dim">This browser can't show notifications.</span>;
  if (state === "denied") return <span className="max-w-xs text-xs text-text-dim">Notifications are blocked for this app. Allow them in your phone's settings.</span>;
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            setState(await enablePush(publicKey, "/api/follows/push/subscribe"));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-lg bg-owl-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-owl-red-light disabled:opacity-60"
      >
        {busy ? "Turning on…" : "Turn on phone alerts"}
      </button>
      {error && <span className="text-[11px] text-owl-red-light">{error}</span>}
    </div>
  );
}
