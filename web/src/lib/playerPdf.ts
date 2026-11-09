import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { PlayerReport } from "../types";

/**
 * The player's season report as a PDF, to send to coaches and agents: profile,
 * match stats, physical profile against the team, the game log, and every game's
 * GPS numbers next to the team's average that game. Built in the browser.
 */

const RED: [number, number, number] = [204, 0, 0];
const NAVY: [number, number, number] = [0, 51, 102];
const INK: [number, number, number] = [30, 30, 30];
const DIM: [number, number, number] = [110, 110, 110];
const LINE: [number, number, number] = [220, 220, 220];
const KM_PER_MI = 1.609344;

const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
const longDate = (iso: string) => fmtDate(iso, { month: "short", day: "numeric", year: "numeric" });
const fixed = (v: number | null | undefined, d: number) => (v == null ? "–" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));

/** A metric value with its metric conversion, as everywhere else in the app (miles with km, mph with km/h). */
function withUnit(v: number | null | undefined, unit: string, d: number): string {
  if (v == null) return "–";
  if (unit === "mi") return `${fixed(v, d)} mi (${fixed(v * KM_PER_MI, d)} km)`;
  if (unit === "mph") return `${fixed(v, d)} mph (${fixed(v * KM_PER_MI, 1)} km/h)`;
  if (unit === "yd") return `${fixed(v, d)} yd (${fixed(v * 0.9144, 0)} m)`;
  return unit ? `${fixed(v, d)} ${unit}` : fixed(v, d);
}

function diffPct(v: number | null, team: number | null): string {
  if (v == null || team == null || team === 0) return "";
  const p = Math.round(((v - team) / team) * 100);
  return p === 0 ? "even" : `${p > 0 ? "+" : ""}${p}%`;
}

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? "th"}`;

/** The roster photo as a data URL, when the site lets us load it (otherwise the report goes without). */
async function photoData(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function reportFilename(report: PlayerReport): string {
  const name = report.player.canonical_name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${name}_FAU_Mens_Soccer_${report.range.to.slice(0, 4)}.pdf`;
}

