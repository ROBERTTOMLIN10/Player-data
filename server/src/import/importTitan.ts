import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { getDb } from "../db/connection.js";
import { normalizePlayerName } from "./nameNormalization.js";
import { CORE_FIELD_MAP, DATE_HEADER_CANDIDATES, matchZoneColumn, NAME_HEADER_CANDIDATES } from "./columnMapping.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "..", "data", "titan");

const FILENAME_PATTERN = /^(?:(\d{4}-\d{2}-\d{2})_)?(.+)\.xlsx$/i;

function parseFilename(filename: string): { opponent: string | null } {
  const match = filename.match(FILENAME_PATTERN);
  if (!match) return { opponent: null };
  const opponent = match[2].replace(/[_-]+/g, " ").trim();
  return { opponent: opponent || null };
}

function findHeaderKey(headers: string[], candidates: string[]): string | null {
  const lowerMap = new Map(headers.map((h) => [h.trim().toLowerCase(), h]));
  for (const candidate of candidates) {
    const found = lowerMap.get(candidate);
    if (found) return found;
  }
  return null;
}

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    // Excel serial date fallback (days since 1899-12-30)
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${mm}-${dd}`;
    }
  }
  return null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function findOrCreatePlayer(db: ReturnType<typeof getDb>, rawName: string): number {
  const normalized = normalizePlayerName(rawName);
  const existingAlias = db
    .prepare("SELECT player_id FROM player_aliases WHERE normalized_alias = ?")
    .get(normalized) as { player_id: number } | undefined;
  if (existingAlias) return existingAlias.player_id;

  const insertPlayer = db.prepare("INSERT INTO players (canonical_name) VALUES (?)").run(rawName.trim());
  const playerId = insertPlayer.lastInsertRowid as number;
  db.prepare("INSERT INTO player_aliases (player_id, normalized_alias, raw_alias) VALUES (?, ?, ?)").run(
    playerId,
    normalized,
    rawName.trim(),
  );
  console.log(`  + new player: "${rawName.trim()}"`);
  return playerId;
}

function importFile(filePath: string) {
  const filename = path.basename(filePath);
  console.log(`\nImporting ${filename}...`);

  const db = getDb();

  const existing = db.prepare("SELECT id FROM games WHERE source_file = ?").get(filename);
  if (existing) {
    console.log(`  already imported (source_file matches), skipping. Delete the game row to re-import.`);
    return;
  }

  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames.includes("GPS") ? "GPS" : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

  if (rows.length === 0) {
    console.warn(`  no data rows found in sheet "${sheetName}", skipping.`);
    return;
  }

  const headers = Object.keys(rows[0]);
  const nameKey = findHeaderKey(headers, NAME_HEADER_CANDIDATES);
  const dateKey = findHeaderKey(headers, DATE_HEADER_CANDIDATES);

  if (!nameKey || !dateKey) {
    console.error(`  could not find name/date columns in headers: ${headers.join(", ")}`);
    return;
  }

  const unmappedHeaders = new Set<string>();
  for (const header of headers) {
    if (header === nameKey || header === dateKey) continue;
    if (CORE_FIELD_MAP[header]) continue;
    if (matchZoneColumn(header)) continue;
    unmappedHeaders.add(header);
  }
  if (unmappedHeaders.size > 0) {
    console.warn(`  unmapped columns (preserved in raw_json only): ${[...unmappedHeaders].join(", ")}`);
  }

  let gameDate: string | null = null;
  for (const row of rows) {
    const iso = toIsoDate(row[dateKey]);
    if (iso) {
      gameDate = iso;
      break;
    }
  }
  if (!gameDate) {
    console.error(`  could not parse a valid date from column "${dateKey}", skipping file.`);
    return;
  }

  const { opponent } = parseFilename(filename);

  const insertGame = db
    .prepare("INSERT INTO games (game_date, opponent, source_file) VALUES (?, ?, ?)")
    .run(gameDate, opponent, filename);
  const gameId = insertGame.lastInsertRowid as number;

  const insertSession = db.prepare(`
    INSERT INTO gps_sessions (
      game_id, player_id, distance_mi, active_time_min, load, top_speed_mph,
      peak_accel, peak_decel, sprints_count, sprints_max_topspeed_mph,
      sprints_avg_topspeed_mph, sprints_distance_yd, sprints_volume,
      explosiveness_count, explosiveness_mean_accel, raw_json
    ) VALUES (@game_id, @player_id, @distance_mi, @active_time_min, @load, @top_speed_mph,
      @peak_accel, @peak_decel, @sprints_count, @sprints_max_topspeed_mph,
      @sprints_avg_topspeed_mph, @sprints_distance_yd, @sprints_volume,
      @explosiveness_count, @explosiveness_mean_accel, @raw_json)
  `);

  const insertZoneMetric = db.prepare(`
    INSERT INTO gps_zone_metrics (gps_session_id, zone_group, zone_label, value, unit)
    VALUES (?, ?, ?, ?, ?)
  `);

  const runImport = db.transaction((rows: Record<string, unknown>[]) => {
    let playerCount = 0;
    for (const row of rows) {
      const rawName = row[nameKey];
      if (!rawName || typeof rawName !== "string" || !rawName.trim()) {
        console.warn(`  skipping row with missing player name: ${JSON.stringify(row)}`);
        continue;
      }
      const playerId = findOrCreatePlayer(db, rawName);

      const core: Record<string, number | null> = {};
      for (const [header, field] of Object.entries(CORE_FIELD_MAP)) {
        core[field] = toNumberOrNull(row[header]);
      }

      const sessionResult = insertSession.run({
        game_id: gameId,
        player_id: playerId,
        distance_mi: core.distance_mi ?? null,
        active_time_min: core.active_time_min ?? null,
        load: core.load ?? null,
        top_speed_mph: core.top_speed_mph ?? null,
        peak_accel: core.peak_accel ?? null,
        peak_decel: core.peak_decel ?? null,
        sprints_count: core.sprints_count ?? null,
        sprints_max_topspeed_mph: core.sprints_max_topspeed_mph ?? null,
        sprints_avg_topspeed_mph: core.sprints_avg_topspeed_mph ?? null,
        sprints_distance_yd: core.sprints_distance_yd ?? null,
        sprints_volume: core.sprints_volume ?? null,
        explosiveness_count: core.explosiveness_count ?? null,
        explosiveness_mean_accel: core.explosiveness_mean_accel ?? null,
        raw_json: JSON.stringify(row),
      });
      const sessionId = sessionResult.lastInsertRowid as number;

      for (const header of headers) {
        const zone = matchZoneColumn(header);
        if (!zone) continue;
        const value = toNumberOrNull(row[header]);
        insertZoneMetric.run(sessionId, zone.group, zone.label, value, zone.unit);
      }

      playerCount++;
    }
    return playerCount;
  });

  const playerCount = runImport(rows);
  console.log(`  imported ${playerCount} player sessions for game_date=${gameDate} opponent=${opponent ?? "(unset)"}`);
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.toLowerCase().endsWith(".xlsx") && !f.startsWith("~$"));

  if (files.length === 0) {
    console.log(`No .xlsx files found in ${DATA_DIR}`);
    return;
  }

  for (const file of files) {
    importFile(path.join(DATA_DIR, file));
  }
}

main();
