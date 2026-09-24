import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { demo, type DemoRole } from "./mock";
import { listUploads } from "./uploads";

/** Preview-only strip for switching between the player and coach views. */
export function DemoBar() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [, force] = useState(0);
  const [pending, setPending] = useState(0);

  // GPS files uploaded in the preview that the next preview update will add.
  useEffect(() => {
    const refresh = () => void listUploads().then((u) => setPending(u.filter((x) => x.status === "pending").length));
    refresh();
    window.addEventListener("preview-uploads-changed", refresh);
    return () => window.removeEventListener("preview-uploads-changed", refresh);
  }, []);

  function switchTo(role: DemoRole) {
    demo.role = role;
    navigate("/");
    queryClient.resetQueries();
    force((n) => n + 1);
    window.scrollTo({ top: 0 });
  }

  const btn = (role: DemoRole, label: string) => (
    <button
      onClick={() => switchTo(role)}
      aria-pressed={demo.role === role}
      className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
        demo.role === role ? "bg-white text-ink" : "text-white/80 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 bg-gradient-to-r from-[#7a0a1c] to-owl-red px-4 py-2 text-xs text-white">
      <span className="font-medium">
        Preview with test check-ins · only GPS uploads are saved
      </span>
      <div className="flex gap-1 rounded-lg bg-black/25 p-0.5" role="group" aria-label="View as">
        {btn("player", "Player view")}
        {btn("coach", "Coach view")}
      </div>
      {pending > 0 && (
        <span className="rounded-md bg-black/25 px-2 py-1 font-medium">
          {pending} GPS file{pending === 1 ? "" : "s"} uploaded · added at the next preview update
        </span>
      )}
    </div>
  );
}
