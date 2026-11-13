import { jsPDF } from "jspdf";
import autoTable, { type CellHookData } from "jspdf-autotable";
import type { PlayerReport } from "../types";
import { ordinal } from "./ordinal";
import { FAU_LOGO_URL } from "./fau";

/**
 * The player's season report as a PDF, styled like the app (dark pages, Owl red,
 * gold and teal, the site's Space Grotesk and Inter fonts), to send to coaches
 * and agents:
 *  1. Cover: photo and profile, match-stat tiles, a percentile radar of the
 *     physical profile (grouped into volume, speed and intensity, with the team
 *     and position averages), and highlights in plain words.
 *  2. Physical profile (per game, against the team and the position) and
 *     season trend charts.
 *  3. Match involvement charts and the full game-by-game table.
 *  4. A page per game: the player against the rest of the squad, and where the
 *     player ranked in the squad that game (teammates anonymous).
 * Built in the browser; photos and logos come through the server when the
 * browser can't read them directly.
 */

type RGB = [number, number, number];
type Metric = PlayerReport["physical"][number];
type GpsGame = PlayerReport["gpsGames"][number];
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
const rankColor = (r: number | null): RGB => (r == null ? DIM : r <= 3 ? GOLD : r <= 5 ? TEAL : TEXT);

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

interface ImageOptions {
  /** Longest side, in pixels, to draw SVGs at (they scale up cleanly) or to keep photos at (never scaled up). */
  size?: number;
  /** Save as high-quality JPEG (photos) instead of PNG (logos keep their transparent background). */
  jpeg?: boolean;
}

