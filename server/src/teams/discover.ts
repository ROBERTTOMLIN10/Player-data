import { getDb } from "../db/connection.js";
import { fetchText } from "../ncaa/client.js";
import { standingsWithMovement } from "../ncaa/store.js";
import { teamToday } from "../lib/readiness.js";
import { TEAM_SITES, type TeamPlatform } from "./sites.js";

/**
 * Finds every D1 team's athletics website (from its NCAA.com school page) and
 * which platform it runs, so their squads can be read. Teams on platforms we
 * can't read yet are stored as 'other' and retried monthly, in case they move.
 */

const REDISCOVER_DAYS = 30;
const CONCURRENCY = 8;

/** Hosts on NCAA.com school pages that aren't the school's athletics site. */
const NOT_ATHLETICS =
  /(^|\.)(ncaa\.(com|org)|ncaastudios\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|tiktok\.com|apple\.com|google\.com|turner\.com|warnerbros\.com|wbd\.com|cbssports\.com|onetrust\.com|w3\.org|schema\.org|googletagmanager\.com|doubleclick\.net|amazon\.com|ticketmaster\.com|cloudfront\.net|akamaihd\.net|brightcove\.net|linkedin\.com|snapchat\.com|pinterest\.com|nflxext\.com)$/i;

/** The athletics site linked from a school's NCAA.com page. */
export async function athleticsHost(seo: string): Promise<string | null> {
  const html = await fetchText(`https://www.ncaa.com/schools/${seo}`);
  // The school's own links sit in the page's school info block; take the first outside link there, else anywhere.
  const info = html.match(/class="[^"]*school-(?:info|links|details)[^"]*"[\s\S]{0,4000}/)?.[0] ?? "";
  for (const chunk of [info, html]) {
    for (const m of chunk.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
      try {
        const host = new URL(m[1]).hostname.replace(/^www\./, "").toLowerCase();
        if (!NOT_ATHLETICS.test(host) && !host.endsWith(".edu")) return host;
      } catch {
        /* not a URL */
      }
    }
  }
  return null;
}

/** What a men's soccer roster page runs on (following redirects to the site's current host). */
export async function detectPlatform(host: string): Promise<{ host: string; platform: TeamPlatform | "other" }> {
  const res = await fetch(`https://${host}/sports/mens-soccer/roster`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; FAU men's soccer staff app)" },
    signal: AbortSignal.timeout(20_000),
  });
  const finalHost = new URL(res.url).hostname.replace(/^www\./, "");
  if (!res.ok) return { host: finalHost, platform: "other" };
  const html = await res.text();
  if (html.includes("__NUXT_DATA__") && /rosterPlayerId|"roster"/.test(html)) return { host: finalHost, platform: "sidearm" };
  if (html.includes("sidearm-roster-player")) return { host: finalHost, platform: "sidearm-classic" };
  return { host: finalHost, platform: "other" };
}

/** Every D1 team this season (the NCAA.com conference standings). */
export function d1Teams(): string[] {
  const year = Number(teamToday().slice(0, 4));
  return [...new Set(standingsWithMovement(year).flatMap((c) => c.rows.map((r) => r.seo)))];
}

/** Runs `fn` over `items`, `n` at a time. */
export async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

/** Finds the site and platform for D1 teams not looked up yet (or not readable last time, monthly). */
export async function discoverTeamSites(): Promise<{ checked: number; readable: number }> {
  const db = getDb();
  const known = new Map(
    (db.prepare("SELECT team_seo, platform, discovered_at FROM team_sites").all() as { team_seo: string; platform: string; discovered_at: string | null }[]).map(
      (r) => [r.team_seo, r],
    ),
  );
  const stale = (at: string | null) => !at || Date.now() - Date.parse(`${at.replace(" ", "T")}Z`) > REDISCOVER_DAYS * 86400_000;
  const todo = d1Teams().filter((seo) => {
    if (TEAM_SITES[seo]) return false; // checked by hand
    const k = known.get(seo);
    return !k || (k.platform === "other" && stale(k.discovered_at));
  });
  const save = db.prepare(
    `INSERT INTO team_sites (team_seo, host, platform, discovered_at, last_error) VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(team_seo) DO UPDATE SET host = excluded.host, platform = excluded.platform, discovered_at = excluded.discovered_at,
       last_error = excluded.last_error`,
  );
  let readable = 0;
  await pool(todo, CONCURRENCY, async (seo) => {
    try {
      const found = await athleticsHost(seo);
      if (!found) {
        save.run(seo, "", "other", "No athletics site on the NCAA.com school page");
        return;
      }
      const { host, platform } = await detectPlatform(found);
      save.run(seo, host, platform, platform === "other" ? "Site platform not supported yet" : null);
      if (platform !== "other") readable++;
    } catch (err) {
      save.run(seo, "", "other", (err as Error).message.slice(0, 300));
    }
  });
  if (todo.length) console.log(`[teams] discovery: ${todo.length} checked, ${readable} readable`);
  return { checked: todo.length, readable };
}
