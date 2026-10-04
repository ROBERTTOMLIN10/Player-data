import * as XLSX from "xlsx";

/**
 * The daily injury report as an Excel file, in the athletic trainer's own layout
 * (the sheet they email the coaches): title and date, then one row per player and
 * injury grouped by play status, with injury date, days, body part, side, practice
 * and conditioning notes, the latest note, attendance (Y/N) and expected return,
 * followed by PPE and Gen Med rows. Pure (no database), so the app preview can
 * build the same file in the browser.
 */

interface ReportAvailability {
  level: string;
  practice_note: string | null;
  bike: string | null;
  jogging: string | null;
  running: string | null;
}
interface ReportIssue {
  category: string;
  description: string;
  side: string | null;
  injury_date: string | null;
  expected_return: string | null;
  days: number | null;
  latestLog: { activities: string; notes: string | null } | null;
}
export interface ReportDay {
  date: string;
  players: { name: string; availability: ReportAvailability | null; treatments: { status: string }[]; issues: ReportIssue[] }[];
}

const STATUS_LABEL: Record<string, string> = { full: "Full", as_tolerated: "As tolerated", limited: "Limited", rehab: "Rehab only", out: "OUT" };
const ORDER = ["as_tolerated", "limited", "rehab", "out", "full"];
const SIDE: Record<string, string> = { left: "L", right: "R", both: "B" };

/** "Michel Tentchou" → "Tentchou, Michel", as the AT writes names. */
export function lastFirst(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? name : `${parts.slice(1).join(" ")}, ${parts[0]}`;
}

const asDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`) : null);

/** "2026-10-04" → "2026-27_FAU_MSOC_Injury_Report_10.4.2026.xlsx" (the season starts in August). */
export function reportFilename(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const season = m >= 7 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
  return `${season}_FAU_MSOC_Injury_Report_${m}.${d}.${y}.xlsx`;
}

export function injuryReportWorkbook(day: ReportDay): XLSX.WorkBook {
  const header = ["Play Status", "Student Name", "Injury Date", "Days of Injury", "Body Part/Injury", "Injury Side", "Practice Notes", "Conditioning Notes", "Additional Notes", "Attendance (Y/N)", "", "Expected Return"];
  const rows: unknown[][] = [["FAU Men's Soccer Injury Report", "", "", "", "", "", "", "", "", asDate(day.date)], header];

  const attendance = (t: { status: string }[]) => (t.some((x) => x.status === "attended") ? "Y" : t.some((x) => x.status === "missed") ? "N" : "NA");
  const conditioning = (a: ReportAvailability | null) => {
    const lines = [["Bike", a?.bike], ["Jogging", a?.jogging], ["Running", a?.running]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
    return lines.length ? lines.join("\n") : "NA";
  };
  const note = (i: ReportIssue | null) => (i?.latestLog ? (i.latestLog.notes ?? i.latestLog.activities) : "");

  const injuryRows: { level: string; row: unknown[]; date: string }[] = [];
  const ppe: unknown[][] = [];
  const genMed: unknown[][] = [];
  for (const p of day.players) {
    const a = p.availability;
    const level = a?.level ?? "full";
    const status = STATUS_LABEL[level] ?? level;
    const name = lastFirst(p.name);
    const injuries = p.issues.filter((i) => i.category === "injury");
    const line = (i: ReportIssue | null) => [
      status,
      name,
      asDate(i?.injury_date ?? null) ?? (i ? "NA" : ""),
      i?.days ?? "",
      i?.description ?? "",
      i ? (i.side ? SIDE[i.side] : "NA") : "",
      a?.practice_note ?? "",
      conditioning(a),
      note(i),
      attendance(p.treatments),
      "",
      asDate(i?.expected_return ?? null) ?? "",
    ];
    for (const i of injuries) injuryRows.push({ level, row: line(i), date: i.injury_date ?? "" });
    if (!injuries.length && level !== "full" && !p.issues.length) injuryRows.push({ level, row: line(null), date: "" });
    for (const i of p.issues.filter((x) => x.category !== "injury")) {
      const row = [status, name, i.category === "ppe" ? "PPE" : "Gen Med", "", i.description, i.side ? SIDE[i.side] : "", a?.practice_note ?? "", "", note(i), "", "", asDate(i.expected_return) ?? ""];
      (i.category === "ppe" ? ppe : genMed).push(row);
    }
  }
  injuryRows.sort((x, y) => ORDER.indexOf(x.level) - ORDER.indexOf(y.level) || y.date.localeCompare(x.date));
  rows.push(...injuryRows.map((r) => r.row), ...ppe, ...genMed);

  const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: "m/d/yyyy" });
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
  ws["!cols"] = [14, 24, 12, 8, 26, 8, 30, 40, 36, 10, 2, 14].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Injury Report");
  return wb;
}
