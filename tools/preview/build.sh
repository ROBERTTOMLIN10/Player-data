#!/bin/bash
# Builds the clickable app preview (a single self-contained HTML page) from the
# real web app, with /api answered from data captured off a local test server:
# real GPS files + fausports.com sync (needs network access to fausports.com),
# plus made-up player logins and check-ins. Output: $OUT/fau-app-preview.html
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/tools/preview"
OUT="${OUT:-/tmp/fau-preview}"
DB="$OUT/preview.db"
PORT=4100
mkdir -p "$OUT"
rm -f "$DB"*

cd "$ROOT"
npm install --no-audit --no-fund
npm run build

echo "== Database + GPS files"
DB_PATH="$DB" node server/dist/db/migrate.js
DB_PATH="$DB" npm run import:titan

echo "== Test server"
( cd server && ADMIN_USER=coach@fau.edu ADMIN_PASSWORD=secret123 PORT=$PORT DB_PATH="$DB" \
  AUTO_SYNC_INTERVAL_MINUTES=100000 node dist/index.js > "$OUT/server.log" 2>&1 ) &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
until curl -s "localhost:$PORT/api/health" > /dev/null; do sleep 1; done

echo "== fausports.com sync"
COOKIE=$(curl -s -i -H 'Content-Type: application/json' -d '{"email":"coach@fau.edu","password":"secret123"}' \
  "localhost:$PORT/api/auth/login" | grep -i set-cookie | sed 's/.*\(fau_sid=[^;]*\).*/\1/')
curl -s -X POST -H "Cookie: $COOKIE" "localhost:$PORT/api/admin/sync-schedule" | head -c 400; echo
curl -s -X POST -H "Cookie: $COOKIE" "localhost:$PORT/api/admin/sync-minutes" | head -c 400; echo

echo "== Test logins + check-ins"
PLAYER_EMAIL=$(node "$HERE/seed.mjs" | tail -1)
PLAYER_ID=${PLAYER_EMAIL#p}; PLAYER_ID=${PLAYER_ID%@fau.edu}
DB="$DB" PLAYER_ID="$PLAYER_ID" node -e '
const D = require(process.cwd() + "/node_modules/better-sqlite3"); const d = new D(process.env.DB);
const pid = Number(process.env.PLAYER_ID);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
d.prepare("DELETE FROM readiness_checkins WHERE player_id = ? AND entry_date = ?").run(pid, today); // preview starts un-checked-in
for (let k = 1; k <= 20; k++) {
  const dt = new Date(Date.now() - k * 864e5).toISOString().slice(0, 10);
  const v = () => 3 + Math.round(Math.random() * 2); const rt = 6 + Math.round(Math.random() * 4);
  const r = d.prepare("INSERT OR IGNORE INTO readiness_checkins (player_id,entry_date,readiness_rating,sleep_hours,sleep_quality,energy,muscle_soreness,stress,mood,readiness_score) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id")
    .get(pid, dt, rt, 7 + (Math.random() * 2 | 0), v(), v(), v(), v(), v(), rt * 10);
  if (r && k % 4 === 0) d.prepare("INSERT INTO readiness_soreness (checkin_id, region, severity) VALUES (?, ?, ?)").run(r.id, "quad_outer_r", "light");
}'

echo "== Capture API responses (player: $PLAYER_EMAIL)"
PLAYER_EMAIL="$PLAYER_EMAIL" node "$HERE/capture.mjs" "$OUT/data.json"
kill $SERVER_PID

echo "== Build preview app"
DEMO="$OUT/demo-web"
rm -rf "$DEMO" && mkdir -p "$DEMO/src/demo"
cp -r web/index.html web/src web/vite.config.ts web/tsconfig.json web/package.json "$DEMO/"
cp "$HERE/mock.ts" "$HERE/DemoBar.tsx" "$DEMO/src/demo/"
cp "$OUT/data.json" "$DEMO/src/demo/data.json"
ln -s "$ROOT/node_modules" "$DEMO/node_modules"
python3 - "$DEMO" <<'PY'
import sys, os
d = sys.argv[1]
p = os.path.join(d, "src/main.tsx"); s = open(p).read()
s = s.replace('import React from "react";', 'import "./demo/mock"; // must run before anything calls fetch\nimport React from "react";')
s = s.replace('import { BrowserRouter } from "react-router-dom";', 'import { MemoryRouter } from "react-router-dom";\nimport { DemoBar } from "./demo/DemoBar";')
s = s.replace("      <BrowserRouter>\n        <App />\n      </BrowserRouter>", "      <MemoryRouter>\n        <DemoBar />\n        <App />\n      </MemoryRouter>")
s = s[: s.index("// Service worker:")]
assert "MemoryRouter" in s and "DemoBar" in s
open(p, "w").write(s)
p = os.path.join(d, "src/lib/pwa.ts"); s = open(p).read()
s = s[: s.index("export type PushState")] + '''export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

// Preview: notifications are simulated in memory.
import { demoPush } from "../demo/mock";

export async function getPushState(): Promise<PushState> {
  return demoPush.on ? "on" : "off";
}

export async function enablePush(_publicKey: string): Promise<PushState> {
  demoPush.set(true);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  demoPush.set(false);
  return "off";
}
'''
open(p, "w").write(s)
p = os.path.join(d, "vite.config.ts"); s = open(p).read()
s = s.replace("plugins: [react(), tailwindcss()],", 'base: "./",\n  plugins: [react(), tailwindcss()],')
open(p, "w").write(s)
PY
( cd "$DEMO" && npx vite build )

echo "== Inline into one page"
python3 - "$DEMO/dist" "$OUT/fau-app-preview.html" <<'PY'
import sys, os, re
dist, out = sys.argv[1], sys.argv[2]
html = open(os.path.join(dist, "index.html")).read()
assets = os.path.join(dist, "assets")
css = "".join(open(os.path.join(assets, f)).read() for f in os.listdir(assets) if f.endswith(".css"))
js = [f for f in os.listdir(assets) if f.endswith(".js")]
assert len(js) == 1, js
code = open(os.path.join(assets, js[0])).read().replace("</script", "<\\/script")
fonts = re.search(r'<link\s+href="https://fonts.googleapis.com[^>]*>', html, re.S).group(0)
open(out, "w").write(f"""<title>FAU Soccer App Preview</title>
<meta name="theme-color" content="#0b0c0f" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
{fonts}
<style>
:root {{ color-scheme: dark; background: #0b0c0f; }}
{css}
</style>
<div id="root"></div>
<script type="module">
{code}
</script>
""")
print("wrote", out, os.path.getsize(out) // 1024, "KB")
PY
