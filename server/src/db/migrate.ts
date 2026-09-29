import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function migrate() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  const db = getDb();
  db.exec(schema);
  addMissingColumns(db);
  // Instagram handles aren't shown any more (they didn't always match the player): clear any stored ones.
  db.exec("UPDATE roster_players SET instagram = NULL WHERE instagram IS NOT NULL; UPDATE team_players SET instagram = NULL WHERE instagram IS NOT NULL;");
  console.log(`Migration applied against ${db.name}`);
}

// CREATE TABLE IF NOT EXISTS won't add columns to a table that already exists,
// so columns added after a table first shipped are backfilled here.
function addMissingColumns(db: ReturnType<typeof getDb>) {
  const added: Array<[table: string, column: string, definition: string]> = [
    ["readiness_checkins", "readiness_rating", "INTEGER CHECK (readiness_rating BETWEEN 1 AND 10)"],
    ["roster_players", "position_long", "TEXT"],
    ["roster_players", "academic_year_long", "TEXT"],
    ["roster_players", "height_feet", "INTEGER"],
    ["roster_players", "height_inches", "INTEGER"],
    ["roster_players", "weight", "INTEGER"],
    ["roster_players", "hometown", "TEXT"],
    ["roster_players", "high_school", "TEXT"],
    ["roster_players", "previous_school", "TEXT"],
    ["roster_players", "major", "TEXT"],
    ["roster_players", "birth_date", "TEXT"],
    ["roster_players", "is_captain", "INTEGER NOT NULL DEFAULT 0"],
    ["roster_players", "instagram", "TEXT"],
    ["roster_players", "photo_url", "TEXT"],
    ["roster_players", "profile_url", "TEXT"],
    ["team_sites", "discovered_at", "TEXT"],
  ];
  for (const [table, column, definition] of added) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  migrate();
}
