import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createAccount, deleteAccount, updateAccount, useAccounts } from "../api/client";
import { Card, SectionHeading } from "./Card";

type Editing =
  | { kind: "create-player"; playerId: number; name: string }
  | { kind: "create-coach" }
  | { kind: "reset"; userId: number; label: string; email: string };

/** Easy-to-read temporary password (no look-alike characters). */
function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function formatLastLogin(iso: string | null) {
  if (!iso) return "Never signed in";
  return `Last in ${new Date(`${iso.replace(" ", "T")}Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** Coach-only: create/reset/remove player and coach logins (Data page). */
export function AccountsPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAccounts();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [created, setCreated] = useState<{ label: string; email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["squadReadiness"] });
  };

  async function handleRemove(userId: number, label: string) {
    if (!window.confirm(`Remove the login for ${label}? Their check-in history is kept.`)) return;
    setError(null);
    try {
      await deleteAccount(userId);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const withLogin = data?.players.filter((p) => p.user_id !== null).length ?? 0;

  return (
    <section>
      <SectionHeading
        title="Logins"
        subtitle="Give each player a login. They sign in once on their phone with their email and stay signed in; they only see their own check-ins and GPS."
      />
      <div className="flex flex-col gap-4">
        {created && (
          <div className="rounded-lg border border-teal/40 bg-teal/10 p-3 text-sm text-teal">
            <div className="font-medium">Login ready for {created.label}. Send them:</div>
            <div className="mt-1 font-mono text-text">
              {window.location.origin} · {created.email} · {created.password}
            </div>
            <div className="mt-1 text-xs text-teal/80">This password isn&rsquo;t shown again. Reset it any time below.</div>
            <button onClick={() => setCreated(null)} className="mt-2 text-xs underline">
              Dismiss
            </button>
          </div>
        )}
        {error && <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}

        {editing && (
          <AccountForm
            editing={editing}
            onCancel={() => setEditing(null)}
            onDone={(result) => {
              setEditing(null);
              setCreated(result);
              refresh();
            }}
          />
        )}

        <Card className="overflow-x-auto p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="font-display font-semibold">Players</h3>
            <span className="text-xs text-text-dim">
              {withLogin}/{data?.players.length ?? 0} have a login
            </span>
          </div>
          {isLoading ? (
            <div className="p-4 text-sm text-text-dim">Loading…</div>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <tbody>
                {data?.players.map((p) => (
                  <tr key={p.player_id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5 text-text-dim">
                      {p.email ?? <span className="italic">No login</span>}
                      {p.email && <div className="text-xs">{formatLastLogin(p.last_login_at)}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {p.user_id === null ? (
                        <button
                          onClick={() => setEditing({ kind: "create-player", playerId: p.player_id, name: p.name })}
                          className="rounded-md bg-owl-red px-3 py-1 text-xs font-medium text-white hover:bg-owl-red/90"
                        >
                          Create login
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditing({ kind: "reset", userId: p.user_id!, label: p.name, email: p.email! })}
                            className="text-xs text-text-dim hover:text-text"
                          >
                            Reset password
                          </button>
                          <button
                            onClick={() => handleRemove(p.user_id!, p.name)}
                            className="ml-3 text-xs text-owl-red-light hover:underline"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold">Coaches</h3>
            <button onClick={() => setEditing({ kind: "create-coach" })} className="text-xs text-owl-red-light hover:underline">
              + Add coach login
            </button>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {data?.envCoach && (
              <li className="flex justify-between gap-2">
                <span>{data.envCoach}</span>
                <span className="text-xs text-text-dim">Main login (set in hosting settings)</span>
              </li>
            )}
            {data?.coaches.map((c) => (
              <li key={c.user_id} className="flex items-center justify-between gap-2">
                <span>
                  {c.email} <span className="text-xs text-text-dim">· {formatLastLogin(c.last_login_at)}</span>
                </span>
                <span className="whitespace-nowrap">
                  <button
                    onClick={() => setEditing({ kind: "reset", userId: c.user_id, label: c.email, email: c.email })}
                    className="text-xs text-text-dim hover:text-text"
                  >
                    Reset password
                  </button>
                  <button onClick={() => handleRemove(c.user_id, c.email)} className="ml-3 text-xs text-owl-red-light hover:underline">
                    Remove
                  </button>
                </span>
              </li>
            ))}
            {!data?.envCoach && data?.coaches.length === 0 && (
              <li className="text-text-dim">
                No coach login set, so this dashboard is open to anyone who can reach it. Fine on your own computer; set
                ADMIN_USER / ADMIN_PASSWORD before putting it online.
              </li>
            )}
          </ul>
        </Card>
      </div>
    </section>
  );
}

function AccountForm({
  editing,
  onCancel,
  onDone,
}: {
  editing: Editing;
  onCancel: () => void;
  onDone: (result: { label: string; email: string; password: string }) => void;
}) {
  const [email, setEmail] = useState(editing.kind === "reset" ? editing.email : "");
  const [password, setPassword] = useState(generatePassword);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title =
    editing.kind === "create-player"
      ? `Create login for ${editing.name}`
      : editing.kind === "create-coach"
        ? "Add coach login"
        : `Reset password for ${editing.label}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing.kind === "create-player") {
        await createAccount({ role: "player", email, password, playerId: editing.playerId });
        onDone({ label: editing.name, email: email.trim().toLowerCase(), password });
      } else if (editing.kind === "create-coach") {
        await createAccount({ role: "coach", email, password });
        onDone({ label: email, email: email.trim().toLowerCase(), password });
      } else {
        await updateAccount(editing.userId, { password });
        onDone({ label: editing.label, email: editing.email, password });
      }
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <h3 className="font-display font-semibold">{title}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-dim">Email</span>
            <input
              type="email"
              required
              disabled={editing.kind === "reset"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-text outline-none focus:border-owl-red disabled:opacity-60"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-dim">{editing.kind === "reset" ? "New password" : "Password"}</span>
            <div className="flex gap-2">
              <input
                type="text"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 font-mono text-text outline-none focus:border-owl-red"
              />
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="rounded-lg border border-border px-3 text-xs text-text-dim hover:text-text"
              >
                New
              </button>
            </div>
          </label>
        </div>
        {editing.kind === "reset" && (
          <p className="text-xs text-text-dim">Resetting signs them out on every device until they use the new password.</p>
        )}
        {error && <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-owl-red px-4 py-2 text-sm font-medium text-white hover:bg-owl-red/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : editing.kind === "reset" ? "Reset password" : "Create login"}
          </button>
          <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-text-dim hover:text-text">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