export async function playerReportPdf(report: PlayerReport): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40; // page margin
  const p = report.profile;
  const name = report.player.canonical_name;

  // ---- Header ---------------------------------------------------------------
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 118, "F");
  doc.setFillColor(...RED);
  doc.rect(0, 118, W, 4, "F");
  const photo = await photoData(p?.photo_url);
  const textLeft = photo ? M + 96 : M;
  if (photo) {
    try {
      doc.addImage(photo, M, 18, 82, 82, undefined, "FAST");
    } catch {
      // unreadable image: leave the space
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("FAU MEN'S SOCCER  ·  PLAYER REPORT", textLeft, 32);
  doc.setFontSize(24);
  doc.text(`${report.player.jersey_number ? `#${report.player.jersey_number}  ` : ""}${name}`, textLeft, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const height = p?.height_feet ? `${p.height_feet}'${p.height_inches ?? 0}" (${Math.round((p.height_feet * 12 + (p.height_inches ?? 0)) * 2.54)} cm)` : null;
  const weight = p?.weight ? `${p.weight} lbs (${Math.round(p.weight * 0.4536)} kg)` : null;
  const line1 = [p?.position_long || p?.position_short, p?.academic_year_long || p?.academic_year, height, weight].filter(Boolean).join("  ·  ");
  const line2 = [p?.hometown ? `Hometown: ${p.hometown}` : null, p?.previous_school ? `Previous school: ${p.previous_school}` : p?.high_school ? `High school: ${p.high_school}` : null]
    .filter(Boolean)
    .join("  ·  ");
  if (line1) doc.text(line1, textLeft, 80, { maxWidth: W - textLeft - M });
  if (line2) doc.text(line2, textLeft, 96, { maxWidth: W - textLeft - M });

  doc.setTextColor(...DIM);
  doc.setFontSize(9);
  doc.text(
    `${longDate(report.range.from)} – ${longDate(report.range.to)}  ·  ${report.match.totals.played} games played  ·  ${report.trackedGames} games with GPS data`,
    M,
    142,
  );

  // ---- Match stats ------------------------------------------------------------
  const t = report.match.totals;
  let y = 160;
  const heading = (text: string, at: number) => {
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(text.toUpperCase(), M, at);
    doc.setDrawColor(...RED);
    doc.setLineWidth(1.5);
    doc.line(M, at + 4, M + 40, at + 4);
    return at + 12;
  };
  y = heading("Match stats", y);
  const tiles: [string, string][] = [
    ["Games", String(t.played)],
    ["Starts", String(t.started)],
    ["Minutes", t.minutes.toLocaleString("en-US")],
    ["Goals", String(t.goals)],
    ["Assists", String(t.assists)],
    ["Points", String(t.points)],
    ["Shots", String(t.shots)],
    ["On goal", String(t.shots_on_goal)],
    ["Yellow", String(t.yellow_cards)],
    ["Red", String(t.red_cards)],
    ...(t.saves != null ? ([["Saves", String(t.saves)]] as [string, string][]) : []),
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [tiles.map(([k]) => k)],
    body: [tiles.map(([, v]) => v)],
    theme: "grid",
    styles: { halign: "center", fontSize: 9, cellPadding: 4, lineColor: LINE, textColor: INK },
    headStyles: { fillColor: [245, 245, 245], textColor: DIM, fontStyle: "normal", fontSize: 7.5 },
    bodyStyles: { fontStyle: "bold", fontSize: 13 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  // ---- Physical profile ---------------------------------------------------------
  y = heading("Physical profile (GPS)", y);
  const ranked = report.physical.find((m) => m.of)?.of ?? 0;
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["", "Average per game", "Season best", "Team average", "Team rank"]],
    body: report.physical.map((m) => [
      m.label,
      withUnit(m.avg, m.unit, m.decimals),
      m.best == null ? "–" : `${withUnit(m.best, m.unit, m.decimals)}${m.bestGame ? `\n${fmtDate(m.bestGame.date)} vs ${m.bestGame.opponent ?? "?"}` : ""}`,
      `${withUnit(m.teamAvg, m.unit, m.decimals)}${m.avg != null && m.teamAvg != null ? `  (${diffPct(m.avg, m.teamAvg)})` : ""}`,
      m.rank ? `${ordinal(m.rank)} of ${m.of}` : "–",
    ]),
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 4, textColor: INK, valign: "middle" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 92 }, 4: { halign: "center", cellWidth: 62 } },
    alternateRowStyles: { fillColor: [247, 248, 250] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...DIM);
  doc.text(
    `Per-game averages over games with GPS data. Team average: teammates' games with minutes in the same period. Rank: among ${ranked} players with enough tracked games. GPS by Titan.`,
    M,
    y,
    { maxWidth: W - 2 * M },
  );

  // ---- Game log -------------------------------------------------------------------
  doc.addPage();
  y = heading("Game log", 50);
  const gps = new Map(report.gpsGames.map((g) => [g.game_date, g]));
  const phys = (key: string) => report.physical.find((m) => m.key === key);
  const dates = [...new Set([...report.match.games.map((g) => g.game_date), ...report.gpsGames.map((g) => g.game_date)])].sort();
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Date", "Opponent", "Result", "GS", "Min", "G", "A", "Sh", "SOG", "Cards", "Distance (mi)", "Top speed (mph)", "Sprints"]],
    body: dates.map((d) => {
      const g = report.match.games.find((x) => x.game_date === d);
      const s = gps.get(d);
      const cards = g ? [g.yellow_cards ? `${g.yellow_cards}Y` : "", g.red_cards ? `${g.red_cards}R` : ""].filter(Boolean).join(" ") : "";
      return [
        fmtDate(d),
        g?.opponent ?? s?.opponent ?? "",
        g?.result ?? "",
        g ? (g.started ? "Y" : "") : "",
        g?.minutes != null ? String(Math.round(g.minutes)) : (s?.minutes != null ? String(Math.round(s.minutes)) : ""),
        g ? String(g.goals) : "",
        g ? String(g.assists) : "",
        g ? String(g.shots) : "",
        g ? String(g.shots_on_goal) : "",
        cards,
        s && !s.glitch ? fixed(s.metrics.distance_mi?.value, 2) : s?.glitch ? "glitch" : "",
        s && !s.glitch ? fixed(s.metrics.top_speed_mph?.value, 1) : "",
        s && !s.glitch ? fixed(s.metrics.sprints_count?.value, 0) : "",
      ];
    }),
    foot: [
      [
        "Total",
        "",
        "",
        String(t.started),
        t.minutes.toLocaleString("en-US"),
        String(t.goals),
        String(t.assists),
        String(t.shots),
        String(t.shots_on_goal),
        [t.yellow_cards ? `${t.yellow_cards}Y` : "", t.red_cards ? `${t.red_cards}R` : ""].filter(Boolean).join(" "),
        `avg ${fixed(phys("distance_mi")?.avg, 2)}`,
        `best ${fixed(phys("top_speed_mph")?.best, 1)}`,
        `avg ${fixed(phys("sprints_count")?.avg, 0)}`,
      ],
    ],
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 3.5, textColor: INK, halign: "center" },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 7.5 },
    footStyles: { fillColor: [240, 240, 240], textColor: INK, fontStyle: "bold" },
    columnStyles: { 0: { halign: "left", cellWidth: 42 }, 1: { halign: "left", cellWidth: 100 }, 2: { halign: "left" } },
    alternateRowStyles: { fillColor: [247, 248, 250] },
  });

  // ---- Game by game physical detail -------------------------------------------------
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28;
  if (y > 640) {
    doc.addPage();
    y = 50;
  }
  y = heading("Game by game: physical detail", y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...DIM);
  doc.text("Each game's GPS numbers next to the team's average in that game (teammates with minutes).", M, y + 4);
  y += 14;
  for (const g of report.gpsGames) {
    const title = `${fmtDate(g.game_date, { weekday: "short", month: "short", day: "numeric" })} vs ${g.opponent ?? "?"}${g.minutes != null ? `  ·  ${Math.round(g.minutes)} min${g.started ? ", started" : ""}` : ""}${g.glitch ? "  ·  tracker glitch, not counted" : ""}`;
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [[{ content: title, colSpan: 4, styles: { halign: "left", fillColor: [235, 239, 245], textColor: NAVY, fontStyle: "bold", fontSize: 8.5 } }], ["", "This game", "Team avg", "vs team"]],
      body: report.physical.map((m) => {
        const x = g.metrics[m.key];
        return [m.label, withUnit(x?.value, m.unit, m.decimals), withUnit(x?.teamAvg, m.unit, m.decimals), diffPct(x?.value ?? null, x?.teamAvg ?? null)];
      }),
      theme: "plain",
      rowPageBreak: "avoid",
      pageBreak: "auto",
      styles: { fontSize: 7.5, cellPadding: 2.2, textColor: INK },
      headStyles: { textColor: DIM, fontStyle: "normal", fontSize: 7 },
      columnStyles: { 0: { cellWidth: 92, fontStyle: "bold" }, 3: { halign: "right", cellWidth: 50 } },
      didParseCell: (c) => {
        if (c.section === "body" && c.column.index === 3) {
          const s = String(c.cell.raw ?? "");
          if (s.startsWith("+")) c.cell.styles.textColor = [0, 128, 96];
          else if (s.startsWith("-")) c.cell.styles.textColor = RED;
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  }

  // ---- Footer on every page ------------------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(M, H - 30, W - M, H - 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...DIM);
    doc.text(`FAU Men's Soccer  ·  ${name}  ·  Generated ${longDate(report.generated)}`, M, H - 18);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 18, { align: "right" });
  }

  return doc.output("blob");
}
