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
  console.log(`Migration applied against ${db.name}`);
}

// CREATE TABLE IF NOT EXISTS won't add columns to a table that already exists,
// so columns added after a table first shipped are backfilled here.
function addMissingColumns(db: ReturnType<typeof getDb>) {
  const added: Array<[table: string, column: string, definition: string]> = [
    ["readiness_checkins", "readiness_rating", "INTEGER CHECK (readiness_rating BETWEEN 1 AND 10)"],
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
