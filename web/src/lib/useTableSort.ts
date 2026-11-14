import { useState } from "react";

export type SortValue = number | string | null | undefined;
export interface SortState {
  key: string;
  dir: "asc" | "desc";
}
export type SortAccessors<T> = Record<string, (row: T) => SortValue>;

const isEmpty = (v: SortValue): v is null | undefined | "" => v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v));
const isDate = (v: SortValue) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

/**
 * Click-to-sort for a table. The first click on a column sorts it highest to lowest (newest first for
 * dates, A to Z for names); clicking it again flips it. Empty values always stay at the bottom, and
 * until a column is clicked the rows keep the order they came in.
 */
export function useTableSort<T>(rows: T[], accessors: SortAccessors<T>) {
  const [sort, setSort] = useState<SortState | null>(null);

  const onSort = (key: string) =>
    setSort((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      const get = accessors[key];
      const sample = get ? rows.map(get).find((v) => !isEmpty(v)) : undefined;
      return { key, dir: typeof sample === "string" && !isDate(sample) ? "asc" : "desc" };
    });

  const get = sort ? accessors[sort.key] : undefined;
  if (!sort || !get) return { rows, sort, onSort };

  const mult = sort.dir === "desc" ? -1 : 1;
  const present: [T, SortValue][] = [];
  const empty: T[] = [];
  for (const r of rows) {
    const v = get(r);
    if (isEmpty(v)) empty.push(r);
    else present.push([r, v]);
  }
  present.sort(([, a], [, b]) =>
    typeof a === "number" && typeof b === "number" ? (a - b) * mult : String(a).localeCompare(String(b), undefined, { numeric: true }) * mult,
  );
  return { rows: [...present.map(([r]) => r), ...empty], sort, onSort };
}
