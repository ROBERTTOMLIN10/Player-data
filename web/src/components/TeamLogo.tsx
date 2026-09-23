import { useState } from "react";

/**
 * Opponent school logo (from the fausports.com schedule), falling back to the
 * team's initials when there's no logo or it fails to load.
 */
export function TeamLogo({ name, url, size = "md" }: { name: string; url: string | null | undefined; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const box = size === "sm" ? "h-6 w-6 text-[9px]" : "h-10 w-10 text-xs";
  // Drop ranking prefixes like "No. 20" / "RV" so initials come from the school name.
  const initials = name
    .replace(/^(No\.\s*\d+|RV)\s+/i, "")
    .slice(0, 2)
    .toUpperCase();

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={`${name} logo`}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${box} shrink-0 rounded-full bg-white/5 object-contain ${size === "sm" ? "p-0.5" : "p-1"}`}
      />
    );
  }
  return (
    <div className={`${box} flex shrink-0 items-center justify-center rounded-full bg-surface-raised font-semibold text-text-dim`}>
      {initials}
    </div>
  );
}
