import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { login } from "../api/client";

export default function LoginView() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      // Drop anything cached from a previous account before loading the new one.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-10 text-text">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-owl-red font-display text-xl font-bold text-white">
            FAU
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Men&rsquo;s Soccer</h1>
            <p className="text-sm text-text-dim">Performance &amp; Readiness</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-text-dim">Email</span>
            {/* type="text" so the existing coach username (which may not be an email) still works */}
            <input
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-base text-text outline-none focus:border-owl-red"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-text-dim">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-base text-text outline-none focus:border-owl-red"
            />
          </label>
          {error && <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-owl-red px-4 py-2.5 font-medium text-white transition-colors hover:bg-owl-red/90 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-xs text-text-dim">
            You&rsquo;ll stay signed in on this device. No login yet? Ask a coach.
          </p>
        </form>
      </div>
    </div>
  );
}
