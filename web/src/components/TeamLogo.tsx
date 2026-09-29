import { useState } from "react";

/**
 * Opponent school logo (from the fausports.com schedule), falling back to the
 * team's initials when there's no logo or it fails to load. Every logo sits in
 * the same size box (no background), so they line up whatever their shape.
 */
export function TeamLogo({ name, url, size = "md" }: { name: string; url: string | null | undefined; size?: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const box = size === "sm" ? "h-6 w-6 text-[9px]" : size === "lg" ? "h-20 w-20 text-base" : "h-10 w-10 text-xs";
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
        className={`${box} shrink-0 object-contain`}
      />
    );
  }
  return (
    <div className={`${box} flex shrink-0 items-center justify-center rounded-md bg-surface-raised font-semibold text-text-dim`}>
      {initials}
    </div>
  );
}
