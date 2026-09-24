/**
 * fausports.com data snapshot for the preview.
 *
 *   export <file>  run the schedule + minutes sync against DB_PATH (needs
 *                  network access to fausports.com) and write the synced
 *                  tables to <file> as JSON. Exits non-zero if the sync fails.
 *   import <file>  load a snapshot into DB_PATH (players matched by name).
 *
 * Run with tsx after migrating and importing the GPS files into DB_PATH, e.g.
 *   DB_PATH=/tmp/x.db npx tsx tools/preview/snapshot.mts export snap.json
 *
 * Used by .github/workflows/preview-data.yml (GitHub's servers can reach
 * fausports.com) and by build.sh when the build machine can't.
 */
import fs from "node:fs";
import { getDb } from "../../server/src/db/connection.js";
import { migrate } from "../../server/src/db/migrate.js";
import { syncSchedule } from "../../server/src/import/syncSchedule.js";
import { syncMinutes } from "../../server/src/import/importMinutes.js";
import { syncSeason, syncStatsAndRankings } from "../../server/src/jobs/ncaaSync.js";
import { ncaaLogoUrl } from "../../server/src/ncaa/client.js";
import { recordRanks } from "../../server/src/ncaa/store.js";
import { fillMinutesFromBoxScores } from "../../server/src/import/importMinutes.js";
import { shiftDate, teamToday } from "../../server/src/lib/readiness.js";

type Row = Record<string, unknown>;

interface Snapshot {
  syncedAt: string;
  scheduleGames: Row[]; // _key = "date|opponent"
  teamTotals: Row[]; // _game = schedule key
  playerStats: Row[]; // _game = schedule key, _player = canonical name
  minutes: Row[]; // _game = games.source_file, _player = canonical name
  logos?: Record<string, string>; // logo URL -> data: URI (the preview can't load outside images)
  ncaaGames?: Row[]; // NCAA D1 scoreboard rows (all of this season)
  ncaaCache?: Row[]; // NCAA stat / rankings tables
  ncaaRankHistory?: Row[]; // last few days of ranks, for daily movement arrows
}

const [mode, file] = process.argv.slice(2);
if (!["export", "import"].includes(mode) || !file) {
  console.error("usage: snapshot.mts export|import <file>");
  process.exit(2);
}

migrate();
const db = getDb();

function strip(row: Row, ...cols: string[]): Row {
  const out = { ...row };
  for (const c of ["id", ...cols]) delete out[c];
  return out;
}