/** PNG/JPEG go in as they are; anything else (SVG, WebP) is redrawn in the browser at a high resolution. */
async function toPdfImage(dataUrl: string, { size = 600, jpeg = false }: ImageOptions = {}): Promise<string | null> {
  if (/^data:image\/(png|jpe?g)/i.test(dataUrl)) return dataUrl;
  if (typeof document === "undefined") return null;
  const vector = /^data:image\/svg/i.test(dataUrl);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || size;
      const h = img.naturalHeight || size;
      // Vectors are drawn at the full size (sharp at any scale); photos are only ever shrunk, never blown up.
      const scale = vector ? Math.min(size / w, size / h) : Math.min(1, size / w, size / h);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, c.width, c.height);
      try {
        resolve(jpeg ? c.toDataURL("image/jpeg", 0.92) : c.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function loadImage(url: string | null | undefined, proxy: string | undefined, opts: ImageOptions = {}): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return toPdfImage(url, opts);
  for (const src of [url, proxy ? `${proxy}?src=${encodeURIComponent(url)}` : null]) {
    if (!src) continue;
    try {
      const res = await fetch(src, { mode: src === url ? "cors" : "same-origin" });
      if (!res.ok) continue;
      const data = await blobToDataUrl(await res.blob());
      const img = data ? await toPdfImage(data, opts) : null;
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

/** Highlights in plain words, strongest first. */
function highlights(report: PlayerReport, first: string): { text: string; color: RGB }[] {
  const out: { text: string; color: RGB }[] = [];
  const t = report.match.totals;
  const pos = report.position?.label;
  if (t.goals || t.assists) {
    out.push({ text: `${t.goals} goal${t.goals === 1 ? "" : "s"} and ${t.assists} assist${t.assists === 1 ? "" : "s"} in ${t.played} games`, color: RED_LIGHT });
  }
  out.push({ text: `${t.played} games, ${t.minutes.toLocaleString("en-US")} minutes, ${t.started} start${t.started === 1 ? "" : "s"}`, color: DIM });
  const named = new Set<string>();
  const byRank = [...report.physical].filter((m) => m.rank && m.rank <= 3).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  for (const m of byRank.slice(0, 3)) {
    out.push({ text: `${ordinal(m.rank!)} on the team in ${m.label.toLowerCase()} (${short(m.avg, m.unit, m.decimals)} a game)`, color: GOLD });
    named.add(m.key);
  }
  if (pos) {
    for (const m of report.physical.filter((x) => x.posRank === 1 && !named.has(x.key)).slice(0, 2)) {
      out.push({ text: `Best among the ${pos} in ${m.label.toLowerCase()}`, color: TEAL });
      named.add(m.key);
    }
  }
  const speed = report.physical.find((m) => m.key === "top_speed_mph");
  if (speed?.best != null && speed.bestGame) {
    out.push({ text: `Top speed ${withUnit(speed.best, "mph", 1)}, ${fmtDate(speed.bestGame.date)} vs ${cleanOpponent(speed.bestGame.opponent)}`, color: TEXT });
  }
  const big = report.gpsGames.filter((g) => !g.glitch).sort((a, b) => (b.metrics.load?.value ?? 0) - (a.metrics.load?.value ?? 0))[0];
  if (big) {
    out.push({
      text: `Biggest game: ${short(big.metrics.distance_mi?.value, "mi", 2)} and ${fixed(big.metrics.sprints_count?.value, 0)} sprints vs ${cleanOpponent(big.opponent)}, ${fmtDate(big.game_date)}`,
      color: TEXT,
    });
  }
  const above = report.physical.filter((m) => m.avg != null && m.teamAvg != null && m.avg > m.teamAvg).length;
  out.push({ text: `${first} is above the team average in ${above} of ${report.physical.length} physical numbers`, color: above >= report.physical.length / 2 ? TEAL : DIM });
  return out.slice(0, 8);
}

// ---- The document ---------------------------------------------------------------------

export async function playerReportPdf(report: PlayerReport, opts: { imageProxy?: string } = {}): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const p = report.profile;
  const name = report.player.canonical_name;
  const first = name.split(" ")[0];
  const jersey = report.player.jersey_number;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // The site's fonts (Inter for text, Space Grotesk for headings), when they load.
  let BODY = "helvetica";
  let DISPLAY = "helvetica";
  try {
    const { PDF_FONTS } = await import("./pdfFonts");
    for (const [file, dataUrl] of Object.entries(PDF_FONTS)) doc.addFileToVFS(file, dataUrl.slice(dataUrl.indexOf(",") + 1));
    doc.addFont("Inter-Regular.ttf", "Inter", "normal");
    doc.addFont("Inter-Bold.ttf", "Inter", "bold");
    doc.addFont("SpaceGrotesk-Bold.ttf", "Grotesk", "bold");
    BODY = "Inter";
    DISPLAY = "Grotesk";
  } catch {
    // standard font
  }

  // Images first (photo + every opponent logo, each fetched once).
  // Photo: kept at its full detail (the roster's is 1600x2000) as a high-quality JPEG; logos are vectors drawn big.
  const photo = await loadImage(p?.photo_url, opts.imageProxy, { size: 1600, jpeg: true });
  const fauLogoImg = await loadImage(FAU_LOGO_URL, opts.imageProxy, { size: 1000 });
  const logoUrls = [
    ...new Set([...report.match.games.map((g) => g.opponent_logo_url), ...report.gpsGames.map((g) => g.opponent_logo_url)].filter((u): u is string => !!u)),
  ];
  const logos = new Map<string, string | null>(await Promise.all(logoUrls.map(async (u) => [u, await loadImage(u, opts.imageProxy, { size: 700 })] as [string, string | null])));
  const logoByDate = new Map<string, string | null | undefined>();
  for (const g of report.match.games) logoByDate.set(g.game_date, g.opponent_logo_url);
  for (const g of report.gpsGames) if (g.opponent_logo_url) logoByDate.set(g.game_date, g.opponent_logo_url);

  // ---- Drawing helpers ----
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (size: number, style: "normal" | "bold" = "normal") => {
    doc.setFont(BODY, style);
    doc.setFontSize(size);
  };
  const display = (size: number) => {
    doc.setFont(DISPLAY, "bold");
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
    display(s * 0.36);
    doc.text("FAU", x + s / 2, y + s * 0.56, { align: "center" });
    fill([255, 160, 175]);
    doc.rect(x + s * 0.28, y + s * 0.68, s * 0.44, s * 0.04, "F");
  };
  /** FAU's logo in an s-by-s box (nothing if it couldn't be loaded). Returns whether it was drawn. */
  const fauLogo = (x: number, y: number, s: number): boolean => {
    if (!fauLogoImg) return false;
    try {
      const { width, height } = doc.getImageProperties(fauLogoImg);
      const k = Math.min(s / width, s / height);
      doc.addImage(fauLogoImg, x + (s - width * k) / 2, y + (s - height * k) / 2, width * k, height * k, undefined, "FAST");
      return true;
    } catch {
      return false;
    }
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
    display(s * 0.36);
    doc.text(initials(cleanOpponent(opponent)), x + s / 2, y + s * 0.62, { align: "center" });
  };
  const heading = (text: string, y: number, sub?: string) => {
    fill(RED);
    doc.rect(M, y - 10, 3, 13, "F");
    color(TEXT);
    display(12.5);
    doc.text(text.toUpperCase(), M + 9, y);
    if (sub) {
      color(DIM);
      font(7.5);
      doc.text(sub, M + 9, y + 12, { maxWidth: W - 2 * M - 9 });
    }
    return y + (sub ? 24 : 12);
  };
  const cardTitle = (text: string, x: number, y: number) => {
    color(TEXT);
    display(9.5);
    doc.text(text, x, y);
  };
  /** Thin header on inner pages: badge, report title, player. */
  const pageHeader = () => {
    fauBadge(M, 18, 22);
    color(DIM);
    font(7.5, "bold");
    doc.text("FAU MEN'S SOCCER  ·  PLAYER REPORT", M + 30, 32);
    color(TEXT);
    display(11);
    const who = `${jersey ? `#${jersey}  ` : ""}${name}`;
    doc.text(who, W - M, 32, { align: "right" });
    // FAU's logo just before the player's number and name.
    fauLogo(W - M - doc.getTextWidth(who) - 8 - 26, 17, 26);
    fill(RED);
    doc.rect(M, 46, W - 2 * M, 1.2, "F");
  };
  const newPage = () => {
    doc.addPage();
    paintBackground();
    pageHeader();
    return 72;
  };
  const darkTable = () => ({
    theme: "plain" as const,
    styles: { font: BODY, fontSize: 8, cellPadding: 4, textColor: TEXT, lineColor: BORDER, lineWidth: 0, fillColor: SURFACE, valign: "middle" as const },
    headStyles: { font: BODY, fillColor: RAISED, textColor: DIM, fontStyle: "bold" as const, fontSize: 7 },
    alternateRowStyles: { fillColor: [17, 19, 23] as RGB },
    willDrawPage: (d: { pageNumber: number }) => {
      // autoTable's own new pages: paint them dark and add the header before the rows draw.
      if (d.pageNumber > 1) {
        paintBackground();
        pageHeader();
      }
    },
    margin: { left: M, right: M, top: 64, bottom: 44 },
  });
  const legend = (x: number, y: number, items: [string, RGB, boolean?][]) => {
    let lx = x;
    font(7);
    for (const [label, c, dashed] of items) {
      if (dashed) {
        stroke(c);
        doc.setLineWidth(1);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(lx, y - 2.5, lx + 12, y - 2.5);
        doc.setLineDashPattern([], 0);
      } else {
        fill(c);
        doc.rect(lx, y - 5, 10, 5, "F");
      }
      color(DIM);
      doc.text(label, lx + 15, y);
      lx += 15 + doc.getTextWidth(label) + 14;
    }
  };

  // ---- Percentile radar --------------------------------------------------------------
  const GROUPS: { key: Metric["group"]; label: string; tint: RGB }[] = [
    { key: "volume", label: "VOLUME", tint: [96, 165, 250] },
    { key: "speed", label: "SPEED", tint: [192, 132, 252] },
    { key: "intensity", label: "INTENSITY", tint: [251, 146, 60] },
  ];
  const posName = report.position ? report.position.label[0].toUpperCase() + report.position.label.slice(1) : null;
  const percentileText = (p: number | null | undefined) => (p == null ? "–" : ordinal(Math.round(p)));
  const withAlpha = (opacity: number, draw: () => void) => {
    const GState = (doc as unknown as { GState: new (o: object) => unknown }).GState;
    const set = (doc as unknown as { setGState: (g: unknown) => void }).setGState.bind(doc);
    try {
      set(new GState({ opacity }));
      draw();
    } catch {
      // no transparency support: skip the fill
    } finally {
      try {
        set(new GState({ opacity: 1 }));
      } catch {
        // ignore
      }
    }
  };
  const polygon = (pts: [number, number][], style: "F" | "S") =>
    doc.lines(
      pts.slice(1).map((p2, i) => [p2[0] - pts[i][0], p2[1] - pts[i][1]]),
      pts[0][0],
      pts[0][1],
      [1, 1],
      style,
      true,
    );
  /**
   * Percentile radar: each spoke is a physical number, 0 (centre) to 100 (edge = best on the
   * team), grouped into volume, speed and intensity. His shape is red, the team average grey,
   * his position's average dashed teal. Every spoke prints his number and percentile.
   */
  const drawRadar = (x: number, y: number, w: number, h: number, title: string) => {
    card(x, y, w, h);
    cardTitle(title, x + 12, y + 18);
    const ms = report.physical;
    const n = ms.length;
    const cx = x + w / 2;
    const cy = y + 30 + (h - 30 - 26) / 2;
    const R = Math.min(w / 2 - 62, (h - 30 - 26) / 2 - 28);
    const angle = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
    const at = (a: number, r: number): [number, number] => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const radius = (p: number | null) => R * (0.06 + 0.94 * Math.max(0, Math.min(100, p ?? 0)) / 100);
    const step = (Math.PI * 2) / n;

    // Group wedges, tinted, with their names just outside the ring.
    for (const g of GROUPS) {
      const idx = ms.map((m, i) => (m.group === g.key ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) continue;
      const a0 = angle(idx[0]) - step / 2;
      const a1 = angle(idx[idx.length - 1]) + step / 2;
      const arc: [number, number][] = [[cx, cy]];
      for (let k = 0; k <= 16; k++) arc.push(at(a0 + ((a1 - a0) * k) / 16, R));
      withAlpha(0.11, () => {
        fill(g.tint);
        polygon(arc, "F");
      });
    }
    // Rings at 25 / 50 / 75 / 100 and the spokes.
    stroke(BORDER);
    doc.setLineWidth(0.5);
    for (const ring of [25, 50, 75, 100]) {
      const pts: [number, number][] = [];
      for (let k = 0; k <= 48; k++) pts.push(at((k / 48) * Math.PI * 2, radius(ring)));
      polygon(pts, "S");
    }
    ms.forEach((_, i) => {
      const [ex, ey] = at(angle(i), R);
      doc.line(cx, cy, ex, ey);
    });
    // Group key, top right.
    {
      let gx = x + w - 12;
      font(6, "bold");
      for (const g of [...GROUPS].reverse()) {
        const tw = doc.getTextWidth(g.label);
        color(g.tint);
        doc.text(g.label, gx, y + 18, { align: "right" });
        fill(g.tint);
        doc.rect(gx - tw - 9, y + 13.5, 5, 5, "F");
        gx -= tw + 18;
      }
    }
    color(DIM);
    font(5);
    for (const ring of [50, 100]) doc.text(String(ring), cx + 2, cy - radius(ring) + 6);

    const shape = (key: "value" | "team" | "pos", c: RGB, width: number, opts: { fill?: boolean; dashed?: boolean } = {}) => {
      const vals = ms.map((m) => m.pct[key]);
      if (vals.every((v) => v == null)) return;
      const pts = ms.map((_, i) => at(angle(i), radius(vals[i])));
      if (opts.fill)
        withAlpha(0.28, () => {
          fill(c);
          polygon(pts, "F");
        });
      stroke(c);
      doc.setLineWidth(width);
      if (opts.dashed) doc.setLineDashPattern([2.5, 2], 0);
      polygon(pts, "S");
      doc.setLineDashPattern([], 0);
      if (key === "value")
        pts.forEach(([px, py]) => {
          fill(c);
          doc.circle(px, py, 1.6, "F");
        });
    };
    shape("team", TEAM_BAR, 1);
    if (posName) shape("pos", TEAL, 1, { dashed: true });
    shape("value", RED_LIGHT, 1.6, { fill: true });

    // Spoke labels: name, then his number and percentile.
    ms.forEach((m, i) => {
      const a = angle(i);
      const [lx, ly] = at(a, R + 10);
      const align = Math.abs(Math.cos(a)) < 0.25 ? "center" : Math.cos(a) > 0 ? "left" : "right";
      const dy = Math.sin(a) < -0.5 ? -8 : Math.sin(a) > 0.5 ? 4 : -2;
      const p = m.pct;
      const v = m.avg;
      color(TEXT);
      font(6.5, "bold");
      doc.text(m.label.replace("Sprint avg speed", "Sprint speed").replace("Explosive efforts", "Explosive"), lx, ly + dy, { align });
      font(6);
      color(p.value == null ? DIM : p.value >= 75 ? GOLD : p.value >= 50 ? TEAL : DIM);
      doc.text(`${short(v, m.unit, m.decimals)}  ·  ${percentileText(p.value)}`, lx, ly + dy + 8, { align });
    });

    legend(x + 12, y + h - 12, [
      [first, RED_LIGHT],
      ["Team avg", TEAM_BAR],
      ...(posName ? ([[`${posName} avg`, TEAL, true]] as [string, RGB, boolean][]) : []),
    ]);
  };

  // ==== Page 1: cover ===================================================================
  paintBackground();
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
    display(30);
    doc.text(initials(name), photoBox.x + photoBox.w / 2, photoBox.y + photoBox.h / 2 + 10, { align: "center" });
  }
  stroke(RED);
  doc.setLineWidth(1.5);
  doc.roundedRect(photoBox.x, photoBox.y, photoBox.w, photoBox.h, 8, 8, "S");

  // FAU's logo in the bio, just before the number and name.
  const nameX0 = fauLogo(M, 66, 46) ? M + 58 : M;
  let x = nameX0;
  if (jersey) {
    color(RED_LIGHT);
    display(36);
    doc.text(`#${jersey}`, nameX0, 104);
    x = nameX0 + doc.getTextWidth(`#${jersey}`) + 10;
  }
  color(TEXT);
  // The biggest size the name fits at, so the logo never pushes it onto a second line.
  const nameRoom = photoBox.x - x - 12;
  let nameSize = name.length > 18 ? 25 : 31;
  display(nameSize);
  while (nameSize > 16 && doc.getTextWidth(name) > nameRoom) {
    nameSize -= 1;
    display(nameSize);
  }
  doc.text(name, x, 104, { maxWidth: nameRoom });
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
    font(6.5, "bold");
    doc.text(k.toUpperCase(), fx, fy);
    color(TEXT);
    font(9.5);
    doc.text(String(v), fx, fy + 12, { maxWidth: 165 });
  });

  // Match-stat tiles (two rows of five)
  let y = 244;
  y = heading("Match stats", y, `${longDate(report.range.from)} – ${longDate(report.range.to)}  ·  ${report.trackedGames} games played with GPS data`);
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
    const ty = y + Math.floor(i / 5) * 56;
    card(tx, ty, tileW, 48);
    color(DIM);
    font(6.5, "bold");
    doc.text(label.toUpperCase(), tx + 10, ty + 15);
    color(c);
    display(19);
    doc.text(value, tx + 10, ty + 38);
  });
  y += 2 * 56 + 18;

  // Radar (left) and highlights (right)
  y = heading("Physical profile at a glance", y);
  const boxH = H - 44 - y - 4;
  const radarW = 292;
  drawRadar(M, y, radarW, boxH, `${first}'s percentiles, per game`);
  const hx = M + radarW + 10;
  const hw = W - M - hx;
  card(hx, y, hw, boxH);
  cardTitle("Highlights", hx + 12, y + 18);
  let hy = y + 38;
  for (const h of highlights(report, first)) {
    fill(h.color);
    doc.circle(hx + 15, hy - 3, 2.2, "F");
    color(TEXT);
    font(8.5);
    const lines = doc.splitTextToSize(h.text, hw - 36) as string[];
    doc.text(lines, hx + 24, hy);
    hy += lines.length * 11 + 7;
    if (hy > y + boxH - 10) break;
  }
  // Per game (his average, the team's, and his rank), anchored to the bottom of the highlights card when there's room.
  const PER_GAME_KEYS = ["distance_mi", "sprints_distance_yd", "load", "sprints_count", "explosiveness_count"];
  const perGame = report.physical.filter((m) => PER_GAME_KEYS.includes(m.key) && m.avg != null);
  const perGameH = 30 + perGame.length * 15;
  if (perGame.length && hy + 10 < y + boxH - perGameH) {
    let py = y + boxH - perGameH;
    stroke(BORDER);
    doc.setLineWidth(0.5);
    doc.line(hx + 12, py - 8, hx + hw - 12, py - 8);
    cardTitle("Per game", hx + 12, py + 8);
    color(DIM);
    font(6.5, "bold");
    doc.text(first.toUpperCase(), hx + hw - 104, py + 8, { align: "right" });
    doc.text("TEAM", hx + hw - 56, py + 8, { align: "right" });
    doc.text("RANK", hx + hw - 12, py + 8, { align: "right" });
    py += 24;
    for (const m of perGame) {
      color(TEXT);
      font(8);
      doc.text(m.label, hx + 12, py);
      font(8, "bold");
      color(rankColor(m.rank));
      doc.text(short(m.avg, m.unit, m.decimals), hx + hw - 104, py, { align: "right" });
      font(8);
      color(DIM);
      doc.text(short(m.teamAvg, m.unit, m.decimals), hx + hw - 56, py, { align: "right" });
      color(rankColor(m.rank));
      doc.text(m.rank ? `${ordinal(m.rank)}/${m.of}` : "–", hx + hw - 12, py, { align: "right" });
      py += 15;
    }
  }

  // ==== Page 2: physical profile + season trends ==========================================
  y = newPage();
  const posLabel = report.position ? report.position.label[0].toUpperCase() + report.position.label.slice(1) : null;
  y = heading(
    "Physical profile (GPS)",
    y,
    `Per game, and against the team${posLabel ? ` and the ${report.position!.label}` : ""}. Counts games played (box-score minutes); ranked against teammates with 3+ games.`,
  );
  autoTable(doc, {
    ...darkTable(),
    startY: y,
    head: [["", "Avg per game", "Season best", "Team avg", ...(posLabel ? [`${posLabel} avg`] : []), "Team rank", ...(posLabel ? ["Pos. rank"] : [])]],
    body: report.physical.map((m) => [
      m.label,
      withUnit(m.avg, m.unit, m.decimals),
      m.best == null ? "–" : `${short(m.best, m.unit, m.decimals)}${m.unit === "mi" ? ` (${fixed(m.best * KM_PER_MI, m.decimals)} km)` : ""}\n${m.bestGame ? `${fmtDate(m.bestGame.date)} ${cleanOpponent(m.bestGame.opponent)}` : ""}`,
      `${short(m.teamAvg, m.unit, m.decimals)}  ${pctText(diffPct(m.avg, m.teamAvg))}`,
      ...(posLabel ? [`${short(m.posAvg, m.unit, m.decimals)}  ${pctText(diffPct(m.avg, m.posAvg))}`] : []),
      m.rank ? `${ordinal(m.rank)} / ${m.of}` : "–",
      ...(posLabel ? [m.posRank ? `${ordinal(m.posRank)} / ${m.posOf}` : "–"] : []),
    ]),
    styles: { ...darkTable().styles, fontSize: 7.5, cellPadding: 3.5 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 82 } },
    didParseCell: (c: CellHookData) => {
      if (c.section !== "body") return;
      const m = report.physical[c.row.index];
      const rankCol = posLabel ? 5 : 4;
      if (c.column.index === rankCol) {
        c.cell.styles.textColor = rankColor(m.rank);
        c.cell.styles.fontStyle = "bold";
        c.cell.styles.halign = "center";
      }
      if (posLabel && c.column.index === 6) {
        c.cell.styles.textColor = rankColor(m.posRank);
        c.cell.styles.fontStyle = "bold";
        c.cell.styles.halign = "center";
      }
    },
  });
  y = lastY() + 9;
  color(DIM);
  font(6.5);
  doc.text(
    "GPS totals include warm-ups, so compare players' per-game numbers with the team's rather than with a 90-minute figure. Team and position averages count only games where players got minutes.",
    M,
    y,
    { maxWidth: W - 2 * M },
  );
  y += 22;

  y = heading("Season trends", y + 4, `${first}'s number each game (red) against the rest of the squad's average that game (grey, dashed).`);
  const trend = report.gpsGames.filter((g) => !g.glitch);
  const charts = ["distance_mi", "top_speed_mph", "sprints_count", "load"].map((k) => report.physical.find((m) => m.key === k)).filter((m): m is Metric => !!m);
  const cw = (W - 2 * M - 12) / 2;
  const ch = Math.min(130, (H - 44 - y - 12) / 2);
  charts.forEach((m, i) => {
    const cx = M + (i % 2) * (cw + 12);
    const cy = y + Math.floor(i / 2) * (ch + 12);
    card(cx, cy, cw, ch);
    cardTitle(m.label, cx + 12, cy + 18);
    color(DIM);
    font(7);
    doc.text(`avg ${short(m.avg, m.unit, m.decimals)}  ·  team ${short(m.teamAvg, m.unit, m.decimals)}`, cx + cw - 12, cy + 18, { align: "right" });
    const px = cx + 30;
    const py = cy + 28;
    const pw = cw - 44;
    const ph = ch - 52;
    const vals = trend.flatMap((g) => [g.metrics[m.key]?.value, g.metrics[m.key]?.teamAvg]).filter((v): v is number => v != null);
    if (vals.length < 2) {
      color(DIM);
      doc.text("Not enough games yet.", cx + 12, cy + 60);
      return;
    }
    const lo = m.key === "top_speed_mph" ? Math.floor(Math.min(...vals) - 1) : 0;
    let hi = Math.max(...vals);
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
        const ptv: [number, number] = [sx(gi), sy(v)];
        if (prev) doc.line(prev[0], prev[1], ptv[0], ptv[1]);
        prev = ptv;
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

  // ==== Page 3: match involvement + game by game ===========================================
  y = newPage();
  y = heading("Match involvement", y, "Minutes each game (red = started), with goals and assists above.");
  const mg = report.match.games;
  {
    const ch2 = 156;
    card(M, y, W - 2 * M, ch2);
    const px = M + 34;
    const py = y + 30;
    const pw = W - 2 * M - 48;
    const ph = ch2 - 72;
    const n = Math.max(1, mg.length);
    const slot = pw / n;
    const bw = Math.min(16, slot * 0.6);
    // Opponent logos under the bars (initials when a logo can't be loaded).
    const logoS = Math.max(8, Math.min(14, slot - 4));
    const maxMin = Math.max(90, ...mg.map((g) => g.minutes ?? 0));
    stroke(BORDER);
    doc.setLineWidth(0.4);
    for (const v of [0, 45, 90]) {
      const yy = py + ph - (v / maxMin) * ph;
      doc.line(px, yy, px + pw, yy);
      color(DIM);
      font(6);
      doc.text(`${v}'`, px - 4, yy + 2, { align: "right" });
    }
    mg.forEach((g, i) => {
      const bx = px + i * slot + (slot - bw) / 2;
      const h = ((g.minutes ?? 0) / maxMin) * ph;
      fill(g.started ? RED_LIGHT : TEAM_BAR);
      doc.rect(bx, py + ph - h, bw, h, "F");
      let my = py + ph - h - 5;
      for (let k = 0; k < g.goals; k++, my -= 7) {
        fill(GOLD);
        doc.circle(bx + bw / 2, my, 2.6, "F");
      }
      for (let k = 0; k < g.assists; k++, my -= 7) {
        fill(TEAL);
        doc.circle(bx + bw / 2, my, 2.6, "F");
      }
      teamLogo(g.opponent_logo_url, g.opponent, bx + bw / 2 - logoS / 2, py + ph + 3, logoS);
    });
    cardTitle("Minutes, goals and assists", M + 12, y + 18);
    legend(M + 210, y + 18, [
      ["Started", RED_LIGHT],
      ["Off the bench", TEAM_BAR],
      ["Goal", GOLD],
      ["Assist", TEAL],
    ]);
    color(DIM);
    font(6);
    doc.text(`${fmtDate(mg[0]?.game_date ?? report.range.from)} – ${fmtDate(mg[mg.length - 1]?.game_date ?? report.range.to)}`, M + W - 2 * M - 12, y + ch2 - 10, { align: "right" });
    y += ch2 + 20;
  }

  y = heading("Game by game", y, "Match stats and GPS for every game in one place. Season averages count games played (box-score minutes), so exhibitions without minutes are left out.");
  const gps = new Map(report.gpsGames.map((g) => [g.game_date, g]));
  const dates = [...new Set([...mg.map((g) => g.game_date), ...report.gpsGames.map((g) => g.game_date)])].sort();
  const val = (d: string, k: string, dec: number) => {
    const s = gps.get(d);
    if (!s) return "";
    if (s.glitch) return "*";
    return fixed(s.metrics[k]?.value, dec);
  };
  const phys = (k: string) => report.physical.find((m) => m.key === k);
  autoTable(doc, {
    ...darkTable(),
    startY: y,
    head: [["Date", "", "Opponent", "Res", "Min", "G", "A", "Dist mi", "Top mph", "Sprints", "Spr yd", "Accel", "Decel", "Expl", "Load"]],
    body: dates.map((d) => {
      const g = mg.find((x) => x.game_date === d);
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
    styles: { ...darkTable().styles, fontSize: 7, cellPadding: 3, halign: "center" },
    headStyles: { ...darkTable().headStyles, fontSize: 6.5, halign: "center" },
    footStyles: { font: BODY, fillColor: RAISED, textColor: GOLD, fontStyle: "bold", fontSize: 6.5, halign: "center" },
    columnStyles: { 0: { halign: "left", cellWidth: 34 }, 1: { cellWidth: 16 }, 2: { halign: "left", cellWidth: 82 }, 3: { halign: "left", cellWidth: 36 } },
    didParseCell: (c: CellHookData) => {
      if (c.section !== "body") return;
      if (c.column.index === 3) {
        const r = String(c.cell.raw ?? "");
        c.cell.styles.textColor = r.startsWith("W") ? TEAL : r.startsWith("L") ? RED_LIGHT : r.startsWith("T") ? GOLD : TEXT;
        c.cell.styles.fontStyle = "bold";
      }
      if ((c.column.index === 5 || c.column.index === 6) && Number(c.cell.raw) > 0) {
        c.cell.styles.textColor = c.column.index === 5 ? GOLD : TEAL;
        c.cell.styles.fontStyle = "bold";
      }
    },
    didDrawCell: (c: CellHookData) => {
      if (c.section === "body" && c.column.index === 1) {
        const d = dates[c.row.index];
        const g = mg.find((x) => x.game_date === d);
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
    y += 14;
  }

  // Season totals under the table: distance, sprint distance and load across every tracked game.
  {
    const counted = report.gpsGames.filter((g) => !g.glitch);
    const sum = (k: string) => counted.reduce((n, g) => n + (g.metrics[k]?.value ?? 0), 0);
    const miles = sum("distance_mi");
    const sprintYd = sum("sprints_distance_yd");
    // Distances in miles, kilometres and yards; load is a single number.
    const totalTiles: { label: string; lines: [string, string][]; c: RGB }[] = [
      {
        label: "Total distance",
        lines: [[fixed(miles, 1), "mi"], [fixed(miles * 1.609344, 1), "km"], [fixed(miles * 1760, 0), "yd"]],
        c: TEXT,
      },
      {
        label: "Total sprint distance",
        lines: [[fixed(sprintYd / 1760, 2), "mi"], [fixed(sprintYd * 0.0009144, 2), "km"], [fixed(sprintYd, 0), "yd"]],
        c: TEXT,
      },
      { label: "Total load", lines: [[fixed(sum("load"), 0), ""]], c: GOLD },
    ];
    const bottom = H - 44;
    if (counted.length && y + 10 + 24 + 100 <= bottom) {
      y = heading("Season totals", y + 10, `Added up over the ${counted.length} games tracked with GPS.`);
      const tileH = bottom - y - 4; // down to the bottom of the page
      const tw = (W - 2 * M - 2 * 10) / 3;
      totalTiles.forEach(({ label, lines, c }, i) => {
        const tx = M + i * (tw + 10);
        card(tx, y, tw, tileH);
        color(DIM);
        font(7, "bold");
        doc.text(label.toUpperCase(), tx + 14, y + 20);
        const avail = tileH - 34;
        if (lines.length === 1) {
          const fs = Math.min(40, avail * 0.5);
          color(c);
          display(fs);
          doc.text(lines[0][0], tx + 14, y + 34 + avail / 2 + fs * 0.35);
          return;
        }
        const lineH = avail / lines.length;
        const fs = Math.min(24, lineH * 0.62);
        lines.forEach(([num, unit], k) => {
          const base = y + 34 + lineH * (k + 1) - lineH * 0.3;
          color(c);
          display(fs);
          doc.text(num, tx + 14, base);
          const nw = doc.getTextWidth(num);
          color(DIM);
          font(fs * 0.45, "bold");
          doc.text(unit, tx + 14 + nw + 5, base);
        });
      });
      y += tileH + 10;
    }
  }

  // ==== A page per game ===================================================================
  const SQUAD_CHARTS = ["distance_mi", "top_speed_mph", "sprints_count", "load"];
  report.gpsGames.forEach((g: GpsGame) => {
    newPage();
    const top = 72;
    // Header card: logo, opponent, date, result, minutes, goals/assists
    const headH = 66;
    card(M, top, W - 2 * M, headH);
    teamLogo(g.opponent_logo_url ?? logoByDate.get(g.game_date), g.opponent, M + 14, top + 14, 38);
    color(TEXT);
    display(17);
    doc.text(`vs ${cleanOpponent(g.opponent)}`, M + 62, top + 32);
    color(DIM);
    font(8);
    const sub = [
      fmtDate(g.game_date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
      g.minutes != null ? `${Math.round(g.minutes)} min${g.started ? " · started" : " · off the bench"}` : null,
      g.goals ? `${g.goals} goal${g.goals > 1 ? "s" : ""}` : null,
      g.assists ? `${g.assists} assist${g.assists > 1 ? "s" : ""}` : null,
    ]
      .filter(Boolean)
      .join("   ·   ");
    doc.text(sub, M + 62, top + 48);
    if (g.result) {
      const rc = g.result.startsWith("W") ? TEAL : g.result.startsWith("L") ? RED_LIGHT : GOLD;
      display(11);
      const rw = doc.getTextWidth(g.result) + 20;
      fill(RAISED);
      stroke(rc);
      doc.setLineWidth(1);
      doc.roundedRect(W - M - 14 - rw, top + 20, rw, 22, 11, 11, "FD");
      color(rc);
      doc.text(g.result, W - M - 14 - rw / 2, top + 35, { align: "center" });
    }
    if (g.glitch) {
      color(GOLD);
      font(7.5, "bold");
      doc.text("Tracker glitch this game (impossible top speed): not counted in averages.", M + 62, top + 60);
    }

    // Him vs the rest of the squad's average, every metric
    const by = top + headH + 10;
    const bh = 262;
    card(M, by, W - 2 * M, bh);
    cardTitle(`${first} vs the rest of the squad`, M + 14, by + 18);
    legend(M + 210, by + 18, [
      [first, RED_LIGHT],
      ["Squad average this game", TEAM_BAR],
    ]);
    const rows = report.physical;
    const rTop = by + 28;
    const rowH = (bh - 36) / rows.length;
    const labelW = 96;
    const barX = M + 14 + labelW;
    const tailW = 104;
    const barW = W - 2 * M - 28 - labelW - tailW;
    rows.forEach((m, r) => {
      const ry = rTop + r * rowH;
      const gm = g.metrics[m.key];
      const v = gm?.value ?? null;
      const tv = gm?.teamAvg ?? null;
      const max = Math.max(v ?? 0, tv ?? 0) * 1.08 || 1;
      const mid = ry + rowH / 2;
      color(TEXT);
      font(7.5, "bold");
      doc.text(m.label, M + 14, mid + 2.5);
      const bH = Math.max(3, Math.min(6, rowH / 2 - 2.5));
      fill(RAISED);
      doc.rect(barX, mid - bH - 1, barW, bH * 2 + 2, "F");
      if (v != null) {
        fill(RED_LIGHT);
        doc.rect(barX, mid - bH - 0.5, Math.max(1, (v / max) * barW), bH, "F");
      }
      if (tv != null) {
        fill(TEAM_BAR);
        doc.rect(barX, mid + 0.5, Math.max(1, (tv / max) * barW), bH, "F");
      }
      color(TEXT);
      font(7, "bold");
      doc.text(short(v, m.unit, m.decimals), barX + barW + 6, mid - 1);
      color(DIM);
      font(6.5);
      doc.text(short(tv, m.unit, m.decimals), barX + barW + 6, mid + 6.5);
      if (gm?.rank) {
        color(rankColor(gm.rank));
        font(7.5, "bold");
        doc.text(`${ordinal(gm.rank)}/${gm.of}`, W - M - 14, mid + 2.5, { align: "right" });
      }
    });

    // Where he ranked in the squad: every player's number (anonymous), his in red
    const sy0 = by + bh + 10;
    const sh = (H - 44 - sy0 - 10) / 2;
    const sw = (W - 2 * M - 10) / 2;
    color(DIM);
    font(6.5);
    SQUAD_CHARTS.forEach((key, i) => {
      const m = report.physical.find((x) => x.key === key);
      const gm = g.metrics[key];
      if (!m || !gm) return;
      const cx = M + (i % 2) * (sw + 10);
      const cy = sy0 + Math.floor(i / 2) * (sh + 10);
      card(cx, cy, sw, sh);
      cardTitle(m.label, cx + 12, cy + 16);
      color(rankColor(gm.rank));
      font(8, "bold");
      doc.text(gm.rank ? `${ordinal(gm.rank)} of ${gm.of}` : "–", cx + sw - 12, cy + 16, { align: "right" });
      const values = gm.squad;
      if (!values.length) return;
      const px = cx + 12;
      const py = cy + 24;
      const pw = sw - 24;
      const ph = sh - 42;
      const lo = key === "top_speed_mph" ? Math.max(0, Math.floor(Math.min(...values) - 2)) : 0;
      const hi = Math.max(...values) * 1.05 || 1;
      const slot = pw / values.length;
      const bw2 = Math.min(18, slot * 0.72);
      let marked = false;
      values.forEach((v, j) => {
        const isHim = !marked && gm.value != null && v === gm.value;
        if (isHim) marked = true;
        const h2 = ((v - lo) / (hi - lo)) * ph;
        fill(isHim ? RED_LIGHT : TEAM_BAR);
        doc.rect(px + j * slot + (slot - bw2) / 2, py + ph - h2, bw2, h2, "F");
        if (isHim) {
          color(TEXT);
          font(6.5, "bold");
          doc.text(short(v, "", m.decimals), px + j * slot + slot / 2, py + ph - h2 - 3, { align: "center" });
        }
      });
      if (gm.teamAvg != null) {
        const ay = py + ph - ((gm.teamAvg - lo) / (hi - lo)) * ph;
        stroke(DIM);
        doc.setLineWidth(0.7);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(px, ay, px + pw, ay);
        doc.setLineDashPattern([], 0);
      }
      color(DIM);
      font(6);
      doc.text(`Squad, most to least  ·  dashed = squad average ${short(gm.teamAvg, m.unit, m.decimals)}`, px, cy + sh - 7);
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
