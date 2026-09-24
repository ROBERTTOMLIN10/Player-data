import { fetchText, type HtmlTable } from "./client.js";

/**
 * The national Top 25 polls, week by week, from Wikipedia's "YYYY NCAA Division
 * I men's soccer rankings" page, which keeps every week of United Soccer
 * Coaches, Top Drawer Soccer and (since 2024) College Soccer News in one place,
 * for this season and past ones. NCAA.com only has the current coaches' poll.
 */
export const POLLS = [
  { key: "usc", label: "United Soccer Coaches", heading: "United Soccer Coaches" },
  { key: "tds", label: "Top Drawer Soccer", heading: "Top Drawer Soccer" },
  { key: "csn", label: "College Soccer News", heading: "College Soccer News" },
] as const;
export type PollKey = (typeof POLLS)[number]["key"];

export interface PollEntry {
  rank: number;
  name: string;
  record: string | null; // "7-0-1"
  votes: number | null; // first-place votes
}

export interface PollWeek {
  label: string; // "Preseason", "Week 5", "Final"
  date: string | null; // "Sep 22"
  entries: PollEntry[];
}

export type SeasonPolls = Partial<Record<PollKey, PollWeek[]>>;

const WIKI_API = "https://en.wikipedia.org/w/api.php";

/** Wikitext value -> plain text: links and team-link templates become their titles, refs are dropped. */
function plain(value: string): string {
  return value
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{csoc link\|[^}]*?title=([^|}]+)[^}]*\}\}/gi, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEntry(rank: number, raw: string): PollEntry | null {
  let text = plain(raw);
  let votes: number | null = null;
  text = text.replace(/''\s*\((\d+)\)\s*''/, (_, n) => ((votes = Number(n)), ""));
  let record: string | null = null;
  text = text.replace(/\((\d+)\s*[–-]\s*(\d+)\s*[–-]\s*(\d+)\)/, (_, w, l, t) => ((record = `${w}-${l}-${t}`), ""));
  const name = text.replace(/''/g, "").replace(/\s*т\s*/g, " ").trim();
  return name ? { rank, name, record, votes } : null;
}

/** One poll's ColPollTable (the text of its section) -> weeks that have entries, in order. */
export function parsePollSection(section: string): PollWeek[] {
  const labels = new Map<number, string>();
  const dates = new Map<number, string>();
  const entries = new Map<number, PollEntry[]>();
  for (const m of section.matchAll(/^\|\s*Week(\d+)[ \t]*=[ \t]*(.*)$/gm)) {
    const v = plain(m[2]);
    labels.set(Number(m[1]), v === "0" ? "Preseason" : /^\d+$/.test(v) ? `Week ${v}` : v);
  }
  for (const m of section.matchAll(/^\|\s*Week(\d+)Date[ \t]*=[ \t]*(.*)$/gm)) dates.set(Number(m[1]), plain(m[2]));
  for (const m of section.matchAll(/^\|\s*Week(\d+)-(\d+)[ \t]*=[ \t]*(.*)$/gm)) {
    const entry = parseEntry(Number(m[2]), m[3]);
    if (!entry) continue;
    const week = Number(m[1]);
    entries.set(week, [...(entries.get(week) ?? []), entry]);
  }
  return [...entries.keys()]
    .sort((a, b) => a - b)
    .map((w) => ({
      label: labels.get(w) || `Week ${w - 1}`,
      date: dates.get(w) || null,
      entries: entries.get(w)!.sort((a, b) => a.rank - b.rank),
    }));
}

export function parseSeasonPolls(wikitext: string): SeasonPolls {
  const polls: SeasonPolls = {};
  for (const p of POLLS) {
    const start = wikitext.search(new RegExp(`^==\\s*${p.heading}\\s*==\\s*$`, "m"));
    if (start === -1) continue;
    const rest = wikitext.slice(start + 2);
    const end = rest.search(/^==[^=]/m);
    const weeks = parsePollSection(end === -1 ? rest : rest.slice(0, end));
    if (weeks.length) polls[p.key] = weeks;
  }
  return polls;
}

export async function fetchSeasonPolls(seasonYear: number): Promise<SeasonPolls> {
  const page = `${seasonYear} NCAA Division I men's soccer rankings`;
  const url = `${WIKI_API}?action=parse&format=json&formatversion=2&prop=wikitext&page=${encodeURIComponent(page)}`;
  const body = JSON.parse(await fetchText(url)) as { parse?: { wikitext: string }; error?: { info: string } };
  if (!body.parse) throw new Error(body.error?.info ?? "no page");
  return parseSeasonPolls(body.parse.wikitext);
}

/**
 * A poll week as a table (Rank, School, Record, Prev), with each row's movement
 * since the week before: + up, - down, null when new to the poll.
 */
export function pollWeekTable(weeks: PollWeek[], index: number): HtmlTable & { moves: (number | null)[] } {
  const week = weeks[index];
  const prev = index > 0 ? new Map(weeks[index - 1].entries.map((e) => [e.name, e.rank])) : null;
  const hasVotes = week.entries.some((e) => e.votes);
  return {
    columns: ["Rank", "School", ...(hasVotes ? ["1st"] : []), "Record", "Prev"],
    rows: week.entries.map((e) => [
      String(e.rank),
      e.name,
      ...(hasVotes ? [e.votes ? String(e.votes) : ""] : []),
      e.record ?? "",
      prev ? String(prev.get(e.name) ?? "NR") : "",
    ]),
    moves: week.entries.map((e) => {
      const before = prev?.get(e.name);
      return before === undefined ? null : before - e.rank;
    }),
  };
}
