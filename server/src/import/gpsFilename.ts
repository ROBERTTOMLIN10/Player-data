/**
 * GPS file names. Coaches name exports after the game, e.g. "Memphis 2026.xlsx"
 * (opponent and year); the older "2026-09-12_Memphis.xlsx" still works. The
 * game date itself comes from the file's own Date column; the name gives the
 * opponent, and the year is a fallback for finding the date on the schedule.
 */
export interface GpsFilename {
  opponent: string | null;
  date: string | null; // YYYY-MM-DD when the name starts with one
  year: number | null; // from the date, or a trailing year ("Memphis 2026")
}

export function parseGpsFilename(filename: string): GpsFilename {
  let base = filename.replace(/\.xlsx$/i, "").trim();
  let date: string | null = null;
  let year: number | null = null;
  const leadingDate = base.match(/^(\d{4}-\d{2}-\d{2})[\s_-]*/);
  if (leadingDate) {
    date = leadingDate[1];
    year = Number(date.slice(0, 4));
    base = base.slice(leadingDate[0].length);
  }
  const trailingYear = base.match(/[\s_-]+((?:19|20)\d{2})$/);
  if (trailingYear) {
    year = Number(trailingYear[1]);
    base = base.slice(0, -trailingYear[0].length);
  }
  const opponent = base
    .replace(/[_]+/g, " ")
    .replace(/\s+-\s+|-(?=\s)|(?<=\s)-/g, " ")
    .replace(/^(vs\.?|v\.?|at|@)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return { opponent: opponent || null, date, year };
}

/** "No. 20 NC State" / "RV Memphis" / "at Tulsa" -> "nc state" / "memphis" / "tulsa", for matching schedule rows. */
export function normalizeOpponent(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(no\.\s*\d+|rv|#\d+)\s+/, "")
    .replace(/^(vs\.?|at|@)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
