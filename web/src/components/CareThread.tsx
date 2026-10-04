import { useState } from "react";
import type { CareMessage } from "../types";

const WHO: Record<CareMessage["author_role"], string> = { player: "Player", trainer: "AT", coach: "Coach" };

function clock(iso: string) {
  // created_at is UTC "YYYY-MM-DD HH:MM:SS"
  const d = new Date(`${iso.replace(" ", "T")}${iso.endsWith("Z") ? "" : "Z"}`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * The back-and-forth between the AT and a player for the day. Coaches read it
 * too. `mine` is the viewer's side (their bubbles sit on the right).
 */
export function CareThread({
  messages,
  mine,
  onSend,
  quick,
  placeholder = "Message…",
  playerName,
}: {
  messages: CareMessage[];
  mine: "player" | "staff";
  onSend?: (body: string, quick?: string) => Promise<unknown>;
  quick?: { key: string; label: string; body?: string }[];
  placeholder?: string;
  playerName?: string;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string, q?: string) {
    if (!onSend) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(text, q);
      setBody("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {messages.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {messages.map((m) => {
            const isMine = mine === "player" ? m.author_role === "player" : m.author_role !== "player";
            return (
              <li key={m.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
                    isMine ? "rounded-br-sm bg-owl-red/20 text-text" : "rounded-bl-sm border border-border bg-surface-raised text-text"
                  }`}
                >
                  {m.body}
                </div>
                <span className="mt-0.5 px-1 text-[10px] text-text-dim">
                  {m.author_role === "player" ? (playerName ?? "Player") : WHO[m.author_role]} · {clock(m.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {onSend && (
        <>
          {quick && quick.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {quick.map((q) => (
                <button
                  key={q.key}
                  disabled={busy}
                  onClick={() => void send(q.body ?? q.label, q.key)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-text-dim hover:border-owl-red/60 hover:text-text disabled:opacity-50"
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="w-full rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-sm text-text outline-none focus:border-owl-red"
              placeholder={placeholder}
              value={body}
              maxLength={1000}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && body.trim() && !busy && void send(body.trim())}
            />
            <button
              disabled={busy || !body.trim()}
              onClick={() => void send(body.trim())}
              className="rounded-md bg-owl-red px-3 py-1.5 text-sm font-semibold text-white hover:bg-owl-red-light disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-owl-red-light">{error}</p>}
    </div>
  );
}
