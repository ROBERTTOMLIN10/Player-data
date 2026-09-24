// Preview-only GPS uploads. The preview has no server, so an uploaded Titan
// export is checked in the browser, then kept in the artifact's own storage:
// the file itself (base64 text) as an asset, plus a record in the artifact's
// db under gpsUploads/. The next preview update pulls pending files into
// data/titan, imports them for real, and marks them imported (see
// .claude/skills/update-preview/SKILL.md).
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from "xlsx";
import { DATE_HEADER_CANDIDATES, NAME_HEADER_CANDIDATES } from "../../server/src/import/columnMapping";
import { normalizeOpponent, parseGpsFilename } from "../../server/src/import/gpsFilename";

export interface UploadRecord {
  filename: string;
  assetId: string;
  gameDate: string | null;
  opponent: string | null;
  playerCount: number;
  uploadedAt: string;
  status: "pending" | "imported";
}

type Claude = { use(name: string): Promise<any> };
const claude = (): Claude | undefined => (window as any).claude;

async function capability(name: string): Promise<any> {
  try {
    return (await claude()?.use(name)) ?? null;
  } catch {
    return null;
  }
}

const docId = (filename: string) => filename.replace(/[^A-Za-z0-9_\-.~]+/g, "_").replace(/^\.+/, "_").slice(0, 180);

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Same rules as the real import (server/src/import/importTitan.ts toIsoDate). */
function toIsoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") {
    const t = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    const d = new Date(t);
    if (t && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const p = XLSX.SSF.parse_date_code(value);
    if (p) return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  return null;
}

function findHeader(headers: string[], candidates: string[]) {
  const lower = new Map(headers.map((h) => [h.trim().toLowerCase(), h]));
  for (const c of candidates) if (lower.has(c)) return lower.get(c)!;
  return null;
}

/** Uploads already saved in this preview (newest first); [] when storage isn't available. */
export async function listUploads(): Promise<UploadRecord[]> {
  const db = await capability("db");
  if (!db) return [];
  try {
    const snap = await db.collection("gpsUploads").get();
    const docs: any[] = snap.docs ?? snap;
    return docs.map((d: any) => (typeof d.data === "function" ? d.data() : d.data ?? d)).sort((a: UploadRecord, b: UploadRecord) => b.uploadedAt.localeCompare(a.uploadedAt));
  } catch {
    return [];
  }
}

/** Handles the Data page's upload in the preview. Returns the same shape as the real upload endpoint. */
export async function handlePreviewUpload(file: File, existingFiles: string[], schedule: { game_date: string; opponent: string }[]) {
  const fail = (message: string, status = 422) => ({ status, body: { status: "error", filename: file.name, message, warnings: [] as string[] } });
  if (!/\.xlsx$/i.test(file.name)) return fail("Only .xlsx files are accepted.");
  const named = parseGpsFilename(file.name);
  if (!named.opponent) return fail(`Name the file after the game, like "Memphis 2026.xlsx", and upload it again.`);
  const uploads = await listUploads();
  if (existingFiles.includes(file.name) || uploads.some((u) => u.filename === file.name))
    return fail(`A file named "${file.name}" was already uploaded. Rename it (e.g. include the date) if this is a different game.`, 409);

  const bytes = new Uint8Array(await file.arrayBuffer());
  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(bytes, { type: "array", cellDates: true });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  } catch {
    return fail("That file couldn't be read as an Excel (.xlsx) export.");
  }
  const headers = Object.keys(rows[0] ?? {});
  const nameKey = findHeader(headers, NAME_HEADER_CANDIDATES);
  if (!nameKey || !headers.includes("Session Load")) return fail("This doesn't look like a Titan GPS export (no player name or Session Load column).");
  const players = rows.filter((r) => String(r[nameKey] ?? "").trim()).length;
  if (!players) return fail("No player rows found in this file.");
  const dateKey = findHeader(headers, DATE_HEADER_CANDIDATES);
  let fileDate: string | null = null;
  for (const r of dateKey ? rows : []) if ((fileDate = toIsoDate(r[dateKey!]))) break;
  // Same order as the real import: the file's Date column, a date in the name, then the schedule.
  const want = normalizeOpponent(named.opponent);
  const scheduled = schedule.filter((g) => named.year && g.game_date.startsWith(`${named.year}-`) && normalizeOpponent(g.opponent) === want);
  const gameDate = fileDate ?? named.date ?? (scheduled.length === 1 ? scheduled[0].game_date : null);
  if (!gameDate)
    return fail(
      named.year
        ? `Couldn't find the game date: the file has no Date column and "${named.opponent}" in ${named.year} doesn't match exactly one game on the schedule. Add the date to the name, e.g. 2026-09-12_${named.opponent}.xlsx.`
        : `Name the file with the opponent and year, like "Memphis 2026.xlsx", and upload it again.`,
    );

  const assets = await capability("assets");
  const db = await capability("db");
  if (!assets || !db) return fail("Uploads need the preview opened in the Claude app with edit access. Nothing was saved.");
  try {
    const asset = await assets.upload(new Blob([toBase64(bytes)], { type: "text/plain" }), { type: "text/plain" });
    const record: UploadRecord = {
      filename: file.name,
      assetId: asset.id,
      gameDate,
      opponent: named.opponent,
      playerCount: players,
      uploadedAt: new Date().toISOString(),
      status: "pending",
    };
    await db.doc(`gpsUploads/${docId(file.name)}`).set(record);
    window.dispatchEvent(new Event("preview-uploads-changed"));
    const warnings =
      named.year && Number(gameDate.slice(0, 4)) !== named.year
        ? [`The file's date is ${gameDate}, but its name says ${named.year}. The file's date will be used.`]
        : [];
    return {
      status: 200,
      body: {
        status: "imported",
        filename: file.name,
        gameDate: record.gameDate,
        opponent: record.opponent,
        playerCount: players,
        message: `Saved: ${players} players vs ${record.opponent} (${gameDate}). It joins the GPS pages at the next preview update ("update the preview").`,
        warnings,
      },
    };
  } catch (err: any) {
    return fail(`Couldn't save the file (${err?.code ?? "error"}). Nothing was added; try again.`);
  }
}
