import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sendRemindersNow, updateReminderSettings, useReminderSettings } from "../api/client";
import { Card, SectionHeading } from "./Card";

/** Coach-only: morning check-in reminder settings (Data page). */
export function RemindersPanel() {
  const queryClient = useQueryClient();
  const { data } = useReminderSettings();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function save(input: { enabled?: boolean; time?: string; followupEnabled?: boolean; followupTime?: string }) {
    setError(null);
    try {
      await updateReminderSettings(input);
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSendNow() {
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const r = await sendRemindersNow();
      setMessage(
        r.players === 0
          ? "Everyone with notifications on has already checked in today."
          : `Sent to ${r.players} player${r.players === 1 ? "" : "s"} who haven't checked in (${r.sent} phone${r.sent === 1 ? "" : "s"}).`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <SectionHeading
        title="Morning Reminders"
        subtitle="Phone notifications for the daily check-in. Players turn them on from the app on their phone."
      />
      <Card className="flex flex-col gap-4 text-sm">
        {!data ? (
          <div className="text-text-dim">Loading…</div>
        ) : (
          <>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={data.enabled}
                onChange={(e) => save({ enabled: e.target.checked })}
                className="h-4 w-4 accent-[#c8102e]"
              />
              <span className="font-medium">Send morning reminders</span>
            </label>
            <div className={`flex flex-col gap-3 border-l-2 border-border pl-4 ${data.enabled ? "" : "opacity-50"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <TimeInput value={data.time} disabled={!data.enabled} onChange={(time) => save({ time })} />
                <span>
                  to <span className="text-text">every player</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={data.followupEnabled}
                  disabled={!data.enabled}
                  onChange={(e) => save({ followupEnabled: e.target.checked })}
                  className="h-4 w-4 accent-[#c8102e]"
                  aria-label="Send follow-up"
                />
                <TimeInput
                  value={data.followupTime}
                  disabled={!data.enabled || !data.followupEnabled}
                  onChange={(followupTime) => save({ followupTime })}
                />
                <span>
                  follow-up to players who <span className="text-text">still haven&rsquo;t checked in</span>
                </span>
              </div>
              <div className="text-xs text-text-dim">
                Times are {data.timezone === "America/New_York" ? "Eastern" : data.timezone}.
              </div>
            </div>
            <div className="text-text-dim">
              {data.playersWithNotifications} player{data.playersWithNotifications === 1 ? " has" : "s have"} notifications
              turned on.
              {data.lastSentDate && <> Last reminder sent {data.lastSentDate}.</>} Switch reminders off for days off or the
              off-season.
            </div>
            <div>
              <button
                onClick={handleSendNow}
                disabled={sending}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-text-dim transition-colors hover:border-owl-red hover:text-text disabled:opacity-50"
              >
                {sending ? "Sending…" : "Nudge players who haven\u2019t checked in"}
              </button>
            </div>
            {message && <div className="rounded-lg border border-teal/40 bg-teal/10 p-3 text-teal">{message}</div>}
          </>
        )}
        {error && <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-red-300">{error}</div>}
      </Card>
    </section>
  );
}

function TimeInput({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className="rounded-md border border-border bg-surface-raised px-2 py-1 text-text outline-none focus:border-owl-red disabled:opacity-50"
    />
  );
}
