import { useState } from "react";

/**
 * Athletics sites (Sidearm) resize their /images/ files on request: ask for 3x
 * the size shown so headshots are sharp on phone screens without downloading
 * the full-size original. Other URLs (and embedded images) are left alone.
 */
function sized(url: string, size: number) {
  if (!/^https?:\/\/[^/]+\/images\//.test(url) || url.includes("?")) return url;
  return `${url}?width=${Math.round(size * 3)}`;
}

/** A player's roster headshot (round, top-cropped), or their initials when there's no photo. */
export function PlayerPhoto({ name, url, size = 32, className = "" }: { name: string; url?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const style = { width: size, height: size };
  if (!url || failed)
    return (
      <span
        style={{ ...style, fontSize: Math.max(10, size * 0.36) }}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-surface-raised font-semibold text-text-dim ${className}`}
        aria-hidden
      >
        {initials}
      </span>
    );
  return (
    <img
      src={sized(url, size)}
      alt=""
      style={style}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full bg-surface-raised object-cover object-top ${className}`}
    />
  );
}
