import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-4 sm:p-5 ${className}`}>{children}</div>
  );
}

export function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-lg font-semibold text-text sm:text-xl">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-text-dim">{subtitle}</p>}
    </div>
  );
}
