import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  // A card given its own padding (e.g. p-0 for a table) gets only that: both together left the
  // default winning on phones, so tables sat inset and pinned columns let scrolled ones show past them.
  const padding = /(^|\s)p-\d/.test(className) ? "" : "p-4 sm:p-5";
  return <div className={`rounded-xl border border-border bg-surface ${padding} ${className}`}>{children}</div>;
}

export function SectionHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-lg font-semibold text-text sm:text-xl">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-text-dim">{subtitle}</p>}
    </div>
  );
}
