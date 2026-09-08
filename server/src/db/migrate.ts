import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function migrate() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  const db = getDb();
  db.exec(schema);
  console.log(`Migration applied against ${db.name}`);
}

migrate();
