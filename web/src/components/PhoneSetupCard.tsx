import { useEffect, useState, type ReactNode } from "react";
import { usePushConfig } from "../api/client";
import {
  canPromptInstall,
  disablePush,
  enablePush,
  getPushState,
  isIos,
  isStandalone,
  onInstallAvailabilityChange,
  promptInstall,
  type PushState,
} from "../lib/pwa";

const SNOOZE_KEY = "phoneSetupSnoozedUntil";

function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

/**
 * Player-facing prompt to (1) add the app to the home screen and (2) turn on
 * the morning check-in reminder. Disappears once both are done.
 */
export function PhoneSetupCard() {
  const { data: config } = usePushConfig();
  const [standalone] = useState(isStandalone);
  const [installable, setInstallable] = useState(canPromptInstall);
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(snoozed);

  useEffect(() => onInstallAvailabilityChange(() => setInstallable(canPromptInstall())), []);
  useEffect(() => {
    getPushState().then(setPush).catch(() => setPush("unsupported"));
  }, []);

  const installDone = standalone;
  const reminderOffByCoach = config && !config.reminderEnabled;
  const pushDone = push === "on" || push === "unsupported" || reminderOffByCoach;
  if (hidden || push === null || (installDone && pushDone)) return null;

  async function handleEnable() {
    if (!config) return;
    setBusy(true);
    setError(null);
    try {
      setPush(await enablePush(config.publicKey));
    } catch (err) {
      setError((err as Error).message || "Couldn't turn on reminders.");
    } finally {
      setBusy(false);
    }
  }

  function snooze() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + 3 * 24 * 60 * 60 * 1000));
    } catch {
      // private mode: just hide for this visit
    }
    setHidden(true);
  }

  const time = config ? formatTime(config.reminderTime) : "7:30 AM";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-owl-red/40 bg-owl-red/10 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="font-display font-semibold">Set up your phone</div>
        <button onClick={snooze} className="text-xs text-text-dim hover:text-text">
          Not now
        </button>
      </div>

      {!installDone && (
        <Step n={1} title="Add to your home screen" done={false}>
          {installable ? (
            <button
              onClick={() => promptInstall()}
              className="mt-2 rounded-lg bg-owl-red px-3 py-1.5 text-sm font-medium text-white hover:bg-owl-red/90"
            >
              Install app
            </button>
          ) : isIos() ? (
            <p className="text-text-dim">
              In Safari, tap the <ShareIcon /> <span className="text-text">Share</span> button, then{" "}
              <span className="text-text">Add to Home Screen</span>. Open the app from your home screen after.
            </p>
          ) : (
            <p className="text-text-dim">
              Open your browser menu (⋮) and choose <span className="text-text">Add to Home screen</span> or{" "}
              <span className="text-text">Install app</span>.
            </p>
          )}
        </Step>
      )}

      {!pushDone && (
        <Step n={installDone ? 1 : 2} title={`Get a ${time} check-in reminder`} done={false}>
          {push === "needs-install" ? (
            <p className="text-text-dim">
              On iPhone, reminders work once the app is on your home screen. Add it first, then open it from there.
            </p>
          ) : push === "denied" ? (
            <p className="text-text-dim">
              Notifications are blocked. Turn them on for this app in your phone&rsquo;s Settings, then come back.
            </p>
          ) : (
            <>
              <p className="text-text-dim">
                {config?.followupTime
                  ? `Only if you haven't checked in yet, plus a ${formatTime(config.followupTime)} nudge if you still haven't.`
                  : "Only sent if you haven't checked in yet that morning."}
              </p>
              <button
                onClick={handleEnable}
                disabled={busy || !config}
                className="mt-2 rounded-lg bg-owl-red px-3 py-1.5 text-sm font-medium text-white hover:bg-owl-red/90 disabled:opacity-50"
              >
                {busy ? "Turning on…" : "Turn on reminders"}
              </button>
            </>
          )}
          {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
        </Step>
      )}
    </div>
  );
}

/** Small "reminders on" line with an off switch, shown once reminders are enabled. */
export function ReminderStatus() {
  const { data: config } = usePushConfig();
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => {
    getPushState().then(setPush).catch(() => setPush("unsupported"));
  }, []);
  if (push !== "on" || !config?.reminderEnabled) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-text-dim">
      <span>
        🔔 Reminders on: {formatTime(config.reminderTime)}
        {config.followupTime && <> and {formatTime(config.followupTime)}</>}, only if you haven&rsquo;t checked in
      </span>
      <button onClick={() => disablePush().then(setPush)} className="hover:text-text hover:underline">
        Turn off
      </button>
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          done ? "bg-teal/20 text-teal" : "bg-owl-red/25 text-owl-red-light"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        {children}
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-4 w-4 -translate-y-px align-middle" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12M7 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" strokeLinecap="round" />
    </svg>
  );
}
