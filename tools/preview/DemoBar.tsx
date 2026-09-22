import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { demo, type DemoRole } from "./mock";

/** Preview-only strip for switching between the player and coach views. */
export function DemoBar() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [, force] = useState(0);

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
        Preview with test check-ins · nothing here is saved
      </span>
      <div className="flex gap-1 rounded-lg bg-black/25 p-0.5" role="group" aria-label="View as">
        {btn("player", "Player view")}
        {btn("coach", "Coach view")}
      </div>
    </div>
  );
}
