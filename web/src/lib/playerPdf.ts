import { jsPDF } from "jspdf";
import autoTable, { type CellHookData } from "jspdf-autotable";
import type { PlayerReport } from "../types";

/**
 * The player's season report as a PDF, styled like the app (dark pages, Owl red,
 * gold and teal highlights), to send to coaches and agents:
 *  1. Cover: photo, profile, match-stat tiles, physical profile with team ranks.
 *  2. Season trends (his line vs the team average) and the full game-by-game table.
 *  3. Two games a page: opponent, result, minutes, and bars for him vs the team.
 * Built in the browser; photos and logos come through the server when the
 * browser can't read them directly.
 */

type RGB = [number, number, number];
const INK: RGB = [11, 12, 15];
const SURFACE: RGB = [21, 23, 28];
const RAISED: RGB = [28, 31, 38];
const BORDER: RGB = [42, 46, 55];
const RED: RGB = [200, 16, 46];
const RED_LIGHT: RGB = [255, 63, 94];
const TEAL: RGB = [45, 212, 191];
const GOLD: RGB = [242, 183, 5];
const TEXT: RGB = [233, 234, 238];
const DIM: RGB = [154, 160, 171];
const TEAM_BAR: RGB = [88, 94, 108];
const KM_PER_MI = 1.609344;

const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
const longDate = (iso: string) => fmtDate(iso, { month: "short", day: "numeric", year: "numeric" });
const fixed = (v: number | null | undefined, d: number) => (v == null ? "–" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));

/** A value with its metric conversion, as on the site (miles with km, mph with km/h, yards with metres). */
function withUnit(v: number | null | undefined, unit: string, d: number): string {
  if (v == null) return "–";
  if (unit === "mi") return `${fixed(v, d)} mi (${fixed(v * KM_PER_MI, d)} km)`;
  if (unit === "mph") return `${fixed(v, d)} mph (${fixed(v * KM_PER_MI, 1)} km/h)`;
  if (unit === "yd") return `${fixed(v, d)} yd (${fixed(v * 0.9144, 0)} m)`;
  return unit ? `${fixed(v, d)} ${unit}` : fixed(v, d);
}
const short = (v: number | null | undefined, unit: string, d: number) => (v == null ? "–" : `${fixed(v, d)}${unit && unit !== "m/s²" ? ` ${unit}` : ""}`);

function diffPct(v: number | null, team: number | null): number | null {
  if (v == null || team == null || team === 0) return null;
  return Math.round(((v - team) / team) * 100);
}
const pctText = (p: number | null) => (p == null ? "" : p === 0 ? "even" : `${p > 0 ? "+" : ""}${p}%`);
const pctColor = (p: number | null): RGB => (p == null || p === 0 ? DIM : p > 0 ? TEAL : RED_LIGHT);
const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? "th"}`;
const initials = (name: string) =>
  name
    .replace(/^(No\.\s*\d+|RV)\s+/i, "")
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";
const cleanOpponent = (o: string | null) => (o ?? "?").replace(/^(No\.\s*\d+|RV)\s+/i, "");

// ---- Images ---------------------------------------------------------------------------

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

/** PNG/JPEG go in as they are; anything else (SVG, WebP) is redrawn as a PNG in the browser. */
async function toPdfImage(dataUrl: string): Promise<string | null> {
  if (/^data:image\/(png|jpe?g)/i.test(dataUrl)) return dataUrl;
  if (typeof document === "undefined") return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 240;
      const scale = Math.min(size / (img.naturalWidth || size), size / (img.naturalHeight || size));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round((img.naturalWidth || size) * scale));
      c.height = Math.max(1, Math.round((img.naturalHeight || size) * scale));
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      try {
        resolve(c.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function loadImage(url: string | null | undefined, proxy: string | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return toPdfImage(url);
  for (const src of [url, proxy ? `${proxy}?src=${encodeURIComponent(url)}` : null]) {
    if (!src) continue;
    try {
      const res = await fetch(src, { mode: src === url ? "cors" : "same-origin" });
      if (!res.ok) continue;
      const data = await blobToDataUrl(await res.blob());
      const img = data ? await toPdfImage(data) : null;
      if (img) return img;
    } catch {
      // try the next way
    }
  }
  return null;
}

export function reportFilename(report: PlayerReport): string {
  const name = report.player.canonical_name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${name}_FAU_Mens_Soccer_${report.range.to.slice(0, 4)}.pdf`;
}

