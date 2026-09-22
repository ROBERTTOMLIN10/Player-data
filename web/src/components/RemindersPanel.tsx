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

  async function save(input: { enabled?: boolean; time?: string }) {
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
        title="Morning Reminder"
        subtitle="A phone notification to players who haven't checked in yet. Players turn it on from the app on their phone."
      />
      <Card className="flex flex-col gap-4 text-sm">
        {!data ? (
          <div className="text-text-dim">Loading…</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={data.enabled}
                  onChange={(e) => save({ enabled: e.target.checked })}
                  className="h-4 w-4 accent-[#c8102e]"
                />
                <span className="font-medium">Send daily reminder</span>
              </label>
              <label className="flex items-center gap-2 text-text-dim">
                at
                <input
                  type="time"
                  value={data.time}
                  disabled={!data.enabled}
                  onChange={(e) => e.target.value && save({ time: e.target.value })}
                  className="rounded-md border border-border bg-surface-raised px-2 py-1 text-text outline-none focus:border-owl-red disabled:opacity-50"
                />
                <span>{data.timezone === "America/New_York" ? "Eastern" : data.timezone}</span>
              </label>
            </div>
            <div className="text-text-dim">
              {data.playersWithNotifications} player{data.playersWithNotifications === 1 ? " has" : "s have"} notifications
              turned on.
              {data.lastSentDate && <> Last sent {data.lastSentDate}.</>} Turn it off for days off or the off-season.
            </div>
            <div>
              <button
                onClick={handleSendNow}
                disabled={sending}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-text-dim transition-colors hover:border-owl-red hover:text-text disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send reminder now"}
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
