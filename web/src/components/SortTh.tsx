import type { ReactNode } from "react";
import type { SortState } from "../lib/useTableSort";

/** A table column header you can click to sort (see useTableSort): an arrow shows the active column and its direction. */
export function SortTh({
  col,
  sort,
  onSort,
  children,
  className = "px-4 py-3",
}: {
  col: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const active = sort?.key === col;
  return (
    <th className={`${className} font-medium`} aria-sort={active ? (sort!.dir === "desc" ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className="inline-flex cursor-pointer select-none items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-text focus-visible:text-text focus-visible:outline-none"
      >
        {children}
        <span aria-hidden="true" className={`inline-block w-2.5 text-owl-red ${active ? "" : "opacity-0"}`}>
          {active && sort!.dir === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}