// ---- The document ---------------------------------------------------------------------

export async function playerReportPdf(report: PlayerReport, opts: { imageProxy?: string } = {}): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const p = report.profile;
  const name = report.player.canonical_name;
  const jersey = report.player.jersey_number;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Images first (photo + every opponent logo, each fetched once).
  const photo = await loadImage(p?.photo_url, opts.imageProxy);
  const logoUrls = [
    ...new Set([...report.match.games.map((g) => g.opponent_logo_url), ...report.gpsGames.map((g) => g.opponent_logo_url)].filter((u): u is string => !!u)),
  ];
  const logos = new Map<string, string | null>(await Promise.all(logoUrls.map(async (u) => [u, await loadImage(u, opts.imageProxy)] as [string, string | null])));
  const logoByDate = new Map<string, string | null | undefined>();
  for (const g of report.match.games) logoByDate.set(g.game_date, g.opponent_logo_url);
  for (const g of report.gpsGames) if (g.opponent_logo_url) logoByDate.set(g.game_date, g.opponent_logo_url);

  // ---- Drawing helpers ----
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (size: number, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
  };
  const paintBackground = () => {
    fill(INK);
    doc.rect(0, 0, W, H, "F");
  };
  const card = (x: number, y: number, w: number, h: number, bg: RGB = SURFACE) => {
    fill(bg);
    stroke(BORDER);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, w, h, 8, 8, "FD");
  };
  /** The FAU badge: the app icon (red rounded square, white FAU, underline). */
  const fauBadge = (x: number, y: number, s: number) => {
    fill(RED);
    doc.roundedRect(x, y, s, s, s * 0.2, s * 0.2, "F");
    color([255, 255, 255]);
    font(s * 0.36, "bold");
    doc.text("FAU", x + s / 2, y + s * 0.56, { align: "center" });
    fill([255, 160, 175]);
    doc.rect(x + s * 0.28, y + s * 0.68, s * 0.44, s * 0.04, "F");
  };
  /** An opponent's logo, or their initials in a rounded tile like the site's fallback. */
  const teamLogo = (url: string | null | undefined, opponent: string | null, x: number, y: number, s: number) => {
    const img = url ? logos.get(url) : null;
    if (img) {
      try {
        const { width, height } = doc.getImageProperties(img);
        const k = Math.min(s / width, s / height);
        doc.addImage(img, x + (s - width * k) / 2, y + (s - height * k) / 2, width * k, height * k, undefined, "FAST");
        return;
      } catch {
        // fall through to initials
      }
    }
    fill(RAISED);
    doc.roundedRect(x, y, s, s, s * 0.2, s * 0.2, "F");
    color(DIM);
    font(s * 0.36, "bold");
    doc.text(initials(cleanOpponent(opponent)), x + s / 2, y + s * 0.62, { align: "center" });
  };
  const heading = (text: string, y: number, sub?: string) => {
    fill(RED);
    doc.rect(M, y - 10, 3, 13, "F");
    color(TEXT);
    font(12, "bold");
    doc.text(text.toUpperCase(), M + 9, y);
    if (sub) {
      color(DIM);
      font(7.5);
      doc.text(sub, M + 9, y + 12, { maxWidth: W - 2 * M - 9 });
    }
    return y + (sub ? 24 : 12);
  };
  /** Thin header on inner pages: badge, report title, player. */
  const pageHeader = () => {
    fauBadge(M, 18, 22);
    color(DIM);
    font(7.5, "bold");
    doc.text("FAU MEN'S SOCCER  ·  PLAYER REPORT", M + 30, 32);
    color(TEXT);
    font(10, "bold");
    doc.text(`${jersey ? `#${jersey}  ` : ""}${name}`, W - M, 32, { align: "right" });
    fill(RED);
    doc.rect(M, 46, W - 2 * M, 1.2, "F");
  };
  const newPage = () => {
    doc.addPage();
    paintBackground();
    pageHeader();
    return 72;
  };
  const darkTable = {
    theme: "plain" as const,
    styles: { fontSize: 8, cellPadding: 4, textColor: TEXT, lineColor: BORDER, lineWidth: 0, fillColor: SURFACE, valign: "middle" as const },
    headStyles: { fillColor: RAISED, textColor: DIM, fontStyle: "bold" as const, fontSize: 7 },
    alternateRowStyles: { fillColor: [17, 19, 23] as RGB },
    willDrawPage: (d: { pageNumber: number }) => {
      // autoTable's own new pages: paint them dark and add the header before the rows draw.
      if (d.pageNumber > 1) {
        paintBackground();
        pageHeader();
      }
    },
    margin: { left: M, right: M, top: 64, bottom: 44 },
  };

  // ==== Page 1: cover ===================================================================
  paintBackground();
  // Hero band
  fill(SURFACE);
  doc.rect(0, 0, W, 214, "F");
  fill(RED);
  doc.rect(0, 214, W, 3, "F");
  doc.rect(0, 0, 6, 214, "F");
  fauBadge(M, 26, 34);
  color(DIM);
  font(8, "bold");
  doc.text("FAU MEN'S SOCCER", M + 44, 39);
  font(8);
  doc.text(`PLAYER REPORT  ·  ${fmtDate(report.range.from, { month: "short", year: "numeric" })} – ${fmtDate(report.range.to, { month: "short", year: "numeric" })}`, M + 44, 51);

  // Photo, right, in a card with a red ring
  const photoBox = { x: W - M - 132, y: 24, w: 132, h: 166 };
  card(photoBox.x, photoBox.y, photoBox.w, photoBox.h, RAISED);
  if (photo) {
    try {
      const { width, height } = doc.getImageProperties(photo);
      const k = Math.min((photoBox.w - 8) / width, (photoBox.h - 8) / height);
      doc.addImage(photo, photoBox.x + (photoBox.w - width * k) / 2, photoBox.y + (photoBox.h - height * k) / 2, width * k, height * k, undefined, "FAST");
    } catch {
      // keep the empty card
    }
  } else {
    color(DIM);
    font(30, "bold");
    doc.text(initials(name), photoBox.x + photoBox.w / 2, photoBox.y + photoBox.h / 2 + 10, { align: "center" });
  }
  stroke(RED);
  doc.setLineWidth(1.5);
  doc.roundedRect(photoBox.x, photoBox.y, photoBox.w, photoBox.h, 8, 8, "S");

  // Name, number, facts
  let x = M;
  if (jersey) {
    color(RED_LIGHT);
    font(34, "bold");
    doc.text(`#${jersey}`, M, 104);
    x = M + doc.getTextWidth(`#${jersey}`) + 10;
  }
  color(TEXT);
  font(name.length > 18 ? 24 : 30, "bold");
  doc.text(name, x, 104, { maxWidth: photoBox.x - x - 12 });
  const position = p?.position_long || p?.position_short || "";
  const year = p?.academic_year_long || p?.academic_year || "";
  color(RED_LIGHT);
  font(10, "bold");
  doc.text([position, year].filter(Boolean).join("  ·  ").toUpperCase(), M, 124);
  const height = p?.height_feet ? `${p.height_feet}'${p.height_inches ?? 0}" (${Math.round((p.height_feet * 12 + (p.height_inches ?? 0)) * 2.54)} cm)` : null;
  const weight = p?.weight ? `${p.weight} lbs (${Math.round(p.weight * 0.4536)} kg)` : null;
  const facts = (
    [
      ["Height", height],
      ["Weight", weight],
      ["Hometown", p?.hometown],
      ["Previous school", p?.previous_school || p?.high_school],
    ] as [string, string | null | undefined][]
  ).filter(([, v]) => v) as [string, string][];
  facts.forEach(([k, v], i) => {
    const fx = M + (i % 2) * 175;
    const fy = 146 + Math.floor(i / 2) * 28;
    color(DIM);
    font(7, "bold");
    doc.text(k.toUpperCase(), fx, fy);
    color(TEXT);
    font(9.5);
    doc.text(String(v), fx, fy + 12, { maxWidth: 165 });
  });

  // Match-stat tiles (two rows of five)
  let y = 244;
  y = heading("Match stats", y, `${longDate(report.range.from)} – ${longDate(report.range.to)}  ·  ${report.trackedGames} games with GPS data`);
  const t = report.match.totals;
  const tiles: [string, string, RGB][] = [
    ["Games", String(t.played), TEXT],
    ["Starts", String(t.started), TEXT],
    ["Minutes", t.minutes.toLocaleString("en-US"), TEXT],
    ["Goals", String(t.goals), RED_LIGHT],
    ["Assists", String(t.assists), RED_LIGHT],
    ["Points", String(t.points), GOLD],
    ["Shots", String(t.shots), TEXT],
    ["On goal", String(t.shots_on_goal), TEXT],
    [t.saves != null ? "Saves" : "Yellow cards", String(t.saves ?? t.yellow_cards), t.saves != null ? TEAL : GOLD],
    ["Red cards", String(t.red_cards), t.red_cards ? RED_LIGHT : TEXT],
  ];
  const tileW = (W - 2 * M - 4 * 8) / 5;
  tiles.forEach(([label, value, c], i) => {
    const tx = M + (i % 5) * (tileW + 8);
    const ty = y + Math.floor(i / 5) * 58;
    card(tx, ty, tileW, 50);
    color(DIM);
    font(6.5, "bold");
    doc.text(label.toUpperCase(), tx + 10, ty + 15);
    color(c);
    font(19, "bold");
    doc.text(value, tx + 10, ty + 39);
  });
  y += 2 * 58 + 20;

  // Physical profile
  y = heading("Physical profile (GPS)", y, "Average per game and season best, against the team. Rank among teammates with enough tracked games.");
  autoTable(doc, {
    ...darkTable,
    startY: y,
    head: [["", "Avg per game", "Season best", "Team avg", "vs team", "Rank"]],
    body: report.physical.map((m) => [
      m.label,
      withUnit(m.avg, m.unit, m.decimals),
      m.best == null ? "–" : `${short(m.best, m.unit, m.decimals)}${m.bestGame ? `  ·  ${fmtDate(m.bestGame.date)} ${cleanOpponent(m.bestGame.opponent)}` : ""}`,
      short(m.teamAvg, m.unit, m.decimals),
      pctText(diffPct(m.avg, m.teamAvg)),
      m.rank ? `${ordinal(m.rank)} / ${m.of}` : "–",
    ]),
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 92 }, 4: { halign: "right", cellWidth: 48 }, 5: { halign: "center", cellWidth: 60, fontStyle: "bold" } },
    didParseCell: (c: CellHookData) => {
      if (c.section !== "body") return;
      const m = report.physical[c.row.index];
      if (c.column.index === 4) c.cell.styles.textColor = pctColor(diffPct(m.avg, m.teamAvg));
      if (c.column.index === 5 && m.rank) c.cell.styles.textColor = m.rank <= 3 ? GOLD : m.rank <= 5 ? TEAL : TEXT;
    },
  });

  // ==== Page 2: season trends + game by game ================================================
  y = newPage();
  y = heading("Season trends", y, "His number each game (red) against the team average that game (grey, dashed).");
  const trend = report.gpsGames.filter((g) => !g.glitch);
  const charts = ["distance_mi", "top_speed_mph", "sprints_count", "load"]
    .map((k) => report.physical.find((m) => m.key === k))
    .filter((m): m is PlayerReport["physical"][number] => !!m);
  const cw = (W - 2 * M - 12) / 2;
  const ch = 132;
  charts.forEach((m, i) => {
    const cx = M + (i % 2) * (cw + 12);
    const cy = y + Math.floor(i / 2) * (ch + 12);
    card(cx, cy, cw, ch);
    color(TEXT);
    font(9, "bold");
    doc.text(m.label, cx + 12, cy + 18);
    color(DIM);
    font(7);
    doc.text(`avg ${short(m.avg, m.unit, m.decimals)}  ·  team ${short(m.teamAvg, m.unit, m.decimals)}`, cx + cw - 12, cy + 18, { align: "right" });
    const px = cx + 30;
    const py = cy + 30;
    const pw = cw - 44;
    const ph = ch - 56;
    const vals = trend.flatMap((g) => [g.metrics[m.key]?.value, g.metrics[m.key]?.teamAvg]).filter((v): v is number => v != null);
    if (vals.length < 2) {
      color(DIM);
      doc.text("Not enough games yet.", cx + 12, cy + 60);
      return;
    }
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    lo = m.key === "top_speed_mph" ? Math.floor(lo - 1) : 0;
    hi = hi + (hi - lo) * 0.1 || 1;
    const sx = (gi: number) => px + (trend.length === 1 ? pw / 2 : (gi / (trend.length - 1)) * pw);
    const sy = (v: number) => py + ph - ((v - lo) / (hi - lo)) * ph;
    stroke(BORDER);
    doc.setLineWidth(0.4);
    for (let gI = 0; gI <= 2; gI++) {
      const gv = lo + ((hi - lo) * gI) / 2;
      doc.line(px, sy(gv), px + pw, sy(gv));
      color(DIM);
      font(6);
      doc.text(fixed(gv, m.decimals > 1 ? 1 : 0), px - 4, sy(gv) + 2, { align: "right" });
    }
    const line = (key: "value" | "teamAvg", c: RGB, width: number, dash: boolean) => {
      stroke(c);
      doc.setLineWidth(width);
      doc.setLineDashPattern(dash ? [2, 2] : [], 0);
      let prev: [number, number] | null = null;
      trend.forEach((g, gi) => {
        const v = g.metrics[m.key]?.[key];
        if (v == null) {
          prev = null;
          return;
        }
        const pt: [number, number] = [sx(gi), sy(v)];
        if (prev) doc.line(prev[0], prev[1], pt[0], pt[1]);
        prev = pt;
      });
      doc.setLineDashPattern([], 0);
    };
    line("teamAvg", TEAM_BAR, 1, true);
    line("value", RED_LIGHT, 1.6, false);
    fill(RED_LIGHT);
    trend.forEach((g, gi) => {
      const v = g.metrics[m.key]?.value;
      if (v != null) doc.circle(sx(gi), sy(v), 1.6, "F");
    });
    color(DIM);
    font(6);
    doc.text(fmtDate(trend[0].game_date), px, py + ph + 10);
    doc.text(fmtDate(trend[trend.length - 1].game_date), px + pw, py + ph + 10, { align: "right" });
  });
  y += 2 * (ch + 12) + 18;

  // Game by game: everything together
  y = heading("Game by game", y, "Match stats and GPS for every game in one place.");
  const gps = new Map(report.gpsGames.map((g) => [g.game_date, g]));
  const dates = [...new Set([...report.match.games.map((g) => g.game_date), ...report.gpsGames.map((g) => g.game_date)])].sort();
  const val = (d: string, k: string, dec: number) => {
    const s = gps.get(d);
    if (!s) return "";
    if (s.glitch) return "*";
    return fixed(s.metrics[k]?.value, dec);
  };
  const phys = (k: string) => report.physical.find((m) => m.key === k);
  autoTable(doc, {
    ...darkTable,
    startY: y,
    head: [["Date", "", "Opponent", "Res", "Min", "G", "A", "Dist mi", "Top mph", "Sprints", "Spr yd", "Accel", "Decel", "Expl", "Load"]],
    body: dates.map((d) => {
      const g = report.match.games.find((x) => x.game_date === d);
      const s = gps.get(d);
      return [
        fmtDate(d),
        "",
        cleanOpponent(g?.opponent ?? s?.opponent ?? ""),
        g?.result ?? s?.result ?? "",
        g?.minutes != null ? String(Math.round(g.minutes)) : s?.minutes != null ? String(Math.round(s.minutes)) : "",
        g ? String(g.goals) : "",
        g ? String(g.assists) : "",
        val(d, "distance_mi", 2),
        val(d, "top_speed_mph", 1),
        val(d, "sprints_count", 0),
        val(d, "sprints_distance_yd", 0),
        val(d, "peak_accel", 1),
        val(d, "peak_decel", 1),
        val(d, "explosiveness_count", 0),
        val(d, "load", 0),
      ];
    }),
    foot: [
      [
        "Season",
        "",
        `${t.played} games`,
        "",
        t.minutes.toLocaleString("en-US"),
        String(t.goals),
        String(t.assists),
        `avg ${fixed(phys("distance_mi")?.avg, 2)}`,
        `max ${fixed(phys("top_speed_mph")?.best, 1)}`,
        `avg ${fixed(phys("sprints_count")?.avg, 0)}`,
        `avg ${fixed(phys("sprints_distance_yd")?.avg, 0)}`,
        `max ${fixed(phys("peak_accel")?.best, 1)}`,
        `max ${fixed(phys("peak_decel")?.best, 1)}`,
        `avg ${fixed(phys("explosiveness_count")?.avg, 0)}`,
        `avg ${fixed(phys("load")?.avg, 0)}`,
      ],
    ],
    showFoot: "lastPage",
    styles: { ...darkTable.styles, fontSize: 7, cellPadding: 3, halign: "center" },
    headStyles: { ...darkTable.headStyles, fontSize: 6.5, halign: "center" },
    footStyles: { fillColor: RAISED, textColor: GOLD, fontStyle: "bold", fontSize: 6.5, halign: "center" },
    columnStyles: { 0: { halign: "left", cellWidth: 34 }, 1: { cellWidth: 16 }, 2: { halign: "left", cellWidth: 82 }, 3: { halign: "left", cellWidth: 36 } },
    didParseCell: (c: CellHookData) => {
      if (c.section !== "body") return;
      if (c.column.index === 3) {
        const r = String(c.cell.raw ?? "");
        c.cell.styles.textColor = r.startsWith("W") ? TEAL : r.startsWith("L") ? RED_LIGHT : r.startsWith("T") ? GOLD : TEXT;
        c.cell.styles.fontStyle = "bold";
      }
      if ((c.column.index === 5 || c.column.index === 6) && Number(c.cell.raw) > 0) {
        c.cell.styles.textColor = RED_LIGHT;
        c.cell.styles.fontStyle = "bold";
      }
    },
    didDrawCell: (c: CellHookData) => {
      if (c.section === "body" && c.column.index === 1) {
        const d = dates[c.row.index];
        const g = report.match.games.find((x) => x.game_date === d);
        const s = gps.get(d);
        teamLogo(logoByDate.get(d), g?.opponent ?? s?.opponent ?? null, c.cell.x + 2, c.cell.y + (c.cell.height - 11) / 2, 11);
      }
    },
  });
  y = lastY() + 10;
  if (report.gpsGames.some((g) => g.glitch)) {
    color(DIM);
    font(6.5);
    doc.text("* tracker glitch that game (an impossible top speed): left out of averages.", M, y);
  }

  // ==== Game pages: two games a page ========================================================
  const perPage = 2;
  const top0 = 72;
  const cardH = (H - top0 - 44 - 14) / perPage;
  report.gpsGames.forEach((g, i) => {
    if (i % perPage === 0) newPage();
    const cy = top0 + (i % perPage) * (cardH + 14);
    card(M, cy, W - 2 * M, cardH);
    // Card header: logo, opponent, date, result, minutes, goals/assists
    teamLogo(g.opponent_logo_url ?? logoByDate.get(g.game_date), g.opponent, M + 14, cy + 14, 34);
    color(TEXT);
    font(15, "bold");
    doc.text(`vs ${cleanOpponent(g.opponent)}`, M + 58, cy + 30);
    color(DIM);
    font(8);
    const sub = [
      fmtDate(g.game_date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
      g.minutes != null ? `${Math.round(g.minutes)} min${g.started ? " · started" : ""}` : null,
      g.goals ? `${g.goals} goal${g.goals > 1 ? "s" : ""}` : null,
      g.assists ? `${g.assists} assist${g.assists > 1 ? "s" : ""}` : null,
    ]
      .filter(Boolean)
      .join("   ·   ");
    doc.text(sub, M + 58, cy + 44);
    if (g.result) {
      const rc = g.result.startsWith("W") ? TEAL : g.result.startsWith("L") ? RED_LIGHT : GOLD;
      font(10, "bold");
      const rw = doc.getTextWidth(g.result) + 18;
      fill(RAISED);
      stroke(rc);
      doc.setLineWidth(1);
      doc.roundedRect(W - M - 14 - rw, cy + 16, rw, 20, 10, 10, "FD");
      color(rc);
      doc.text(g.result, W - M - 14 - rw / 2, cy + 30, { align: "center" });
    }
    if (g.glitch) {
      color(GOLD);
      font(7.5, "bold");
      doc.text("Tracker glitch this game (impossible top speed): not counted in averages.", M + 58, cy + 56);
    }
    // Legend
    const ly = cy + 68;
    fill(RED_LIGHT);
    doc.rect(M + 14, ly - 5, 10, 5, "F");
    color(DIM);
    font(7);
    doc.text(name.split(" ")[0], M + 28, ly);
    const lx = M + 28 + doc.getTextWidth(name.split(" ")[0]) + 14;
    fill(TEAM_BAR);
    doc.rect(lx, ly - 5, 10, 5, "F");
    doc.text("Team average this game", lx + 14, ly);
    // Bars: one row per metric, him vs the team
    const rows = report.physical;
    const top = ly + 8;
    const rowH = (cardH - (top - cy) - 12) / rows.length;
    const labelW = 96;
    const barX = M + 14 + labelW;
    const pctW = 44;
    const valW = 74;
    const barW = W - 2 * M - 28 - labelW - pctW - valW;
    rows.forEach((m, r) => {
      const ry = top + r * rowH;
      const v = g.metrics[m.key]?.value ?? null;
      const tv = g.metrics[m.key]?.teamAvg ?? null;
      const max = Math.max(v ?? 0, tv ?? 0) * 1.08 || 1;
      const mid = ry + rowH / 2;
      color(TEXT);
      font(7.5, "bold");
      doc.text(m.label, M + 14, mid + 2.5);
      const bh = Math.max(3, Math.min(6, rowH / 2 - 2.5));
      fill(RAISED);
      doc.rect(barX, mid - bh - 1, barW, bh * 2 + 2, "F");
      if (v != null) {
        fill(RED_LIGHT);
        doc.rect(barX, mid - bh - 0.5, Math.max(1, (v / max) * barW), bh, "F");
      }
      if (tv != null) {
        fill(TEAM_BAR);
        doc.rect(barX, mid + 0.5, Math.max(1, (tv / max) * barW), bh, "F");
      }
      color(TEXT);
      font(7, "bold");
      doc.text(short(v, m.unit, m.decimals), barX + barW + 6, mid - 1);
      color(DIM);
      font(6.5);
      doc.text(short(tv, m.unit, m.decimals), barX + barW + 6, mid + 6.5);
      const pc = diffPct(v, tv);
      color(pctColor(pc));
      font(8, "bold");
      doc.text(pctText(pc), W - M - 14, mid + 2.5, { align: "right" });
    });
  });

  // ==== Footer on every page ==============================================================
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    fill(BORDER);
    doc.rect(M, H - 30, W - 2 * M, 0.6, "F");
    fauBadge(M, H - 23, 12);
    color(DIM);
    font(7);
    doc.text(`FAU Men's Soccer  ·  ${name}  ·  Generated ${longDate(report.generated)}  ·  GPS by Titan`, M + 18, H - 14);
    doc.text(`${i} / ${pages}`, W - M, H - 14, { align: "right" });
  }

  return doc.output("blob");
}