function insert(table: string, row: Row, conflict: string) {
  const cols = Object.keys(row);
  const updates = cols.map((c) => `${c} = excluded.${c}`).join(", ");
  db.prepare(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})
     ON CONFLICT(${conflict}) DO UPDATE SET ${updates}`,
  ).run(...cols.map((c) => row[c] as never));
}

if (mode === "export") {
  const schedule = await syncSchedule();
  console.log(`schedule sync: ${schedule.status} - ${schedule.message}`);
  if (schedule.status !== "ok" || schedule.gamesUpserted === 0) process.exit(1);
  const minutes = await syncMinutes();
  console.log(`minutes sync: ${minutes.status} - ${minutes.message}`);

  const snap: Snapshot = {
    syncedAt: new Date().toISOString(),
    scheduleGames: (db.prepare("SELECT * FROM schedule_games ORDER BY game_date").all() as Row[]).map((r) => ({
      ...strip(r, "updated_at"),
      _key: `${r.game_date}|${r.opponent}`,
    })),
    teamTotals: db
      .prepare(
        `SELECT t.*, sg.game_date || '|' || sg.opponent AS _game
         FROM game_team_totals t JOIN schedule_games sg ON sg.id = t.schedule_game_id`,
      )
      .all()
      .map((r) => strip(r as Row, "schedule_game_id")),
    playerStats: db
      .prepare(
        `SELECT s.*, sg.game_date || '|' || sg.opponent AS _game, p.canonical_name AS _player
         FROM player_game_stats s
         JOIN schedule_games sg ON sg.id = s.schedule_game_id
         JOIN players p ON p.id = s.player_id`,
      )
      .all()
      .map((r) => strip(r as Row, "schedule_game_id", "player_id", "created_at")),
    minutes: db
      .prepare(
        `SELECT m.*, g.source_file AS _game, p.canonical_name AS _player
         FROM minutes_played m JOIN games g ON g.id = m.game_id JOIN players p ON p.id = m.player_id`,
      )
      .all()
      .map((r) => strip(r as Row, "game_id", "player_id", "created_at")),
  };
  // NCAA D1 (NCAA.com): season results, stat leaders, rankings.
  await syncStatsAndRankings();
  await syncSeason();
  snap.ncaaGames = db.prepare("SELECT * FROM ncaa_games WHERE game_date LIKE ?").all(`${teamToday().slice(0, 4)}-%`) as Row[];
  snap.ncaaCache = db.prepare("SELECT * FROM ncaa_cache").all() as Row[];
  snap.ncaaRankHistory = db
    .prepare("SELECT * FROM ncaa_rank_history WHERE day >= ?")
    .all(shiftDate(teamToday(), -14)) as Row[]; // two weeks: enough for weekly polls
  console.log(`ncaa: ${snap.ncaaGames.length} games, ${snap.ncaaCache.length} tables`);

  // Logos to embed: every opponent on our schedule and every school on the NCAA
  // scoreboard this season. Each is shrunk to a small 64px WebP (the size the
  // app shows) so all of them fit in the preview page.
  let sharp: ((input: Buffer) => { resize: (w: number, h: number, o: object) => { webp: (o: object) => { toBuffer: () => Promise<Buffer> } } }) | null = null;
  try {
    sharp = (await import("sharp" as string)).default;
  } catch {
    console.warn("sharp not installed: embedding logos at full size");
  }
  const seos = new Set<string>();
  for (const g of snap.ncaaGames) for (const side of ["home", "away"]) seos.add(String(g[`${side}_seo`]));
  snap.logos = {};
  const urls = [
    ...new Set([
      ...(snap.scheduleGames.map((g) => g.opponent_logo_url).filter(Boolean) as string[]),
      ...[...seos].map((seo) => ncaaLogoUrl(seo)),
    ]),
  ];
  const failed: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(encodeURI(decodeURI(url)));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type")?.split(";")[0] || "image/png";
      let bytes = Buffer.from(await res.arrayBuffer());
      let outType = type;
      if (sharp) {
        bytes = await sharp(bytes).resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 80 }).toBuffer();
        outType = "image/webp";
      }
      snap.logos[url] = `data:${outType};base64,${bytes.toString("base64")}`;
    } catch (err) {
      failed.push(`${url.split("/").pop()} (${(err as Error).message})`);
    }
  }
  if (failed.length) console.warn(`${failed.length} logos unavailable: ${failed.join(", ")}`);

  fs.writeFileSync(file, JSON.stringify(snap, null, 1));
  console.log(
    `wrote ${file}: ${snap.scheduleGames.length} games, ${snap.playerStats.length} player stat lines, ` +
      `${snap.teamTotals.length} team totals, ${snap.minutes.length} minutes rows, ${Object.keys(snap.logos).length} logos ` +
      `(${Math.round(JSON.stringify(snap.logos).length / 1024)} KB)`,
  );
} else {
  const snap = JSON.parse(fs.readFileSync(file, "utf-8")) as Snapshot;
  const playerId = (name: unknown): number => {
    const found = db.prepare("SELECT id FROM players WHERE canonical_name = ?").get(name) as { id: number } | undefined;
    if (found) return found.id;
    return Number(db.prepare("INSERT INTO players (canonical_name) VALUES (?)").run(name).lastInsertRowid);
  };
  const scheduleId = (key: unknown): number | undefined => {
    const [date, opponent] = String(key).split("|");
    return (db.prepare("SELECT id FROM schedule_games WHERE game_date = ? AND opponent = ?").get(date, opponent) as
      | { id: number }
      | undefined)?.id;
  };

  db.transaction(() => {
    for (const { _key, ...row } of snap.scheduleGames) insert("schedule_games", row, "game_date, opponent");
    for (const { _game, ...row } of snap.teamTotals) {
      const id = scheduleId(_game);
      if (id) insert("game_team_totals", { ...row, schedule_game_id: id }, "schedule_game_id, side");
    }
    for (const { _game, _player, ...row } of snap.playerStats) {
      const id = scheduleId(_game);
      if (id) insert("player_game_stats", { ...row, schedule_game_id: id, player_id: playerId(_player) }, "schedule_game_id, player_id");
    }
    for (const row of snap.ncaaGames ?? []) insert("ncaa_games", row, "contest_id");
    for (const row of snap.ncaaCache ?? []) insert("ncaa_cache", row, "key");
    for (const row of snap.ncaaRankHistory ?? []) insert("ncaa_rank_history", row, "key, day, entity");
    for (const { _game, _player, ...row } of snap.minutes) {
      const game = db.prepare("SELECT id FROM games WHERE source_file = ?").get(_game) as { id: number } | undefined;
      if (game) insert("minutes_played", { ...row, game_id: game.id, player_id: playerId(_player) }, "game_id, player_id");
    }
  })();
  // Snapshots from before rank history existed: seed it from their cached
  // tables, dated (team timezone) by when each table was fetched.
  if (!snap.ncaaRankHistory?.length) {
    const teamDate = (utc: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TEAM_TIMEZONE || "America/New_York" }).format(
        new Date(`${utc.replace(" ", "T")}Z`),
      );
    for (const row of snap.ncaaCache ?? []) {
      const key = String(row.key);
      if (/^(stats-|rankings-)/.test(key)) recordRanks(key, JSON.parse(String(row.json)), teamDate(String(row.updated_at)));
    }
  }
  // GPS files added since the snapshot was taken: minutes from the saved box scores.
  fillMinutesFromBoxScores();
  console.log(
    `loaded snapshot from ${snap.syncedAt}: ${snap.scheduleGames.length} games, ${snap.playerStats.length} player stat lines, ` +
      `${snap.ncaaGames?.length ?? 0} NCAA games, ${snap.ncaaCache?.length ?? 0} NCAA tables`,
  );
}
