import { getDb } from "../db/connection.js";
import { followersFor, type Alert } from "../lib/follows.js";
import { sendToUsers } from "../lib/push.js";
import { shiftDate, teamToday } from "../lib/readiness.js";
import { fetchGameBoxscore, type GameBoxscore } from "../ncaa/client.js";
import { gamesOn, type GameRow } from "../ncaa/store.js";

/**
 * Game alerts on people's phones for the teams they've starred: kick-off,
 * goals (scorer and assist), half-time, the final score and red cards.
 *
 * Every minute, today's games involving a starred team are checked: the
 * scoreboard (kept fresh by ncaaSync) for kick-off, half-time and full time,
 * NCAA.com's game center for goals and red cards. Each alert is recorded in
 * game_alerts_sent before it goes out, so none is sent twice, even across
 * restarts. A game first seen after it started is caught up silently.
 */

const TICK_MS = 60_000;
const SEEN = "seen";

type Kind = Alert;
interface Pending {
  key: string;
  kind: Kind;
  title: string;
  body: string;
}

function starredTeams(): Set<string> {
  const rows = getDb().prepare("SELECT DISTINCT team_seo FROM team_follows WHERE starred = 1").all() as { team_seo: string }[];
  return new Set([...rows.map((r) => r.team_seo), process.env.NCAA_TEAM_SEO || "fla-atlantic"]);
}

function sentKeys(id: number): Set<string> {
  const rows = getDb().prepare("SELECT alert_key FROM game_alerts_sent WHERE contest_id = ?").all(id) as { alert_key: string }[];
  return new Set(rows.map((r) => r.alert_key));
}

/** Records an alert as sent; false if it already was. */
function claim(id: number, key: string): boolean {
  return getDb().prepare("INSERT OR IGNORE INTO game_alerts_sent (contest_id, alert_key) VALUES (?, ?)").run(id, key).changes === 1;
}

/** "41:20" on the game clock → "42'" (the minute it happened in). */
const minute = (clock: string) => {
  const m = clock.match(/^(\d+):\d\d/);
  return m ? `${Number(m[1]) + 1}'` : "";
};

const scoreLine = (g: GameRow, away: number | null, home: number | null) => `${g.away_name} ${away ?? 0}-${home ?? 0} ${g.home_name}`;

/** "Matthew Reed (Assist by Carter Derksen and Edward Morales)" → "Matthew Reed, assisted by Carter Derksen and Edward Morales". */
function goalText(text: string): string {
  return text
    .replace(/\s*\(unassisted\)/i, "")
    .replace(/\s*\(Assists? by ([^)]+)\)/i, ", assisted by $1")
    .trim();
}

/** Everything that has happened in a game so far, as alerts (keys are stable, so only new ones go out). */
export function eventsOf(g: GameRow, box: GameBoxscore | null): Pending[] {
  const out: Pending[] = [];
  const started = g.state === "I" || g.state === "F";
  if (started) {
    out.push({ key: "kickoff", kind: "kickoff", title: `Kick-off: ${g.away_name} at ${g.home_name}`, body: "The game is under way. Tap for live stats." });
  }
  for (const goal of box?.goals ?? []) {
    const team = box!.teams.find((t) => t.seo === goal.seo)?.name ?? "";
    out.push({
      // The score after the goal names it, and stays the same if NCAA corrects the minute later.
      key: `goal:${goal.awayScore ?? "?"}-${goal.homeScore ?? "?"}`,
      kind: "goals",
      title: `⚽ Goal${team ? ` — ${team}` : ""}`,
      body: `${goalText(goal.text)}${minute(goal.time) ? ` ${minute(goal.time)}` : ""}\n${scoreLine(g, goal.awayScore, goal.homeScore)}`,
    });
  }
  for (const t of box?.teams ?? []) {
    const reds = t.stats?.redCards ?? 0;
    const plays = (box?.plays ?? []).filter((p) => p.kind === "red" && p.seo === t.seo);
    for (let n = 1; n <= reds; n++) {
      const play = plays[n - 1];
      out.push({
        key: `red:${t.seo}:${n}`,
        kind: "red_cards",
        title: `🟥 Red card — ${t.name}`,
        body: `${play ? `${play.text.replace(/^Red card: /, "")} ${minute(play.clock)}`.trim() : `${t.name} are down a player.`}\n${scoreLine(g, g.away_score, g.home_score)}`,
      });
    }
  }
  const period = (box?.period || g.period || "").toUpperCase();
  const pastHalf = /^HALF|HALFTIME|2ND|OT|FINAL/.test(period) || g.state === "F";
  if (started && pastHalf) {
    out.push({ key: "half", kind: "halftime", title: `Half-time: ${g.away_name} vs ${g.home_name}`, body: scoreLine(g, g.away_score, g.home_score) });
  }
  if (g.state === "F") {
    const extra = g.final_message && /OT|PK/i.test(g.final_message) ? ` (${g.final_message.replace(/^FINAL\s*/i, "").replace(/[()]/g, "")})` : "";
    out.push({ key: "final", kind: "final", title: `Final${extra}: ${g.away_name} vs ${g.home_name}`, body: scoreLine(g, g.away_score, g.home_score) });
  }
  return out;
}

async function checkGame(g: GameRow) {
  const sent = sentKeys(g.contest_id);
  const started = g.state === "I" || g.state === "F";
  if (!started && sent.has(SEEN)) return;
  if (!started) return void claim(g.contest_id, SEEN);
  // Finished games only need their final alert; skip the box score once that's out.
  if (g.state === "F" && sent.has("final")) return;
  let box: GameBoxscore | null = null;
  try {
    box = await fetchGameBoxscore(g.contest_id);
  } catch (err) {
    console.error(`[alerts] game ${g.contest_id}: ${(err as Error).message}`);
  }
  const events = eventsOf(g, box);
  // First seen mid-game (e.g. a new deploy): record what already happened without sending it.
  if (!sent.has(SEEN)) {
    claim(g.contest_id, SEEN);
    for (const e of events) claim(g.contest_id, e.key);
    return;
  }
  for (const e of events) {
    if (sent.has(e.key) || !claim(g.contest_id, e.key)) continue;
    const users = followersFor([g.home_seo, g.away_seo], e.kind);
    if (!users.length) continue;
    const result = await sendToUsers(
      users,
      { title: e.title, body: e.body, url: `/ncaa/game/${g.contest_id}`, tag: `game-${g.contest_id}-${e.key}` },
      e.kind === "final" ? 6 * 60 * 60 : 30 * 60, // a goal alert is stale after half an hour
    );
    console.log(`[alerts] ${g.contest_id} ${e.key}: sent ${result.sent}, failed ${result.failed}`);
  }
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const teams = starredTeams();
    const today = teamToday();
    // Late games can run past midnight.
    const games = [...gamesOn(shiftDate(today, -1)), ...gamesOn(today)].filter(
      (g) => (teams.has(g.home_seo) || teams.has(g.away_seo)) && (g.game_date === today || g.state !== "F" || !sentKeys(g.contest_id).has("final")),
    );
    for (const g of games) await checkGame(g);
  } catch (err) {
    console.error(`[alerts] ${(err as Error).message}`);
  } finally {
    running = false;
  }
}

let started = false;
export function startGameAlerts() {
  if (started || process.env.NCAA_SYNC === "off") return;
  started = true;
  setTimeout(() => void tick(), 45_000);
  setInterval(() => void tick(), TICK_MS);
}
